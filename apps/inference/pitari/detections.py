"""切り抜きまで済んだ写真の、服の範囲・点・A4の角・服の領域を、テクスチャの作業で使い回す。

採寸と裏面の登録は、同じJPEGを/detectに送ってから、そのままStorageに保存する。
テクスチャの作業はその写真を受け取るので、JPEGのハッシュが同じなら推論をやり直さなくてよい。
"""

import hashlib
import json
import os
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / ".cache/detections"
# 写真を撮り直すたびに増えるので、新しいものから残す数を決めておく。
KEEP = 200


def photo_key(raw):
    return hashlib.sha256(raw).hexdigest()


def remember(raw, width, height, category, bbox, paper_corners, points, mask, model_version):
    """maskは写真と同じ大きさの0か255。書きかけのファイルを読まないよう、書き終えてから置き換える。"""
    FOLDER.mkdir(parents=True, exist_ok=True)
    key = photo_key(raw)
    ok, encoded = cv2.imencode(".png", mask)
    if not ok:
        return
    record = {"widthPx": width, "heightPx": height, "category": category, "bbox": [float(v) for v in bbox],
              "paperCorners": [[float(x), float(y)] for x, y in paper_corners], "points": points, "modelVersion": model_version}
    for suffix, data in ((".png", encoded.tobytes()), (".json", json.dumps(record, ensure_ascii=False).encode("utf-8"))):
        partial = FOLDER / f"{key}{suffix}.partial"
        partial.write_bytes(data)
        os.replace(partial, FOLDER / f"{key}{suffix}")
    forget_old()


def recall(raw, width, height, category):
    """同じ写真・大きさ・種類で切り抜いた結果。なければNone。"""
    key = photo_key(raw)
    try:
        record = json.loads((FOLDER / f"{key}.json").read_text(encoding="utf-8"))
        mask = cv2.imdecode(np.fromfile(FOLDER / f"{key}.png", dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    except (OSError, ValueError):
        return None
    if mask is None or record.get("category") != category or [record.get("widthPx"), record.get("heightPx")] != [width, height] or mask.shape != (height, width):
        return None
    return {**record, "mask": mask}


def forget(raw):
    """服を消したときに、その写真の記録を消す。"""
    key = photo_key(raw)
    (FOLDER / f"{key}.json").unlink(missing_ok=True)
    (FOLDER / f"{key}.png").unlink(missing_ok=True)


def forget_old():
    records = sorted(FOLDER.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in records[KEEP:]:
        path.unlink(missing_ok=True)
        path.with_suffix(".png").unlink(missing_ok=True)
