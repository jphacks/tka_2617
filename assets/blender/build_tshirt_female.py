"""
女性アバター＋Tシャツを生成して glb / JSON を書き出す

実行（リポジトリのルートで）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background --python assets/blender/build_tshirt_female.py

出力:
  apps/web/public/models/avatar_female.glb              体（男性と同じキー・属性）と、着せるための体 avatar_fit（見えないメッシュ。体と同じキーと _cover）
  apps/web/public/models/tshirt_female.glb              Tシャツ（男性と同じキー）。着せるための体に mhclo で着せる
  apps/web/public/models/tshirt_female_base.json        体型ごとの基準寸法（cm）
  apps/web/public/models/tshirt_female_height.json      標準の身長と、体型・身長ごとの基準寸法とキーの効き方 M、体の身幅
  apps/web/public/models/tshirt_female_correction.json  体型ごとのキーの効き方 M
  assets/blender/out/tshirt_female_landmarks.json  計測に使う頂点インデックス
  assets/blender/out/build_female.blend            確認用（verify_sizes.py -- tshirt female で検証する）

体型・身長・サイズのキーと寸法の測り方は男性（build_tshirt.py）と同じ。体の身幅だけ、胸の一周も見る（pitari_female.body_width）。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
import build_tshirt as bt  # noqa: E402
import pitari_female as pf  # noqa: E402
import pitari_presets as pp  # noqa: E402
import pitari_tshirt as pt  # noqa: E402

GENDER = "female"


def main():
    pt.clear_scene()
    body = pt.create_body(pt.macros_for("standard", GENDER))
    topo = pf.fit_topology(body)
    pt.remove_objects([body])
    dress = pf.dress_on_fit(pt.add_shirt, topo)
    shapes = pt.capture_builds(dress, GENDER)
    standard_cm, height_shapes = pt.capture_heights(dress, GENDER)

    body = pt.create_body(pt.macros_for("standard", GENDER))
    std_body = pt.body_mix_coords(body)
    shirt = dress(body)
    shirt.shape_key_add(name="Basis", from_mix=False)
    for asset, _ in pp.SHOES.values():
        pt.remove_objects([pp.add_asset(body, "shoes", asset)])
    thumb_in = pt.thumb_in_shape(body)

    lm = pt.find_landmarks(shirt)
    polys = pt.polys_of(shirt)
    pt.write_json(os.path.join(bt.OUT, "tshirt_female_landmarks.json"), lm)

    for b, (_, shirt_co) in shapes.items():
        pt.set_key_from_world(shirt, pt.build_key(b), shirt_co)
    std_shirt = pt.world_coords(shirt, "Basis")
    for d, (_, shirt_co) in height_shapes.items():
        pt.set_key_from_world(shirt, pt.height_key(d), pt.height_key_world(std_shirt, shirt_co))
    for part in pt.SIZE_PARTS:
        bt.make_size_key(shirt, part, lm, polys)
    bt.make_fold_key(shirt, lm, polys)

    base, corr = bt.base_and_correction(shirt, lm, polys)
    pt.write_json(os.path.join(bt.MODELS, "tshirt_female_base.json"), base)
    pt.write_json(os.path.join(bt.MODELS, "tshirt_female_correction.json"),
                  {"keys": [f"size_{p}" for p in pt.SIZE_PARTS], "parts": pt.SIZE_PARTS, "builds": corr})

    mw = shirt.matrix_world.copy()
    shirt.parent = None
    shirt.matrix_world = mw
    pt.simple_material(shirt, "tshirt", (0.92, 0.92, 0.95, 1.0))
    pt.apply_pitari_uv(shirt)

    keep = pt.bake_body(body)
    pp.skin_material(body, pf.SKIN)
    pt.set_point_attribute(body, "_cover", pt.cover_weights(body, shirt, lm))
    for sid, (asset, _) in pp.SHOES.items():
        pt.set_point_attribute(body, f"_shoe_{sid}", pp.vertex_group_weights(body, pp.shoe_delete_group(asset)))
    body.shape_key_add(name="Basis", from_mix=False)
    for b, (body_co, _) in shapes.items():
        pt.set_key_from_world(body, pt.build_key(b), body_co[keep])
    for d, (body_co, _) in height_shapes.items():
        pt.set_key_from_world(body, pt.height_key(d), pt.height_key_world(std_body[keep], body_co[keep]))
    pt.set_key_from_world(body, "thumb_in", thumb_in[keep])
    fit = pf.add_fit_body(body, keep, topo, std_body, shapes, height_shapes, thumb_in)

    body_polys = pt.polys_of(body)
    nipples = pf.bust_verts(topo, keep)

    def body_width(values, z):
        P = pt.mixed_coords(body, values)
        return pf.body_width(P, pt.mixed_coords(fit, values), body_polys, z, float(P[nipples, 2].mean()))

    pt.write_json(os.path.join(bt.MODELS, "tshirt_female_height.json"),
                  bt.height_table(shirt, body, lm, polys, standard_cm, body_width, GENDER))
    moved = np.linalg.norm(pt.world_coords(body) - std_body[keep], axis=1).max()
    pt.log(f"avatar: 焼き込み後の Basis と標準体型の差 {moved * 1000:.3f}mm")

    os.makedirs(bt.OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(bt.OUT, "build_female.blend"), copy=True)
    pt.export_glb(shirt, os.path.join(bt.MODELS, "tshirt_female.glb"))
    pt.export_glb(body, os.path.join(bt.MODELS, "avatar_female.glb"), [fit])
    pt.log("完了")


main()
