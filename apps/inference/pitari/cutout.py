"""服の範囲と背景の色から、表示用の透過PNGを作る。"""

import cv2
import numpy as np


def garment_cutout(image, bbox, paper_corners):
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
    alpha = cv2.resize(alpha, (width, height), interpolation=cv2.INTER_NEAREST)
    ys, xs = np.where(alpha > 0)
    left, top = max(0, xs.min() - 2), max(0, ys.min() - 2)
    right, bottom = min(width, xs.max() + 3), min(height, ys.max() + 3)
    return np.dstack([image, alpha])[top:bottom, left:right]
