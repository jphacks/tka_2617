"""
男性アバター用のジーンズを生成して glb / JSON を書き出す（アバター本体は build_tshirt.py が書き出す）

実行（リポジトリのルートで）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background --python assets/blender/build_trousers.py

出力:
  apps/web/public/models/trousers_male.glb            ジーンズ（体型キー 3 個＋身長キー 2 個＋サイズキー 6 個）
  apps/web/public/models/trousers_male_height.json    標準の身長と、体型・身長ごとの基準寸法・キーの効き方 M・体の寸法
  assets/blender/out/trousers_landmarks.json          計測に使う頂点インデックス
  assets/blender/out/build_trousers.blend             確認用
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
import pitari_tshirt as pt  # noqa: E402
import pitari_trousers as tr  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, "apps", "web", "public", "models")
OUT = os.path.join(HERE, "out")
D = 10.0                    # +10cm の形を作ってから 0.1 倍で 1cm キーにする


def measure(P, lm, polys):
    return tr.measure_trousers(P, lm, polys)[0]


def make_size_key(jeans, part, lm, polys):
    """part の +10cm の形を作り（実測で +10.00cm になるよう倍率を探す）、0.1 倍で size_part にする。
    体からの押し出しはキーに入れない（理由は build_tshirt.make_size_key と同じ）"""
    B = pt.world_coords(jeans, "Basis")
    disp = tr.DISPLACEMENTS[part]
    base = measure(B, lm, polys)[part]

    def shape(k):
        return B + disp(B, lm, k)

    def gain(k):
        return measure(shape(k), lm, polys)[part] - base

    k = pt.solve_scale(gain, D)
    work = f"size_{part}_10"
    pt.set_key_from_world(jeans, work, shape(k))
    pt.key_from_mix(jeans, work, 1.0 / D, f"size_{part}")
    jeans.shape_key_remove(jeans.data.shape_keys.key_blocks[work])
    pt.log(f"size_{part}: 倍率 {k:.4f}, +10 の形で {gain(k):+.2f}cm")


def height_table(jeans, body, lm, polys, standard_cm):
    """体型ごとに、いくつかの身長で基準寸法とキーの効き方 M、体の寸法を測る（身長の昇順）"""
    heights = sorted(pt.HEIGHT_SAMPLES_CM + [round(standard_cm, 2)])
    body_polys = pt.polys_of(body)
    parts = tr.TROUSER_PARTS
    builds = {}
    for b in pt.BUILDS:
        builds[b] = []
        for h_cm in heights:
            h = h_cm - standard_cm

            def m(sizes):
                r = measure(pt.mixed_coords(jeans, pt.build_values(b, sizes, h)), lm, polys)
                return np.array([r[p] for p in parts])
            m0 = m({})
            M = np.column_stack([(m({p: 5}) - m({p: -5})) / 10 for p in parts])
            P0 = pt.mixed_coords(jeans, pt.build_values(b, {}, h))
            B0 = pt.mixed_coords(body, pt.build_values(b, None, h))
            body_m = tr.body_trouser_measures(B0, body_polys, P0, lm)
            builds[b].append({"height_cm": h_cm,
                              "body": {p: round(float(v), 2) for p, v in body_m.items()},
                              "base": {p: round(float(v), 2) for p, v in zip(parts, m0)},
                              "m": M.round(5).tolist()})
        s = builds[b][len(heights) // 2]
        pt.log(f"{b} {s['height_cm']:.1f}cm: 基準 {s['base']} / 体 {s['body']}")
    return {"standard_cm": round(standard_cm, 2), "parts": parts, "builds": builds}


def main():
    pt.clear_scene()
    shapes = pt.capture_builds(tr.add_jeans)
    standard_cm, height_shapes = pt.capture_heights(tr.add_jeans)

    body = pt.create_body(pt.macros_for("standard"))
    jeans = tr.add_jeans(body)
    jeans.shape_key_add(name="Basis", from_mix=False)
    std_body = pt.body_mix_coords(body)

    lm = tr.find_trouser_landmarks(jeans)
    polys = pt.polys_of(jeans)
    pt.write_json(os.path.join(OUT, "trousers_landmarks.json"), lm)

    # ジーンズ：体型キー → 身長キー（mhclo で着せ直した形）→ サイズキー（標準体型の上で、形を伸ばす・広げるだけ）
    for b, (_, co) in shapes.items():
        pt.set_key_from_world(jeans, pt.build_key(b), co)
    std_jeans = pt.world_coords(jeans, "Basis")
    for d, (_, co) in height_shapes.items():
        pt.set_key_from_world(jeans, pt.height_key(d), pt.height_key_world(std_jeans, co))
    for part in tr.TROUSER_PARTS:
        make_size_key(jeans, part, lm, polys)

    mw = jeans.matrix_world.copy()
    jeans.parent = None
    jeans.matrix_world = mw
    pt.simple_material(jeans, "jeans", (0.22, 0.30, 0.45, 1.0))

    # 体の寸法を測るため、体にも体型キー・身長キーを付ける（体の glb は build_tshirt.py が書き出す）
    keep = pt.bake_body(body)
    body.shape_key_add(name="Basis", from_mix=False)
    for b, (body_co, _) in shapes.items():
        pt.set_key_from_world(body, pt.build_key(b), body_co[keep])
    for d, (body_co, _) in height_shapes.items():
        pt.set_key_from_world(body, pt.height_key(d), pt.height_key_world(std_body[keep], body_co[keep]))

    pt.write_json(os.path.join(MODELS, "trousers_male_height.json"),
                  height_table(jeans, body, lm, polys, standard_cm))

    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "build_trousers.blend"), copy=True)
    pt.export_glb(jeans, os.path.join(MODELS, "trousers_male.glb"))
    pt.log("完了")


main()
