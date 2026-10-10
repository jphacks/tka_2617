"""学習済み重みで初回と再推論の時間を計測する。"""

import argparse
import json
import time
from pathlib import Path

import cv2

from pitari.models import Models, ROOT, WEIGHT_NAME


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    parser.add_argument("--category", choices=["short_sleeve_top", "trousers"], required=True)
    parser.add_argument("--bbox", type=float, nargs=4, required=True)
    args = parser.parse_args()
    if not (ROOT / "models" / WEIGHT_NAME).is_file():
        raise SystemExit("学習済み重みが未配置です。READMEの手順でmodels/に置いてください。未学習の重みでは計測しません。")
    import numpy as np
    image = cv2.imdecode(np.fromfile(args.image, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit("画像を読み込めません")
    models = Models()
    timings = []
    for _ in range(3):
        started = time.perf_counter()
        points = models.landmarks(image, args.category, args.bbox)
        timings.append(round(time.perf_counter() - started, 3))
    print(json.dumps({"seconds": timings, "modelLoadMs": models.load_ms, "points": points}, ensure_ascii=False))


if __name__ == "__main__":
    main()
