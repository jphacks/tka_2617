"""
長袖（Tシャツの袖を手首まで伸ばしたもの）を生成して glb / JSON を書き出す

実行（リポジトリのルートで）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background --python assets/blender/build_longsleeve.py

出力:
  apps/web/public/models/longsleeve_male.glb               長袖（体型キー 3 個＋身長キー 2 個＋サイズキー 4 個＋垂れ方のキー 3 個、腕に沿った位置 _sleeve）
  apps/web/public/models/longsleeve_male_height.json       標準の身長と、体型・身長ごとの基準寸法とキーの効き方 M、体の身幅
  apps/web/public/models/longsleeve_male_base.json         体型ごとの基準寸法（cm）
  apps/web/public/models/longsleeve_male_correction.json   体型ごとのキーの効き方 M
  assets/blender/out/longsleeve_landmarks.json        計測に使う頂点インデックス
  assets/blender/out/build_longsleeve.blend           確認用（verify_sizes.py -- longsleeve で検証する）

寸法の 4 項目・キー名は Tシャツと同じ。袖丈は肩先から袖の上側を通って手首の袖口まで。
体（avatar_male.glb）は build_tshirt.py が書き出す。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import build_tshirt as bt  # noqa: E402
import pitari_longsleeve as ls  # noqa: E402
import pitari_tshirt as pt  # noqa: E402

NAME = "longsleeve"


def main():
    pt.clear_scene()
    # Tシャツの基準点と手首の体の頂点（頂点番号はどの体でも同じ）を、標準体型で先に求めておく
    body = pt.create_body(pt.macros_for("standard"))
    shirt = pt.add_shirt(body)
    lm_tshirt = pt.find_landmarks(shirt)
    wrists = {s: a["wrist"] for s, a in ls.extend_sleeves(shirt, body, lm_tshirt).items()}
    pt.remove_objects([shirt, body])
    pt.log(f"手首の体の頂点: " + ", ".join(f"{s} {len(v)}" for s, v in wrists.items()))

    def dress(body):
        shirt = pt.add_shirt(body)
        ls.extend_sleeves(shirt, body, lm_tshirt, wrists)
        shirt.name = NAME
        return shirt

    shapes = pt.capture_builds(dress)
    standard_cm, height_shapes = pt.capture_heights(dress)

    body = pt.create_body(pt.macros_for("standard"))
    shirt = pt.add_shirt(body)
    added = ls.extend_sleeves(shirt, body, lm_tshirt, wrists)
    shirt.name = NAME
    shirt.shape_key_add(name="Basis", from_mix=False)
    std_body = pt.body_mix_coords(body)
    lm = ls.longsleeve_landmarks(lm_tshirt, added)
    polys = pt.polys_of(shirt)
    pt.write_json(os.path.join(bt.OUT, f"{NAME}_landmarks.json"), lm)
    pt.log(f"{NAME}: {len(shirt.data.vertices)} 頂点, 寸法 {pt.measure(pt.world_coords(shirt), lm, polys)}")

    for b, (_, co) in shapes.items():
        pt.set_key_from_world(shirt, pt.build_key(b), co)
    std_shirt = pt.world_coords(shirt, "Basis")
    for d, (_, co) in height_shapes.items():
        pt.set_key_from_world(shirt, pt.height_key(d), pt.height_key_world(std_shirt, co))
    for part in pt.SIZE_PARTS:
        bt.make_size_key(shirt, part, lm, polys, ls.DISPLACEMENTS)

    base, corr = bt.base_and_correction(shirt, lm, polys)
    pt.write_json(os.path.join(bt.MODELS, f"{NAME}_male_base.json"), base)
    pt.write_json(os.path.join(bt.MODELS, f"{NAME}_male_correction.json"),
                  {"keys": [f"size_{p}" for p in pt.SIZE_PARTS], "parts": pt.SIZE_PARTS, "builds": corr})

    mw = shirt.matrix_world.copy()
    shirt.parent = None
    shirt.matrix_world = mw
    pt.simple_material(shirt, NAME, (0.92, 0.92, 0.95, 1.0))
    pt.apply_pitari_uv(shirt)                     # Tシャツの部分は、テクスチャ担当が作った UV
    ls.extend_pitari_uv(shirt, lm)
    # ブラウザ（sleeve-drape.ts）が袖の中の腕・手を選ぶのに使う、腕に沿った位置（縫い目 0 → 袖口 1）
    pt.set_point_attribute(shirt, "_sleeve", ls.sleeve_params(std_shirt, lm))

    # 体の身幅を測るため、体にも体型キー・身長キーを付ける（体の glb は build_tshirt.py が書き出す）
    keep = pt.bake_body(body)
    # 検証（verify_sizes.py）の押し出しが使う、長袖で覆われる所。ブラウザの体（avatar_male.glb）は Tシャツの _cover のまま
    pt.set_point_attribute(body, "_cover", pt.cover_weights(body, shirt, lm))
    body.shape_key_add(name="Basis", from_mix=False)
    for b, (body_co, _) in shapes.items():
        pt.set_key_from_world(body, pt.build_key(b), body_co[keep])
    for d, (body_co, _) in height_shapes.items():
        pt.set_key_from_world(body, pt.height_key(d), pt.height_key_world(std_body[keep], body_co[keep]))
    pt.write_json(os.path.join(bt.MODELS, f"{NAME}_male_height.json"),
                  bt.height_table(shirt, body, lm, polys, standard_cm))
    # 袖丈が腕より長いときに、余った袖が手に垂れた形（標準体型・標準の身長で布のシミュレーション）
    ls.make_drape_keys(shirt, body, lm)

    os.makedirs(bt.OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(bt.OUT, f"build_{NAME}.blend"), copy=True)
    pt.export_glb(shirt, os.path.join(bt.MODELS, f"{NAME}_male.glb"))
    pt.log("完了")


main()
