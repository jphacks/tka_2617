"""対象の服の面・面コーナー・UVをJSONへ書き出す。部位分けとマスク生成の入力にする。

使い方：
  blender -b pitari_uv_work.blend --factory-startup --python scripts/export_mesh_data.py -- 出力先.json
ファイルは保存しない。座標はシェイプキーのBasis（体型を変える前の形）を使う。
"""

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_render  # noqa: E402

TARGET = "Human.male_casualsuit06"
BODY = "Human"


def group_mean_x(obj, name):
    group = obj.vertex_groups.get(name)
    if group is None:
        return None
    total, count = 0.0, 0
    for vertex in obj.data.vertices:
        for element in vertex.groups:
            if element.group == group.index and element.weight > 0.5:
                total += vertex.co.x
                count += 1
    return total / count if count else None


def main():
    blender_render.object_mode()
    output = sys.argv[sys.argv.index("--") + 1]
    obj = bpy.data.objects[TARGET]
    mesh = obj.data
    if any(len(layer.data) != len(mesh.loops) for layer in mesh.uv_layers):
        raise SystemExit("UVの値を読めない（編集モードのままの可能性）")
    basis = mesh.shape_keys.key_blocks["Basis"] if mesh.shape_keys else None
    coordinates = [list(point.co) for point in (basis.data if basis else mesh.vertices)]
    uv_layers = {layer.name: [list(item.uv) for item in layer.data] for layer in mesh.uv_layers}

    body = bpy.data.objects[BODY]
    head = [v.co for v in body.data.vertices if v.co.z > 1.55]
    materials = [slot.material for slot in obj.material_slots if slot.material]
    # 同じ材質を使う別オブジェクトは、同じ画像を自分のUVで表示する。重複検査に使う。
    sharers = []
    for other in bpy.data.objects:
        if other is obj or other.type != "MESH":
            continue
        shared = [slot.material.name for slot in other.material_slots if slot.material in materials]
        if not shared:
            continue
        layer = next(layer for layer in other.data.uv_layers if layer.active_render)
        sharers.append(
            {
                "object": other.name,
                "materials": shared,
                "uv_layer": layer.name,
                "faces": [[list(layer.data[i].uv) for i in range(p.loop_start, p.loop_start + p.loop_total)] for p in other.data.polygons],
            }
        )
    data = {
        "object": obj.name,
        "mesh": mesh.name,
        "matrix_world": [list(row) for row in obj.matrix_world],
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "material_settings": {
            material.name: {"use_backface_culling": material.use_backface_culling, "blend_method": material.blend_method}
            for material in materials
        },
        "material_sharers": sharers,
        "uv_layers": list(uv_layers),
        "active_render_uv": next(layer.name for layer in mesh.uv_layers if layer.active_render),
        "shape_keys": {key.name: key.value for key in mesh.shape_keys.key_blocks} if mesh.shape_keys else {},
        "vertices": coordinates,
        "edges": [{"vertices": list(edge.vertices), "seam": edge.use_seam} for edge in mesh.edges],
        "faces": [
            {
                "index": polygon.index,
                "vertices": list(polygon.vertices),
                "loops": list(range(polygon.loop_start, polygon.loop_start + polygon.loop_total)),
                "material_index": polygon.material_index,
            }
            for polygon in mesh.polygons
        ],
        "loops": [{"vertex": loop.vertex_index, "edge": loop.edge_index} for loop in mesh.loops],
        "uv": uv_layers,
        "vertex_groups": {
            group.name: {str(v.index): e.weight for v in mesh.vertices for e in v.groups if e.group == group.index}
            for group in obj.vertex_groups
        },
        # 向きの確認用。人体メッシュのLeft・Rightグループと、頭部の前後の範囲。
        "body_orientation": {
            "left_group_mean_x": group_mean_x(body, "Left"),
            "right_group_mean_x": group_mean_x(body, "Right"),
            "head_min_y": min(v.y for v in head),
            "head_max_y": max(v.y for v in head),
            "head_center_y_by_bbox": (min(v.y for v in head) + max(v.y for v in head)) / 2,
        },
    }
    with open(output, "w", encoding="utf-8") as file:
        json.dump(data, file)


main()
