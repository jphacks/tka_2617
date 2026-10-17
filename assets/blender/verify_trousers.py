"""
ズボンのサイズ合わせの検証

ブラウザと同じ計算（(MᵀM + λI) × キー = Mᵀ × (実寸 − 基準寸法)。基準寸法と M はその体型・身長の値を補間）で
キーの値を出し、その形のジーンズをメッシュ上で計測して、入力した実寸との差を確かめる。
ヒップとわたり幅はほぼ同じ高さを測るので強く連動し、写真の寸法どうしが矛盾することがある。
そのため M をそのまま解かず、キーの値が大きくなりすぎないよう λ で抑える（λ = RIDGE）。

入力の実寸は、サイズキーの値を変えた形を実際に測って作る（どれも作れる形なので、矛盾がない）。
矛盾する寸法（わたり幅だけ大きいなど）は、キーの値の大きさだけを出す（合否には使わない）。

実行（リポジトリのルートで、build_trousers.py の後に）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background assets/blender/out/build_trousers.blend --python assets/blender/verify_trousers.py

合格条件：標準体型は全項目 ±0.5cm 以内、ほかの体型は ±1cm 以内。不合格なら終了コード 1
女性（build_trousers.py -- female の後に）は、out/build_trousers_female.blend を開いて -- female を付ける。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
import pitari_female as pf  # noqa: E402
import pitari_tshirt as pt  # noqa: E402
import pitari_trousers as tr  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, "apps", "web", "public", "models")
GENDER = pf.gender_from_args()
TOL = {"standard": 0.5}
TOL_OTHER = 1.0
RIDGE = 0.01                # キーの値を抑える強さ。web の RIDGE と同じ値にする
HEIGHTS_CM = [150.0, 160.0, 185.0, 195.0]
# 入力の実寸を作るときのサイズキーの値（waist, hip, thigh, rise, inseam, hem）
KEY_SETS = [
    (0, 0, 0, 0, 0, 0), (5, 3, 1, 2, 4, 2), (-4, -2, -1, -2, -3, -2), (10, 0, 0, 3, 6, 0),
    (0, 6, 2, 0, 0, 4), (-6, 4, -1, 2, -5, 3), (3, -3, 2, -2, 8, -2), (8, 8, 3, 4, 2, 6),
]
# 矛盾する寸法（基準寸法からの差）。キーの値が暴れないかだけを見る
CONFLICTS = [
    ("わたり幅だけ +5", (0, 0, 5, 0, 0, 0)),
    ("ヒップだけ −8", (0, -8, 0, 0, 0, 0)),
    ("わたり幅 +4・ヒップ −4", (0, -4, 4, 0, 0, 0)),
]


def fit_at(build, height_cm, table):
    """ブラウザの fitAt と同じ計算：前後の身長の基準寸法と M を直線で補間する（範囲の外は端の値）"""
    samples = table["builds"][build]
    hs = [s["height_cm"] for s in samples]
    h = min(max(height_cm, hs[0]), hs[-1])
    i = min(max(int(np.searchsorted(hs, h)) - 1, 0), len(hs) - 2)
    lo, hi = samples[i], samples[i + 1]
    t = (h - lo["height_cm"]) / (hi["height_cm"] - lo["height_cm"])
    parts = table["parts"]
    base_b = {p: lo["base"][p] * (1 - t) + hi["base"][p] * t for p in parts}
    M = np.array(lo["m"]) * (1 - t) + np.array(hi["m"]) * t
    return base_b, M


def key_values(target, base_b, M, parts, ridge=RIDGE):
    """ブラウザの trouserKeyValues と同じ計算：(MᵀM + λI) × キー = Mᵀ × (実寸 − 基準)"""
    diff = np.array([target[p] - base_b[p] for p in parts])
    k = np.linalg.solve(M.T @ M + ridge * np.eye(len(parts)), M.T @ diff)
    return {p: float(v) for p, v in zip(parts, k)}


def main():
    jeans = bpy.data.objects["jeans"]
    with open(os.path.join(HERE, "out", pf.landmarks_file("trousers", GENDER)), encoding="utf-8") as fp:
        lm = json.load(fp)
    with open(os.path.join(MODELS, f"trousers_{GENDER}_height.json"), encoding="utf-8") as fp:
        table = json.load(fp)
    parts = table["parts"]
    polys = pt.polys_of(jeans)
    standard_cm = table["standard_cm"]
    ok = True
    for b in pt.BUILDS:
        tol = TOL.get(b, TOL_OTHER)
        for h_cm in [standard_cm] + HEIGHTS_CM:
            h = h_cm - standard_cm
            base_b, M = fit_at(b, h_cm, table)
            worst = 0.0
            for ks in KEY_SETS:
                truth = dict(zip(parts, ks))
                target = tr.measure_trousers(pt.mixed_coords(jeans, pt.build_values(b, truth, h)), lm, polys)[0]
                k = key_values(target, base_b, M, parts)
                got = tr.measure_trousers(pt.mixed_coords(jeans, pt.build_values(b, k, h)), lm, polys)[0]
                err = {p: got[p] - target[p] for p in parts}
                e = max(abs(v) for v in err.values())
                worst = max(worst, e)
                if e > tol:
                    ok = False
                    pt.log(f"NG {b} {h_cm:.1f}cm キー {ks}: 誤差 " + ", ".join(f"{p} {v:+.2f}" for p, v in err.items()))
            pt.log(f"{b:10s} {h_cm:6.1f}cm  最大誤差 {worst:.2f}cm（許容 ±{tol}cm）{'OK' if worst <= tol else 'NG'}")

    base_b, M = fit_at("standard", standard_cm, table)
    for name, off in CONFLICTS:
        target = {p: base_b[p] + o for p, o in zip(parts, off)}
        k = key_values(target, base_b, M, parts)
        got = tr.measure_trousers(pt.mixed_coords(jeans, pt.build_values("standard", k)), lm, polys)[0]
        pt.log(f"[矛盾: {name}] キー " + ", ".join(f"{p} {v:+.2f}" for p, v in k.items())
               + " / 入力との差 " + ", ".join(f"{p} {got[p] - target[p]:+.2f}" for p in parts))

    pt.log("合格" if ok else "不合格")
    if bpy.app.background and not ok:
        sys.exit(1)


main()
