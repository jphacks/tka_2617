"""受領した長そでのBasisとpitari UVを書き出す。元のBlenderファイルは保存しない。"""

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_render


def main():
    blender_render.object_mode()
    root = Path(__file__).resolve().parents[1]
    obj = bpy.data.objects["longsleeve"]
    mesh = obj.data
    basis = mesh.shape_keys.key_blocks["Basis"] if mesh.shape_keys else None
    landmarks = json.loads((root / "inputs/longsleeve/longsleeve_landmarks.json").read_text(encoding="utf-8"))
    data = {
        "object": obj.name,
        "mesh": mesh.name,
        "materials": [slot.material.name for slot in obj.material_slots if slot.material],
        "material_sharers": [],
        "vertices": [list(v.co) for v in (basis.data if basis else mesh.vertices)],
        "faces": [{"vertices": list(f.vertices), "loops": list(f.loop_indices)} for f in mesh.polygons],
        "uv": {"pitari": [list(v.uv) for v in mesh.uv_layers["pitari"].data]},
        "body_orientation": {"left_group_mean_x": 1, "right_group_mean_x": -1},
        "sleeve_vertices": landmarks["sleeve_verts"],
    }
    output = root / "longsleeve/data/mesh_export.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data), encoding="utf-8")
    print(f"[pitari] 長そでを書き出しました：{len(mesh.polygons)}面")


main()
