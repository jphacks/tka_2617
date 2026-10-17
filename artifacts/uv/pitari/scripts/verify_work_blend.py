"""作業用.blendを開き直して、メッシュ・UVが元のpitari.blendと同じか、確認用画像が切れていないかを調べる。

使い方（リポジトリ直下）：
  "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b artifacts/uv/pitari/pitari_uv_work.blend --factory-startup --python artifacts/uv/pitari/scripts/verify_work_blend.py
ファイルは保存しない。比較の基準はdata/mesh_export.json（元のコピーから書き出したもの）。
"""

import hashlib
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_render  # noqa: E402

ROOT = Path(bpy.data.filepath).parent
TARGET = "Human.male_casualsuit06"


def digest(values):
    return hashlib.sha256(json.dumps(values).encode("utf-8")).hexdigest()


def main():
    blender_render.object_mode()
    exported = json.loads((ROOT / "data/mesh_export.json").read_text(encoding="utf-8"))
    obj = bpy.data.objects[TARGET]
    mesh = obj.data
    faces = [list(p.vertices) for p in mesh.polygons]
    result = {
        "uv_loaded": all(len(layer.data) == len(mesh.loops) > 0 for layer in mesh.uv_layers),
        "faces_same": digest(faces) == digest([f["vertices"] for f in exported["faces"]]),
        "uv_same": {
            layer.name: digest([[round(c, 6) for c in d.uv] for d in layer.data]) == digest([[round(c, 6) for c in uv] for uv in exported["uv"][layer.name]])
            for layer in mesh.uv_layers
        },
        "vertices_same": digest([[round(c, 6) for c in v.co] for v in (mesh.shape_keys.key_blocks["Basis"].data if mesh.shape_keys else mesh.vertices)])
        == digest([[round(c, 6) for c in v] for v in exported["vertices"]]),
        "modifiers": [m.type for m in obj.modifiers],
        "target_material": obj.material_slots[0].material.name,
        "images": [],
        "scene": {"engine": bpy.context.scene.render.engine, "camera": bpy.context.scene.camera.name if bpy.context.scene.camera else None},
    }
    for image in bpy.data.images:
        if image.source != "FILE":
            continue
        packed = image.packed_file is not None
        exists = Path(bpy.path.abspath(image.filepath)).exists()
        image.reload()
        result["images"].append(
            {"name": image.name, "packed": packed, "file_exists": exists, "loaded_size": list(image.size), "users": image.users, "filepath": image.filepath}
        )
    (ROOT / "data/verify_work_blend.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


main()
