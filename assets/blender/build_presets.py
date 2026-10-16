"""
アバターのプリセット（髪4種・靴）を生成して glb / JSON を書き出す

実行（リポジトリのルートで）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background --python assets/blender/build_presets.py

出力:
  apps/web/public/presets/hair/<id>.glb       髪（体型キー 3 個＋身長キー 2 個、灰色のテクスチャ、alphaMode MASK）
  apps/web/public/presets/shoes/<id>.glb      靴（体型キー 3 個＋身長キー 2 個、灰色のテクスチャ。靴と靴下で材質を分ける）
  apps/web/public/presets/face/face.glb       顔のパーツ：目・眉毛・まつ毛（いつも着ける。眉毛・まつ毛は髪の色を掛ける）
  apps/web/public/presets/presets.json        ファイルのパス、表示名、髪の色・肌の色
  assets/blender/out/presets/build_presets.blend   確認用

体（avatar_male.glb）は build_tshirt.py が書き出す。髪・靴は体と同じ原点・スケールで、
体と同じ値の体型キー・身長キーを入れれば体に重なる。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import pitari_tshirt as pt  # noqa: E402
import pitari_presets as pp  # noqa: E402

ASSETS = [("hair", pid, asset) for pid, (asset, _) in pp.HAIR.items()] + \
         [("shoes", pid, asset) for pid, (asset, _) in pp.SHOES.items()] + \
         [(kind, kind, asset) for kind, (_, asset) in pp.FACE.items()]


def dress(body):
    return [pp.add_asset(body, kind, asset) for kind, _, asset in ASSETS]


def presets_json():
    def entries(kind, table):
        return [{"id": pid, "name": name, "path": f"/presets/{kind}/{pid}.glb", "source": asset,
                 "thumbs": {view: f"/presets/thumbs/{kind}_{pid}_{view}.png" for view in ("front", "angle")}}
                for pid, (asset, name) in table.items()]
    return {
        "avatar": {"path": "/models/avatar_male.glb"},
        "hair": entries("hair", pp.HAIR),
        "shoes": entries("shoes", pp.SHOES),
        "face": {"path": "/presets/face/face.glb"},
        "hairColors": pp.HAIR_COLORS,
        "skinColors": pp.SKIN_COLORS,
    }


def main():
    pt.clear_scene()
    shapes = pt.capture_builds(dress)
    _, height_shapes = pt.capture_heights(dress)

    body = pt.create_body(pt.macros_for("standard"))
    objs = dress(body)
    for i, ((kind, pid, asset), obj) in enumerate(zip(ASSETS, objs)):
        obj.shape_key_add(name="Basis", from_mix=False)
        for b, (_, coords) in shapes.items():
            pt.set_key_from_world(obj, pt.build_key(b), coords[i])
        std = pt.world_coords(obj, "Basis")
        for d, (_, coords) in height_shapes.items():
            pt.set_key_from_world(obj, pt.height_key(d), pt.height_key_world(std, coords[i]))
        mw = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = mw
        obj.name = pid
        if kind == "hair":
            pp.hair_material(obj, asset)
        elif kind == "shoes":
            pp.shoe_material(obj, asset)
        else:
            pp.face_material(obj, kind, asset)
        pt.log(f"{kind}/{pid}（{asset}）: {len(obj.data.vertices)} 頂点")

    os.makedirs(pp.OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(pp.OUT, "build_presets.blend"), copy=True)
    face = []
    for (kind, pid, _), obj in zip(ASSETS, objs):
        if kind in pp.FACE:
            face.append(obj)
            continue
        path = os.path.join(pp.PRESETS, kind, f"{pid}.glb")
        pt.export_glb(obj, path)
        pt.log(f"  {os.path.getsize(path) / 1e6:.2f}MB")
    path = os.path.join(pp.PRESETS, "face", "face.glb")
    pp.export_glb_many(face, path)
    pt.log(f"  {os.path.getsize(path) / 1e6:.2f}MB")
    pt.write_json(os.path.join(pp.PRESETS, "presets.json"), presets_json())
    pt.log("完了")


main()
