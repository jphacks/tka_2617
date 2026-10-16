"""
男性アバター＋Tシャツを生成して glb / JSON を書き出す

実行（pitari/ で）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background --python assets/blender/build_tshirt.py

出力:
  apps/web/public/models/avatar_male.glb               体（体型キー、身長キー、服の下の重み _cover、靴ごとの靴で隠れる所 _shoe_<靴>、肌の明暗テクスチャ、親指を曲げるキー thumb_in）
  apps/web/public/models/tshirt_male.glb               Tシャツ（体型キー 3 個＋身長キー 2 個＋サイズキー 4 個）
  apps/web/public/models/tshirt_male_base.json         体型ごとの基準寸法（cm）
  apps/web/public/models/tshirt_male_height.json       標準の身長と、体型・身長ごとの基準寸法とキーの効き方 M、体の身幅
  apps/web/public/models/tshirt_male_correction.json   体型ごとのキーの効き方 M（4 項目 × 4 キー）
  assets/blender/out/tshirt_landmarks.json        計測に使う頂点インデックス
  assets/blender/out/build.blend                  確認用
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
import pitari_tshirt as pt  # noqa: E402
import pitari_presets as pp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, "apps", "web", "public", "models")
OUT = os.path.join(HERE, "out")
D = 10.0                    # +10cm の形を作ってから 0.1 倍で 1cm キーにする


def make_size_key(shirt, part, lm, polys, displacements=pt.DISPLACEMENTS):
    """part の +10cm の形を作り（実測で +10.00cm になるよう倍率を探す）、0.1 倍で size_part にする。
    体からの押し出しはキーに入れない（ブラウザの push-out.ts が毎回押し出す）。
    入れると、キーをマイナスで使ったときに押し出しが逆向きにかかり、裾などが頂点ごとにばらばらに内側へ引かれる"""
    B = pt.world_coords(shirt, "Basis")
    disp = displacements[part]
    base = pt.measure(B, lm, polys)[part]

    def shape(k):
        return B + disp(B, lm, k)

    def gain(k):
        return pt.measure(shape(k), lm, polys)[part] - base

    k = pt.solve_scale(gain, D)
    work = f"size_{part}_10"
    pt.set_key_from_world(shirt, work, shape(k))
    pt.key_from_mix(shirt, work, 1.0 / D, f"size_{part}")
    shirt.shape_key_remove(shirt.data.shape_keys.key_blocks[work])
    pt.log(f"size_{part}: 倍率 {k:.4f}, +10 の形で {gain(k):+.2f}cm")


def base_and_correction(shirt, lm, polys):
    """体型ごとの基準寸法と、size_* キーの効き方の行列 M（行=寸法, 列=キー）。
    ブラウザは  M × キー = 実寸 − 基準  を解いてキーの値を決める"""
    base, corr = {}, {}
    for b in pt.BUILDS:
        def m(sizes):
            r = pt.measure(pt.mixed_coords(shirt, pt.build_values(b, sizes)), lm, polys)
            return np.array([r[p] for p in pt.SIZE_PARTS])
        m0 = m({})
        M = np.column_stack([(m({p: 5}) - m({p: -5})) / 10 for p in pt.SIZE_PARTS])
        base[b] = {p: round(float(v), 2) for p, v in zip(pt.SIZE_PARTS, m0)}
        corr[b] = {"m": M.round(5).tolist()}
        pt.log(f"{b}: 基準 {base[b]}")
    return base, corr


def height_table(shirt, body, lm, polys, standard_cm):
    """体型ごとに、いくつかの身長で基準寸法とキーの効き方 M、体の身幅を測る（身長の昇順）。
    ブラウザは前後の身長の値を直線で補間して使う"""
    body_polys = pt.polys_of(body)
    heights = sorted(pt.HEIGHT_SAMPLES_CM + [round(standard_cm, 2)])
    builds = {}
    for b in pt.BUILDS:
        builds[b] = []
        for h_cm in heights:
            h = h_cm - standard_cm

            def m(sizes):
                r = pt.measure(pt.mixed_coords(shirt, pt.build_values(b, sizes, h)), lm, polys)
                return np.array([r[p] for p in pt.SIZE_PARTS])
            m0 = m({})
            M = np.column_stack([(m({p: 5}) - m({p: -5})) / 10 for p in pt.SIZE_PARTS])
            z = pt.width_height(pt.mixed_coords(shirt, pt.build_values(b, {}, h)), lm)
            bw = pt.body_width(pt.mixed_coords(body, pt.build_values(b, None, h)), body_polys, z)
            builds[b].append({"height_cm": h_cm,
                              "body_width": round(bw, 2),
                              "base": {p: round(float(v), 2) for p, v in zip(pt.SIZE_PARTS, m0)},
                              "m": M.round(5).tolist()})
        pt.log(f"{b}: 身長ごとの身幅（服の基準／体） " + ", ".join(
            f"{s['height_cm']:.1f}cm {s['base']['width']:.2f}／{s['body_width']:.2f}" for s in builds[b]))
    return {"standard_cm": round(standard_cm, 2), "parts": pt.SIZE_PARTS, "builds": builds}


def main():
    pt.clear_scene()
    shapes = pt.capture_builds(pt.add_shirt)
    standard_cm, height_shapes = pt.capture_heights(pt.add_shirt)

    body = pt.create_body(pt.macros_for("standard"))
    shirt = pt.add_shirt(body)
    shirt.shape_key_add(name="Basis", from_mix=False)
    std_body = pt.body_mix_coords(body)
    # 靴を一度ずつ着せて、靴で隠れる体の頂点グループ（Delete.<靴>）だけを残す
    for asset, _ in pp.SHOES.values():
        pt.remove_objects([pp.add_asset(body, "shoes", asset)])
    thumb_in = pt.thumb_in_shape(body)

    lm = pt.find_landmarks(shirt)
    polys = pt.polys_of(shirt)
    pt.write_json(os.path.join(OUT, "tshirt_landmarks.json"), lm)

    # Tシャツ：体型キー（mhclo で着せ直した形）→ サイズキー（標準体型の上で、形を伸ばす・広げるだけ）
    for b, (_, shirt_co) in shapes.items():
        pt.set_key_from_world(shirt, pt.build_key(b), shirt_co)
    std_shirt = pt.world_coords(shirt, "Basis")
    for d, (_, shirt_co) in height_shapes.items():
        pt.set_key_from_world(shirt, pt.height_key(d), pt.height_key_world(std_shirt, shirt_co))
    for part in pt.SIZE_PARTS:
        make_size_key(shirt, part, lm, polys)

    base, corr = base_and_correction(shirt, lm, polys)
    pt.write_json(os.path.join(MODELS, "tshirt_male_base.json"), base)
    pt.write_json(os.path.join(MODELS, "tshirt_male_correction.json"),
                  {"keys": [f"size_{p}" for p in pt.SIZE_PARTS], "parts": pt.SIZE_PARTS, "builds": corr})

    mw = shirt.matrix_world.copy()
    shirt.parent = None
    shirt.matrix_world = mw
    pt.simple_material(shirt, "tshirt", (0.92, 0.92, 0.95, 1.0))
    pt.apply_pitari_uv(shirt)                     # 写真から貼る用の UV（テクスチャ担当が作ったもの）

    # 体：helper を消して標準体型を Basis に → 体型キー・身長キー → 服の下の重み（_cover）、靴ごとの靴で隠れる所（_shoe_<靴>）
    keep = pt.bake_body(body)
    pp.skin_material(body)
    pt.set_point_attribute(body, "_cover", pt.cover_weights(body, shirt, lm))
    for sid, (asset, _) in pp.SHOES.items():
        pt.set_point_attribute(body, f"_shoe_{sid}", pp.vertex_group_weights(body, pp.shoe_delete_group(asset)))
    body.shape_key_add(name="Basis", from_mix=False)
    for b, (body_co, _) in shapes.items():
        pt.set_key_from_world(body, pt.build_key(b), body_co[keep])
    for d, (body_co, _) in height_shapes.items():
        pt.set_key_from_world(body, pt.height_key(d), pt.height_key_world(std_body[keep], body_co[keep]))
    # 長袖が手にかぶさるときに、親指を袖の中に収める（ブラウザが入れる）
    pt.set_key_from_world(body, "thumb_in", thumb_in[keep])
    pt.write_json(os.path.join(MODELS, "tshirt_male_height.json"),
                  height_table(shirt, body, lm, polys, standard_cm))
    moved = np.linalg.norm(pt.world_coords(body) - std_body[keep], axis=1).max()
    pt.log(f"avatar: 焼き込み後の Basis と標準体型の差 {moved * 1000:.3f}mm")

    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "build.blend"), copy=True)
    pt.export_glb(shirt, os.path.join(MODELS, "tshirt_male.glb"))
    pt.export_glb(body, os.path.join(MODELS, "avatar_male.glb"))
    pt.log("完了")


if __name__ == "__main__":       # build_longsleeve.py から関数だけを import できるように
    main()
