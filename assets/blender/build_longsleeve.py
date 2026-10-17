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
女性は -- female を付ける（体を女性にし、着せるための体に着せる。ファイル名の male が female になり、
基準点は out/longsleeve_female_landmarks.json、確認用は out/build_longsleeve_female.blend。verify_sizes.py -- longsleeve female で検証する）。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import build_tshirt as bt  # noqa: E402
import pitari_female as pf  # noqa: E402
import pitari_longsleeve as ls  # noqa: E402
import pitari_tshirt as pt  # noqa: E402

NAME = "longsleeve"
GENDER = pf.gender_from_args()
FEMALE = GENDER == "female"
BLEND = f"build_{NAME}_female.blend" if FEMALE else f"build_{NAME}.blend"


def main():
    pt.clear_scene()
    # Tシャツの基準点と手首の体の頂点（頂点番号はどの体でも同じ）を、標準体型で先に求めておく
    body = pt.create_body(pt.macros_for("standard", GENDER))
    topo = pf.fit_topology(body) if FEMALE else None
    add_shirt = pf.dress_on_fit(pt.add_shirt, topo) if FEMALE else pt.add_shirt
    shirt = add_shirt(body)
    lm_tshirt = pt.find_landmarks(shirt)
    wrists = {s: a["wrist"] for s, a in ls.extend_sleeves(shirt, body, lm_tshirt).items()}
    pt.remove_objects([shirt, body])
    pt.log(f"手首の体の頂点: " + ", ".join(f"{s} {len(v)}" for s, v in wrists.items()))

    def dress(body):
        shirt = add_shirt(body)
        ls.extend_sleeves(shirt, body, lm_tshirt, wrists)
        shirt.name = NAME
        return shirt

    shapes = pt.capture_builds(dress, GENDER)
    standard_cm, height_shapes = pt.capture_heights(dress, GENDER)

    body = pt.create_body(pt.macros_for("standard", GENDER))
    shirt = add_shirt(body)
    added = ls.extend_sleeves(shirt, body, lm_tshirt, wrists)
    shirt.name = NAME
    shirt.shape_key_add(name="Basis", from_mix=False)
    std_body = pt.body_mix_coords(body)
    lm = ls.longsleeve_landmarks(lm_tshirt, added)
    polys = pt.polys_of(shirt)
    pt.write_json(os.path.join(bt.OUT, pf.landmarks_file(NAME, GENDER)), lm)
    pt.log(f"{NAME}: {len(shirt.data.vertices)} 頂点, 寸法 {pt.measure(pt.world_coords(shirt), lm, polys)}")

    for b, (_, co) in shapes.items():
        pt.set_key_from_world(shirt, pt.build_key(b), co)
    std_shirt = pt.world_coords(shirt, "Basis")
    for d, (_, co) in height_shapes.items():
        pt.set_key_from_world(shirt, pt.height_key(d), pt.height_key_world(std_shirt, co))
    for part in pt.SIZE_PARTS:
        bt.make_size_key(shirt, part, lm, polys, ls.DISPLACEMENTS)
    bt.make_fold_key(shirt, lm, polys, ls.DISPLACEMENTS["width_folds"])

    base, corr = bt.base_and_correction(shirt, lm, polys)
    pt.write_json(os.path.join(bt.MODELS, f"{NAME}_{GENDER}_base.json"), base)
    pt.write_json(os.path.join(bt.MODELS, f"{NAME}_{GENDER}_correction.json"),
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
    width = None
    if FEMALE:
        fit = pf.add_fit_body(body, keep, topo, std_body, shapes, height_shapes)
        width = pf.body_width_of(body, fit)
    pt.write_json(os.path.join(bt.MODELS, f"{NAME}_{GENDER}_height.json"),
                  bt.height_table(shirt, body, lm, polys, standard_cm, width, GENDER))
    # 袖丈が腕より長いときに、余った袖が手に垂れた形（標準体型・標準の身長で布のシミュレーション）
    ls.make_drape_keys(shirt, body, lm)

    os.makedirs(bt.OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(bt.OUT, BLEND), copy=True)
    pt.export_glb(shirt, os.path.join(bt.MODELS, f"{NAME}_{GENDER}.glb"))
    pt.log("完了")


main()
