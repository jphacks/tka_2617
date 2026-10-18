"""切り抜きまで済んだ写真の、服の範囲・点・A4の角・服の領域を、テクスチャの作業で使い回す。

採寸と裏面の登録は、同じJPEGを/detectに送ってから、そのままStorageに保存する。
テクスチャの作業はその写真を受け取るので、JPEGのハッシュが同じなら推論をやり直さなくてよい。
"""

import hashlib
import json
import logging
import os
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / ".cache/detections"
# 写真を撮り直すたびに増えるので、新しいものから残す数を決めておく。
KEEP = 200
logger = logging.getLogger("pitari")


def photo_key(raw):
    return hashlib.sha256(raw).hexdigest()


def remember(raw, width, height, category, bbox, paper_corners, points, mask, model_version):
    """maskは写真と同じ大きさの0か255。書きかけのファイルを読まないよう、書き終えてから置き換える。

    記録は推論を省くためだけのものなので、書けなくても例外を出さず、/detectの結果を返せるようにする。
    """
    ok, encoded = cv2.imencode(".png", mask)
    if not ok:
        return
    png = encoded.tobytes()
    # テクスチャの作業は/detectのロックの外で読むので、別の点で切り抜き直した.pngと古い.jsonが組にならないよう照合する。
    record = {"widthPx": width, "heightPx": height, "category": category, "bbox": [float(v) for v in bbox],
              "paperCorners": [[float(x), float(y)] for x, y in paper_corners], "points": points, "modelVersion": model_version,
              "maskSha256": hashlib.sha256(png).hexdigest()}
    key = photo_key(raw)
    try:
        FOLDER.mkdir(parents=True, exist_ok=True)
        for suffix, data in ((".png", png), (".json", json.dumps(record, ensure_ascii=False).encode("utf-8"))):
            partial = FOLDER / f"{key}{suffix}.partial"
            partial.write_bytes(data)
            os.replace(partial, FOLDER / f"{key}{suffix}")
        forget_old()
    except OSError:
        logger.warning("切り抜きの記録を残せませんでした", exc_info=True)


def recall(raw, width, height, category):
    """同じ写真・大きさ・種類で切り抜いた結果。なければNone。"""
    key = photo_key(raw)
    try:
        record = json.loads((FOLDER / f"{key}.json").read_text(encoding="utf-8"))
        png = (FOLDER / f"{key}.png").read_bytes()
    except (OSError, ValueError):
        return None
    if record.get("maskSha256") != hashlib.sha256(png).hexdigest():
        return None
    mask = cv2.imdecode(np.frombuffer(png, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if mask is None or record.get("category") != category or [record.get("widthPx"), record.get("heightPx")] != [width, height] or mask.shape != (height, width):
        return None
    return {**record, "mask": mask}


def forget_old():
    records = sorted(FOLDER.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in records[KEEP:]:
        path.unlink(missing_ok=True)
        path.with_suffix(".png").unlink(missing_ok=True)
