"""写真を変形せずに縮尺を求め、モデルの点を写真の座標に戻す。"""

import cv2
import numpy as np


def paper_scale(corners, width, height):
    points = np.asarray(corners, dtype=np.float32)
    if points.shape != (4, 2) or not np.isfinite(points).all():
        raise ValueError("A4の四隅を指定してください")
    if (points < 0).any() or (points[:, 0] >= width).any() or (points[:, 1] >= height).any():
        raise ValueError("A4の四隅を画像内に指定してください")
    if not cv2.isContourConvex(points) or abs(cv2.contourArea(points)) < 100:
        raise ValueError("A4の点を外周の順に並べてください")
    edges = np.roll(points, -1, axis=0) - points
    sides = np.linalg.norm(edges, axis=1)
    opposite = [(sides[0] + sides[2]) / 2, (sides[1] + sides[3]) / 2]
    short, long = sorted(opposite)
    scales = [short / 21, long / 29.7]
    # 真上撮影の前提を外れる場合、ゆがみを実寸として扱わない。
    cosines = np.abs(np.sum(edges * np.roll(edges, -1, axis=0), axis=1) / (sides * np.roll(sides, -1)))
    if max(scales) / min(scales) > 1.15 or max(cosines) > 0.2 or any(max(sides[i], sides[i + 2]) / min(sides[i], sides[i + 2]) > 1.15 for i in (0, 1)):
        raise ValueError("A4の四隅を調整するか、真上から撮り直してください")
    scale = float(sum(scales) / 2)
    if not 2 <= scale <= 100:
        raise ValueError("A4用紙の写る大きさを調整してください")
    return scale


def paper_candidate(image):
    """A4らしい四角形の四隅。白い四角形を優先し、見つからなければ輪郭線の四角形から選ぶ。"""
    white = white_candidates(image)
    if white:
        best = min(white, key=lambda item: item[0])[1]
        # しきい値ごとに縁が少しずつ動くので、同じ紙の候補の四隅を平均する
        same = [points for _, points in white if np.abs(points - best).max() < 10]
        return np.mean(same, axis=0).tolist()
    candidates = edge_candidates(image)
    return min(candidates, key=lambda item: item[0])[1].tolist() if candidates else []


def white_candidates(image):
    # 木の机のように紙と色が近い背景では輪郭線が途切れ、紙に触れた物があると線がつながるので、色からも探す。
    # 白い紙は3色とも明るい。ベージュの机や床は青が暗く、灰色の物は全体が暗い
    height, width = image.shape[:2]
    whiteness = cv2.GaussianBlur(image.min(axis=2), (5, 5), 0)
    otsu, _ = cv2.threshold(whiteness, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    candidates = []
    for threshold in sorted({max(int(otsu), 150), 170, 190, 210, 225}):
        mask = cv2.morphologyEx((whiteness >= threshold).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            area = cv2.contourArea(contour)
            if not width * height * 0.005 < area < width * height * 0.4:
                continue
            hull = cv2.convexHull(contour)
            polygon = cv2.approxPolyDP(hull, 0.02 * cv2.arcLength(hull, True), True)
            # 白い服や袋のように四角形でない物は、白い面積が四角形の面積に満たない
            if len(polygon) != 4 or area < 0.93 * cv2.contourArea(polygon):
                continue
            x, y, w, h = cv2.boundingRect(polygon)
            if x <= 1 or y <= 1 or x + w >= width - 1 or y + h >= height - 1:
                continue
            points = outer_edges(clockwise(polygon[:, 0, :].astype(np.float32)))
            try:
                paper_scale(points, width, height)
            except ValueError:
                continue
            candidates.append((a4_ratio_error(points), points))
    return candidates


def outer_edges(points):
    """白い画素の輪郭は外周の画素の中心を通り、紙の縁より半画素内側にあるので、各辺を半画素外へ出す。"""
    center = points.mean(axis=0)
    lines = []
    for start, end in zip(points, np.roll(points, -1, axis=0)):
        direction = (end - start) / max(np.linalg.norm(end - start), 1e-6)
        normal = np.array([-direction[1], direction[0]])
        if np.dot(normal, (start + end) / 2 - center) < 0:
            normal = -normal
        lines.append((start + normal * 0.5, direction))
    corners = []
    for (p, d), (q, e) in zip(lines, lines[1:] + lines[:1]):
        t = np.linalg.solve(np.array([d, -e]).T, q - p)[0]
        corners.append(p + d * t)
    # 交点は各辺の終わりの角なので、1つずらして始点の角から並べる
    return np.float32(np.roll(corners, 1, axis=0))


def edge_candidates(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    height, width = image.shape[:2]
    candidates = []
    for contour in contours:
        polygon = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
        area = cv2.contourArea(polygon)
        if len(polygon) != 4 or not cv2.isContourConvex(polygon):
            continue
        if not width * height * 0.005 < area < width * height * 0.4:
            continue
        points = clockwise(polygon[:, 0, :].astype(np.float32))
        if 1.1 < side_ratio(points) < 2.1:
            candidates.append((a4_ratio_error(points), points))
    return candidates


def clockwise(points):
    """画像の座標で時計回りに並べ、左上に近い点から始める。"""
    center = points.mean(axis=0)
    points = points[np.argsort(np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0]))]
    return np.roll(points, -np.argmin(points.sum(axis=1)), axis=0)


def side_ratio(points):
    sides = np.linalg.norm(points - np.roll(points, -1, axis=0), axis=1)
    return max(sides[0] + sides[2], sides[1] + sides[3]) / max(1, min(sides[0] + sides[2], sides[1] + sides[3]))


def a4_ratio_error(points):
    return abs(side_ratio(points) - 29.7 / 21)


def crop_transform(bbox, output_width=288, output_height=384):
    x1, y1, x2, y2 = bbox
    center = np.float32([(x1 + x2) / 2, (y1 + y2) / 2])
    width, height = x2 - x1, y2 - y1
    width = max(width, height * output_width / output_height) * 1.25
    height = width * output_height / output_width
    source = np.float32([center, center + [0, -height / 2], center + [width / 2, 0]])
    target = np.float32([[output_width / 2, output_height / 2], [output_width / 2, 0], [output_width, output_height / 2]])
    matrix = cv2.getAffineTransform(source, target)
    return matrix, cv2.invertAffineTransform(matrix)


def decode_heatmaps(heatmaps, inverse, category, width, height):
    start, count = {"short_sleeve_top": (0, 25), "long_sleeve_top": (25, 33), "trousers": (168, 14)}[category]
    if heatmaps.shape != (294, 96, 72):
        raise ValueError("モデルの出力形式がDeepFashion2用HRNetと一致しません")
    points = []
    for index, heatmap in enumerate(heatmaps[start:start + count]):
        y, x = np.unravel_index(np.argmax(heatmap), heatmap.shape)
        score = float(heatmap[y, x])
        if not np.isfinite(score) or score < 0.2:
            continue
        offset = np.zeros(2)
        if 1 < x < 71 and 1 < y < 95:
            offset = np.sign([heatmap[y, x + 1] - heatmap[y, x - 1], heatmap[y + 1, x] - heatmap[y - 1, x]]) * 0.25
        position = inverse @ np.array([(x + offset[0]) * 4, (y + offset[1]) * 4, 1])
        if 0 <= position[0] < width and 0 <= position[1] < height:
            points.append({"id": index + 1, "x": float(position[0]), "y": float(position[1]), "score": score})
    return points
