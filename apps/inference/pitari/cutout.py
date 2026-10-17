"""服の範囲と背景の色から、表示用の透過PNGを作る。"""

import cv2
import numpy as np

# DeepFashion2のズボンの点を、写真の輪郭に沿う順に並べたもの。9番（股）で脚の間へ折り返す。
TROUSERS_OUTLINE = [1, 2, 3, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4]


def landmark_outline(points, category):
    """点がそろったズボンの輪郭を返す。"""
    outline = {"trousers": TROUSERS_OUTLINE}.get(category)
    if outline is None:
        return None
    by_id = {int(p["id"]): (p["x"], p["y"]) for p in points}
    if not all(number in by_id for number in outline):
        return None
    return np.array([by_id[number] for number in outline], dtype=float)


def garment_alpha(image, bbox, paper_corners, points=(), category=None):
    """写真と同じ大きさの服の領域（0か255）。切り詰めない。"""
    height, width = image.shape[:2]
    scale = min(1.0, 900 / max(height, width))
    small = cv2.resize(image, (round(width * scale), round(height * scale)))
    h, w = small.shape[:2]
    x1, y1, x2, y2 = np.rint(np.array(bbox) * scale).astype(int)
    x1, y1, x2, y2 = max(1, x1), max(1, y1), min(w - 2, x2), min(h - 2, y2)
    if x2 - x1 < 10 or y2 - y1 < 10:
        raise ValueError("服の範囲が小さすぎます")
    if np.max(np.std(small.reshape(-1, 3).astype(np.float32), axis=0)) < 1:
        raise ValueError("服と背景を分離できませんでした")
    mask = np.full((h, w), cv2.GC_BGD, dtype=np.uint8)
    mask[y1:y2 + 1, x1:x2 + 1] = cv2.GC_PR_FGD
    outline = landmark_outline(points, category)
    if outline is not None:
        # 服の範囲が写真のほぼ全体だと背景の色を学べず、脚の間の床が残る。
        # 点の輪郭の外側を背景の候補にし、大きく外れた所は背景と決める。点は輪郭から少しずれるので、輪郭を広げてから外側を選ぶ。
        inside = np.zeros((h, w), np.uint8)
        cv2.fillPoly(inside, [np.rint(outline * scale).astype(np.int32)], 1)
        margin = max(3, round(0.02 * max(x2 - x1, y2 - y1)))
        near = cv2.dilate(inside, np.ones((2 * margin + 1, 2 * margin + 1), np.uint8))
        far = cv2.dilate(inside, np.ones((6 * margin + 1, 6 * margin + 1), np.uint8))
        mask[(near == 0) & (mask == cv2.GC_PR_FGD)] = cv2.GC_PR_BGD
        mask[far == 0] = cv2.GC_BGD
    if len(paper_corners) == 4:
        polygon = np.rint(np.array(paper_corners) * scale).astype(np.int32)
        cv2.fillConvexPoly(mask, polygon, cv2.GC_BGD)
    cv2.grabCut(small, mask, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    alpha = np.isin(mask, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(alpha)
    if count < 2:
        raise ValueError("服と背景を分離できませんでした")
    largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    alpha = (labels == largest).astype(np.uint8) * 255
    if np.count_nonzero(alpha) < 100:
        raise ValueError("服を検出できませんでした")
    return cv2.resize(alpha, (width, height), interpolation=cv2.INTER_NEAREST)


def garment_cutout(image, bbox, paper_corners, points=(), category=None):
    alpha = garment_alpha(image, bbox, paper_corners, points, category)
    height, width = image.shape[:2]
    ys, xs = np.where(alpha > 0)
    left, top = max(0, xs.min() - 2), max(0, ys.min() - 2)
    right, bottom = min(width, xs.max() + 3), min(height, ys.max() + 3)
    return np.dstack([image, alpha])[top:bottom, left:right]
