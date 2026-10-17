"""合成の写真でphoto_to_texture.pyの動作を確かめる。実際の服の写真での検証ではない。

カラーグリッド（check/check_grid.png）の前面・背面の島を、決まった回転・縮小で写真風の画像に置く。
テンプレートの固定点を同じ変換で移した「正解の点」と服の領域で変換し直し、元の画像とどれだけ一致するかを測る。
--with-modelを付けると、同じ合成写真で既存の推論も動かし、推論の点と正解の点の差を記録する。

使い方（リポジトリ直下）：
  ./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/selftest_synthetic.py [--with-model]
"""

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))
from uv_pixels import pixel_to_opencv  # noqa: E402
from photo_to_texture import TEMPLATE_ROOTS, df2_table

OUT = ROOT / "trials" / "selftest"
CANVAS = (1200, 1600)
# 写真ごとの回転（度）と縮小。前面と背面で変える。
POSES = {"front": (3.0, 0.95), "back": (-2.0, 0.92)}


def synthetic_photo(view, grid, island, template):
    """島の画像を回転・縮小して背景とA4の上に置く。テクスチャのピクセル座標→写真の座標の変換も返す。"""
    angle, scale = POSES[view]
    ys, xs = np.nonzero(island)
    # 長そでは袖を広げたUVが横長なので、袖口がキャンバスから切れない倍率にする。
    scale = min(scale, (CANVAS[0] - 120) / (xs.max() - xs.min() + 1), 1000 / (ys.max() - ys.min() + 1))
    center = np.array([(xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2])
    rotation = scale * np.array([[math.cos(math.radians(angle)), -math.sin(math.radians(angle))], [math.sin(math.radians(angle)), math.cos(math.radians(angle))]])
    destination = np.array([600.0, 620.0])
    # 画素の角を原点とする座標での変換 p' = R p + t。OpenCVの画素中心の座標へ直してからwarpAffineに渡す。
    shift = destination - rotation @ center
    shift_cv = shift + rotation @ [0.5, 0.5] - [0.5, 0.5]
    matrix = np.hstack([rotation, shift_cv[:, None]])
    rgba = np.dstack([grid, np.where(island, 255, 0).astype(np.uint8)])
    warped = cv2.warpAffine(rgba, matrix, CANVAS, flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    rng = np.random.default_rng(1)
    background = np.clip(np.array([196, 200, 205]) + rng.normal(0, 4, (CANVAS[1], CANVAS[0], 3)), 0, 255)
    paper = np.array([[860, 1170], [1110, 1170], [1110, 1524], [860, 1524]], np.int32)
    cv2.fillConvexPoly(background, paper, (250, 250, 248))
    alpha = warped[..., 3:4].astype(np.float32) / 255
    photo = (warped[..., :3] * alpha + background * (1 - alpha)).astype(np.uint8)
    mask = warped[..., 3] > 127

    def transform(pixel):
        return rotation @ np.asarray(pixel, dtype=float) + shift

    table = df2_table(template["views"][view])
    points = []
    for number, entry in table.items():
        anchor = template["anchors"].get(entry["anchor"]) if entry["anchor"] else None
        if anchor is None or view not in anchor["uv_by_view"] or entry["use"] == "not_on_this_view":
            continue
        x, y = pixel_to_opencv(transform(anchor["uv_by_view"][view]["pixel"]))
        points.append({"id": int(number), "x": round(float(x), 2), "y": round(float(y), 2), "score": None, "source": "synthetic_truth"})
    ys, xs = np.nonzero(mask)
    record = {
        "imageId": f"synthetic_{view}.png",
        "view": view,
        "widthPx": CANVAS[0],
        "heightPx": CANVAS[1],
        "pixelConvention": "opencv_center",
        "bbox": [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())],
        "paperCorners": paper.astype(float).tolist(),
        "points": sorted(points, key=lambda p: p["id"]),
        "auxPoints": [],
    }
    return photo, mask, record


def compare(reference, result_dir, template, part_id):
    texture = np.array(Image.open(result_dir / "texture.png").convert("RGB")).astype(np.int16)
    observed = np.array(Image.open(result_dir / "coverage_observed.png")) > 0
    error = np.abs(texture - reference).mean(axis=2)
    heat = np.zeros(reference.shape, np.uint8)
    heat[observed] = np.stack([np.clip(error[observed] * 4, 0, 255), np.full(observed.sum(), 40), np.clip(255 - error[observed] * 4, 0, 255)], axis=1).astype(np.uint8)
    Image.fromarray(heat, "RGB").save(result_dir / "selftest_error.png")
    values = {name: int(v) for v, name in template["part_id_image"]["values"].items() if v != "0"}
    summary = {
        "mean_abs_error": round(float(error[observed].mean()), 2),
        "texels_error_over_48": round(float((error[observed] > 48).mean()), 4),
        "by_part": {},
    }
    for name, value in values.items():
        selection = observed & (part_id == value)
        if selection.any():
            summary["by_part"][name] = {"mean_abs_error": round(float(error[selection].mean()), 2), "texels_error_over_48": round(float((error[selection] > 48).mean()), 4)}
    return summary


def main():
    global ROOT, OUT
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", choices=["short_sleeve_top", "long_sleeve_top", "shirt"], default="short_sleeve_top")
    parser.add_argument("--with-model", action="store_true", help="既存の推論でも点を求めて比べる（数十秒かかる）")
    args = parser.parse_args()
    ROOT = TEMPLATE_ROOTS[args.category]
    OUT = SCRIPTS.parent / "trials" / ("selftest" if args.category == "short_sleeve_top" else f"selftest_{args.category}")
    template = json.loads((ROOT / "uv_template.json").read_text(encoding="utf-8"))
    grid = np.array(Image.open(ROOT / "check/check_grid.png").convert("RGB"))
    part_id = np.array(Image.open(ROOT / template["part_id_image"]["path"]))
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    truth = {}
    for view in ("front", "back"):
        island = np.array(Image.open(ROOT / template["islands"][view]["mask"])) > 0
        photo, mask, record = synthetic_photo(view, grid, island, template)
        files[view] = {"photo": OUT / f"synthetic_{view}.png", "mask": OUT / f"synthetic_mask_{view}.png", "points": OUT / f"synthetic_points_{view}.json"}
        Image.fromarray(photo).save(files[view]["photo"])
        Image.fromarray(np.where(mask, 255, 0).astype(np.uint8)).save(files[view]["mask"])
        files[view]["points"].write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        truth[view] = {p["id"]: np.array([p["x"], p["y"]]) for p in record["points"]}

    script = SCRIPTS / "photo_to_texture.py"
    report = {"note": "合成写真での動作確認。実際の服の写真での精度ではない"}
    # uv：合成写真はUV画像そのものなので、輪郭をUV上の長さで区切れば内部まで一致するはず（仕組みの検査）。
    # 3d：実写と同じ設定。合成写真では長さの前提が合わず、外側ほどずれる（実写の精度を表さない）。
    for fraction in ("uv", "3d"):
        command = [sys.executable, str(script), "--category", args.category, "--out", str(OUT / f"result_truth_{fraction}"), "--fraction", fraction]
        for view in ("front", "back"):
            command += [f"--{view}", str(files[view]["photo"]), f"--{view}-points", str(files[view]["points"]), f"--{view}-mask", str(files[view]["mask"])]
        subprocess.run(command, check=True)
        report[f"truth_points_fraction_{fraction}"] = compare(grid.astype(np.int16), OUT / f"result_truth_{fraction}", template, part_id)

    if args.with_model:
        command = [sys.executable, str(script), "--category", args.category, "--out", str(OUT / "result_model"), "--fraction", "uv"]
        for view in ("front", "back"):
            command += [f"--{view}", str(files[view]["photo"])]
        subprocess.run(command, check=True)
        report["model_points"] = {"texture": compare(grid.astype(np.int16), OUT / "result_model", template, part_id)}
        for view in ("front", "back"):
            detected = json.loads((OUT / "result_model" / f"points_{view}.json").read_text(encoding="utf-8"))["points"]
            distances = {p["id"]: round(float(np.linalg.norm(np.array([p["x"], p["y"]]) - truth[view][p["id"]])), 1) for p in detected if p["id"] in truth[view]}
            report["model_points"][view] = {"distance_px_by_id": distances, "missing_ids": sorted(set(truth[view]) - {p["id"] for p in detected})}
    (OUT / "selftest_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
