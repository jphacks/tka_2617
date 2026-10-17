"""作業用.blendに確認用テクスチャを貼り、視点ごとの画像を書き出してから作業用.blendを保存する。

使い方（リポジトリ直下）：
  "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b artifacts/uv/pitari/pitari_uv_work.blend --factory-startup --python artifacts/uv/pitari/scripts/apply_check_textures.py

作業用コピー以外では動かない。元のpitari.blendは開かず、保存もしない。
"""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_render  # noqa: E402

WORK = Path(bpy.data.filepath)
if WORK.name != "pitari_uv_work.blend" or WORK.parent.name != "pitari":
    raise SystemExit("作業用のartifacts/uv/pitari/pitari_uv_work.blend以外では実行しない")
ROOT = WORK.parent
PROJECT = ROOT.parents[2]
TARGET = "Human.male_casualsuit06"
BODY = "Human"
CHECKS = ["check_parts", "check_labels", "check_landmarks", "check_grid", "check_checker"]
MATERIAL = "pitari_uv_check"
COLLECTION = "pitari_uv_check"


def load_check_images():
    images = {}
    for name in CHECKS:
        path = ROOT / "check" / f"{name}.png"
        # 取り込み済みの古い画像は、ファイルを作り直しても更新されないため消してから読み込む。
        old = bpy.data.images.get(f"{name}.png")
        if old is not None:
            bpy.data.images.remove(old)
        image = bpy.data.images.load(str(path))
        image.colorspace_settings.name = "sRGB"
        images[name] = image
    return images


def marker_material(name, color):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = False
    return material


def collection():
    found = bpy.data.collections.get(COLLECTION)
    if found is None:
        found = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(found)
    return found


def add_markers(template, holder):
    for obj in list(holder.objects):
        if obj.name.startswith("marker_"):
            bpy.data.objects.remove(obj, do_unlink=True)
    colors = {
        "definite": marker_material("marker_definite", (0.0, 0.55, 0.0)),
        "approximate": marker_material("marker_approximate", (0.0, 0.35, 0.9)),
        "auxiliary": marker_material("marker_auxiliary", (0.6, 0.0, 0.6)),
    }
    mesh = bpy.data.meshes.get("marker_sphere")
    if mesh is None:
        import bmesh

        mesh = bpy.data.meshes.new("marker_sphere")
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.006)
        bm.to_mesh(mesh)
        bm.free()
    if not mesh.materials:
        mesh.materials.append(None)
    target = bpy.data.objects[TARGET]
    for name, anchor in template["anchors"].items():
        marker = bpy.data.objects.new(f"marker_{name}", mesh)
        marker.location = target.matrix_world @ Vector(anchor["position_3d"])
        holder.objects.link(marker)
        # 球のメッシュは共有し、色だけ点ごとに変える。
        marker.material_slots[0].link = "OBJECT"
        marker.material_slots[0].material = colors[anchor["status"]]
        marker.hide_render = True


def main():
    blender_render.object_mode()
    scene = bpy.context.scene
    template = json.loads((ROOT / "uv_template.json").read_text(encoding="utf-8"))
    target = bpy.data.objects[TARGET]
    body = bpy.data.objects[BODY]
    if target.data.uv_layers.get(blender_render.UV_MAP) is None:
        raise SystemExit("pitariのUVマップがない")

    # 元の材質の外部画像は、元のpitari.blendと同じ場所を指すように相対パスを付け直す。
    missing = []
    for image in bpy.data.images:
        if image.source != "FILE" or image.packed_file or image.name in {f"{n}.png" for n in CHECKS}:
            continue
        if image.filepath.startswith("//") and "data" in image.filepath:
            absolute = bpy.path.abspath(image.filepath, start=str(PROJECT))
            image.filepath = bpy.path.relpath(absolute, start=str(ROOT))
            if not Path(absolute).exists():
                missing.append(absolute)

    images = load_check_images()
    original_material = target.material_slots[0].material
    # 元の材質を共有する別の服（パンツ）。確認画像には写さない。
    pants = [o for o in bpy.data.objects if o is not target and o.type == "MESH" and original_material in [s.material for s in o.material_slots]]
    material, texture = blender_render.texture_material(MATERIAL, images["check_labels"])
    texture.interpolation = "Closest"
    target.material_slots[0].material = material
    holder = collection()
    add_markers(template, holder)
    camera = blender_render.camera(holder)

    view_table = blender_render.views(target, template["anchors"])
    with blender_render.workbench_settings(scene, camera):
        for o in pants:
            o.hide_render = True
        for check in CHECKS:
            texture.image = images[check]
            for o in holder.objects:
                if o.name.startswith("marker_"):
                    o.hide_render = check != "check_landmarks"
            blender_render.render_views(scene, camera, view_table, body, ROOT / "renders" / check)

    # 作業用.blendを開き直しても確認用画像が切れないよう取り込み、材質で使っていない画像もフェイクユーザーで残す。
    texture.image = images["check_labels"]
    for image in images.values():
        image.filepath = bpy.path.relpath(str(ROOT / "check" / image.name))
        image.pack()
        image.use_fake_user = True
    report = {
        "material_replaced_on_target": {"before": original_material.name if original_material else None, "after": MATERIAL},
        "original_material_kept_for": [o.name for o in pants],
        "external_images_missing": missing,
        "renders": {check: [f"renders/{check}/{v}.png" for v in view_table] for check in CHECKS},
    }
    (ROOT / "data" / "apply_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK), relative_remap=True)
    print(json.dumps(report, ensure_ascii=False))


main()
