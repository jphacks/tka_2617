"""photo_to_texture.pyで作ったtexture.pngを作業用モデルに貼り、10視点で描画して別の.blendに保存する。

使い方（リポジトリ直下）：
  "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b artifacts/uv/pitari/pitari_uv_work.blend --factory-startup --python artifacts/uv/pitari/scripts/preview_texture.py -- artifacts/uv/pitari/trials/try1

作業用.blendと元のpitari.blendは保存しない。結果のフォルダにpreview.blendとrenders/を書き出す。
"""

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_render  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TARGET = "Human.male_casualsuit06"
BODY = "Human"
CHECK_COLLECTION = "pitari_uv_check"


def main():
    if Path(bpy.data.filepath).resolve() != (ROOT / "pitari_uv_work.blend").resolve():
        raise SystemExit("artifacts/uv/pitari/pitari_uv_work.blendを開いて実行してください")
    out = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    if not (out / "texture.png").exists():
        raise SystemExit(f"{out}にtexture.pngがありません。先にphoto_to_texture.pyを実行してください")
    blender_render.object_mode()
    scene = bpy.context.scene
    template = json.loads((ROOT / "uv_template.json").read_text(encoding="utf-8"))
    target, body = bpy.data.objects[TARGET], bpy.data.objects[BODY]

    image = bpy.data.images.load(str(out / "texture.png"))
    image.colorspace_settings.name = "sRGB"
    image.pack()
    material, _ = blender_render.texture_material("pitari_photo_texture", image)
    target.material_slots[0].material = material
    # パンツの元の材質は画像が見つからず色がおかしくなるため、このコピーでは灰色にする。
    gray = bpy.data.materials.new("preview_gray")
    gray.diffuse_color = (0.55, 0.55, 0.6, 1.0)
    original = template["source"]["material"]
    pants = [o for o in bpy.data.objects if o is not target and o.type == "MESH" and original in [s.material.name for s in o.material_slots if s.material]]
    for o in pants:
        for slot in o.material_slots:
            slot.material = gray

    holder = bpy.data.collections.new("pitari_preview")
    scene.collection.children.link(holder)
    camera = blender_render.camera(holder)
    check = bpy.context.view_layer.layer_collection.children.get(CHECK_COLLECTION)
    if check is not None:
        check.exclude = True

    with blender_render.workbench_settings(scene, camera):
        for o in pants:
            o.hide_render = True
        blender_render.render_views(scene, camera, blender_render.views(target, template["anchors"]), body, out / "renders")

    # Blenderで開いたとき、すぐに色付きで見えるようにする。
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.type = "MATERIAL"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "preview.blend"), copy=True)
    print(f"保存しました：{out / 'preview.blend'}")


main()
