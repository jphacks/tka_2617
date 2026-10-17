"""ズボンの面・面コーナー・UV・法線をJSONへ書き出す。build_trousers_template.pyの入力にする。

使い方（リポジトリ直下）：
  blender -b artifacts/uv/pitari/inputs/trousers/pitari_trousers.blend --python artifacts/uv/pitari/scripts/export_trousers_mesh.py -- artifacts/uv/pitari/trousers/data/mesh_export.json
ファイルは保存しない。シェイプキーを適用する前の基準メッシュを使う。
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_render  # noqa: E402

TARGET = "jeans"
UV_MAP = "UVMap"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--object", default=TARGET)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    output = args.output
    obj = bpy.data.objects[args.object]
    # object_mode()はアクティブなオブジェクトにだけ効くので、先にズボンをアクティブにする
    bpy.context.view_layer.objects.active = obj
    blender_render.object_mode()
    mesh = obj.data
    layer = mesh.uv_layers[UV_MAP]
    if len(layer.data) != len(mesh.loops):
        raise SystemExit("UVの値を読めない（編集モードのままの可能性）")
    data = {
        "object": obj.name,
        "mesh": mesh.name,
        "uv_map": UV_MAP,
        "blend_file": Path(bpy.data.filepath).name,
        "blender_version": bpy.app.version_string,
        "matrix_world": [list(row) for row in obj.matrix_world],
        "materials": [slot.material.name for slot in obj.material_slots if slot.material],
        "vertices": [list(vertex.co) for vertex in mesh.vertices],
        "normals": [list(vertex.normal) for vertex in mesh.vertices],
        "faces": [list(face.vertices) for face in mesh.polygons],
        "face_loops": [list(face.loop_indices) for face in mesh.polygons],
        "uv": [list(item.uv) for item in layer.data],
    }
    # 頂点番号・面・UVが変わった場合、古い写真テクスチャとの混用を検出できるようにする。
    for name, value in (("topology", data["faces"]), ("uvmap", data["uv"])):
        data[f"{name}_sha256"] = hashlib.sha256(json.dumps(value, separators=(",", ":")).encode()).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data), encoding="utf-8")
    print(f"[pitari] 書き出しました：{output}（面{len(data['faces'])}）")


main()
