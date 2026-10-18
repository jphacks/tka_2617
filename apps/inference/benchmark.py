"""学習済み重みで、ランドマークの推論とテクスチャ1件の時間を計測する。

  ランドマーク：python benchmark.py landmarks 写真.jpg --category short_sleeve_top --bbox x1 y1 x2 y2
  テクスチャ：python benchmark.py texture textures/{作業フォルダ} --out 出力先
"""

import argparse
import json
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from pitari.models import Models, ROOT, WEIGHT_NAME


def landmarks(args):
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


def texture(args):
    """作業フォルダのinput_*.jpgから作り直す。1回目はモデルの読み込みを含むので、2回目以降も測る。"""
    from pitari import texture as jobs

    job = json.loads((args.folder / "job.json").read_text(encoding="utf-8"))
    views = {view: {"photo": args.folder / f"input_{view}.jpg"} for view in ("front", "back") if (args.folder / f"input_{view}.jpg").is_file()}
    inference = jobs.photo_to_texture.Inference(Models())
    runs = []
    with tempfile.TemporaryDirectory() as scratch:
        for number in range(args.repeat):
            out = (args.out or Path(scratch)) / f"run{number + 1}"
            started = time.perf_counter()
            report = jobs.photo_to_texture.make_texture(out, views, inference, category=job["category"])
            runs.append({"seconds": round(time.perf_counter() - started, 2), "timingsMs": report["timingsMs"], "coverage": report["coverage"]})
            if args.reference:
                runs[-1]["differsFromReference"] = differs(out / "texture.png", args.reference)
    print(json.dumps({"category": job["category"], "runs": runs}, ensure_ascii=False, indent=2))


def differs(path, reference):
    """色の差が8を超えるテクセルの割合。高速化の前後で結果が変わっていないかを見る。"""
    made = np.asarray(Image.open(path), dtype=np.int16)
    expected = np.asarray(Image.open(reference), dtype=np.int16)
    return round(float((np.abs(made - expected).max(axis=2) > 8).mean()), 5)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    pose = commands.add_parser("landmarks")
    pose.add_argument("image", type=Path)
    pose.add_argument("--category", choices=["short_sleeve_top", "long_sleeve_top", "trousers"], required=True)
    pose.add_argument("--bbox", type=float, nargs=4, required=True)
    job = commands.add_parser("texture")
    job.add_argument("folder", type=Path, help="input_front.jpgとjob.jsonがある作業フォルダ")
    job.add_argument("--out", type=Path, help="結果を残すフォルダ。省略すると一時フォルダに作って消す")
    job.add_argument("--repeat", type=int, default=2)
    job.add_argument("--reference", type=Path, help="比べるtexture.png")
    args = parser.parse_args()
    if not (ROOT / "models" / WEIGHT_NAME).is_file():
        raise SystemExit("学習済み重みが未配置です。READMEの手順でmodels/に置いてください。未学習の重みでは計測しません。")
    {"landmarks": landmarks, "texture": texture}[args.command](args)


if __name__ == "__main__":
    main()
