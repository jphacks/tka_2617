"""photo_to_texture.py --category trousersで作ったtexture.pngを受領したズボンに貼り、6視点で描画して.blendとGLBに保存する。

使い方（リポジトリ直下）：
  "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b artifacts/uv/pitari/inputs/trousers/pitari_trousers.blend --python artifacts/uv/pitari/scripts/preview_trousers_texture.py -- artifacts/uv/pitari/trials/jeans_new_uv

元の.blendは保存しない。結果のフォルダにpreview.blend・trousers_textured.glb・renders/を書き出す。
"""

import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_render  # noqa: E402

TARGET = "jeans"
BODY = "avatar"


def main():
    out = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    if not (out / "texture.png").exists():
        raise SystemExit(f"{out}にtexture.pngがありません。先にphoto_to_texture.pyを実行してください")
    blender_render.object_mode()
    scene = bpy.context.scene
    target, body = bpy.data.objects[TARGET], bpy.data.objects[BODY]
    image = bpy.data.images.load(str(out / "texture.png"))
    image.colorspace_settings.name = "sRGB"
    image.pack()
    # 元の材質は変えず、ズボンだけ新しい材質にする。
    material, _ = blender_render.texture_material("pitari_trousers_texture", image, uv_map="UVMap")
    target.material_slots[0].material = material

    holder = bpy.data.collections.new("pitari_preview")
    scene.collection.children.link(holder)
    camera = blender_render.camera(holder)
    center = sum((target.matrix_world @ Vector(c) for c in target.bound_box), Vector()) / 8
    crotch = center + Vector((0, 0, 0.25))
    views = {
        "front": (center + Vector((0, -2, 0)), center, 1.1, True),
        "back": (center + Vector((0, 2, 0)), center, 1.1, True),
        "wearer_right_side": (center + Vector((-2, 0, 0)), center, 1.1, True),
        "wearer_left_side": (center + Vector((2, 0, 0)), center, 1.1, True),
        "crotch_front_low": (crotch + Vector((0, -1.2, -1.2)), crotch, 0.5, False),
        "crotch_back_low": (crotch + Vector((0, 1.2, -1.2)), crotch, 0.5, False),
    }
    # Workbenchの光沢でデニムの模様が白く隠れないようにする。
    scene.display.shading.show_specular_highlight = False
    with blender_render.workbench_settings(scene, camera):
        for obj in bpy.data.objects:
            if obj.type == "MESH" and obj not in (target, body):
                obj.hide_render = True
        blender_render.render_views(scene, camera, views, body, out / "renders")

    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.type = "MATERIAL"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "preview.blend"), copy=True)
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.export_scene.gltf(
        filepath=str(out / "trousers_textured.glb"),
        export_format="GLB",
        use_selection=True,
        export_morph=True,
    )
    print(f"[pitari] 保存しました：{out / 'preview.blend'}")


main()
