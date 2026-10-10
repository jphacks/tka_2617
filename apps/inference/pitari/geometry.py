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
        points = polygon[:, 0, :].astype(np.float32)
        center = points.mean(axis=0)
        points = points[np.argsort(np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0]))]
        points = np.roll(points, -np.argmin(points.sum(axis=1)), axis=0)
        sides = np.linalg.norm(points - np.roll(points, -1, axis=0), axis=1)
        ratio = max(sides[0] + sides[2], sides[1] + sides[3]) / max(1, min(sides[0] + sides[2], sides[1] + sides[3]))
        if 1.1 < ratio < 2.1:
            candidates.append((abs(ratio - 29.7 / 21), points))
    return min(candidates, key=lambda item: item[0])[1].tolist() if candidates else []


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
    start, count = (0, 25) if category == "short_sleeve_top" else (168, 14)
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
