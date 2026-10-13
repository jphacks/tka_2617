"""作業用.blendのオブジェクト・材質・UV・モディファイアの概要をJSONで出力する。

使い方：
  blender -b pitari_uv_work.blend --python scripts/inspect_scene.py -- 出力先.json
ファイルは保存しない。
"""

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_render  # noqa: E402


def node_summary(material):
    if not material or not material.use_nodes:
        return None
    nodes = []
    for node in material.node_tree.nodes:
        item = {"name": node.name, "type": node.bl_idname}
        if node.bl_idname == "ShaderNodeTexImage" and node.image:
            item["image"] = node.image.name
        if node.bl_idname == "ShaderNodeUVMap":
            item["uv_map"] = node.uv_map
        nodes.append(item)
    links = [
        f"{link.from_node.name}.{link.from_socket.name} -> {link.to_node.name}.{link.to_socket.name}"
        for link in material.node_tree.links
    ]
    return {"nodes": nodes, "links": links}


def modifier_summary(modifier):
    item = {"name": modifier.name, "type": modifier.type, "show_viewport": modifier.show_viewport, "show_render": modifier.show_render}
    for key in ("object", "levels", "render_levels", "thickness", "offset", "vertex_group", "use_deform_preserve_volume"):
        if hasattr(modifier, key):
            value = getattr(modifier, key)
            item[key] = value.name if hasattr(value, "name") else value
    return item


def main():
    blender_render.object_mode()
    output = sys.argv[sys.argv.index("--") + 1]
    report = {"blend": bpy.data.filepath, "blender": bpy.app.version_string, "unit_scale": bpy.context.scene.unit_settings.scale_length, "objects": [], "materials": {}, "images": []}
    for obj in bpy.data.objects:
        entry = {"name": obj.name, "type": obj.type, "parent": obj.parent.name if obj.parent else None, "location": list(obj.location), "rotation_euler": list(obj.rotation_euler), "scale": list(obj.scale), "hide_viewport": obj.hide_viewport, "hide_render": obj.hide_render, "hide_get": obj.hide_get()}
        if obj.type == "MESH":
            mesh = obj.data
            per_material = {}
            for polygon in mesh.polygons:
                per_material[polygon.material_index] = per_material.get(polygon.material_index, 0) + 1
            entry.update(
                {
                    "mesh": mesh.name,
                    "mesh_users": mesh.users,
                    "vertices": len(mesh.vertices),
                    "edges": len(mesh.edges),
                    "faces": len(mesh.polygons),
                    "loops": len(mesh.loops),
                    "face_sizes": sorted({len(p.vertices) for p in mesh.polygons}),
                    "material_slots": [slot.material.name if slot.material else None for slot in obj.material_slots],
                    "faces_per_material_index": per_material,
                    "uv_layers": [{"name": uv.name, "active": uv.active, "active_render": uv.active_render} for uv in mesh.uv_layers],
                    "attributes": [(a.name, a.domain, a.data_type) for a in mesh.attributes],
                    "vertex_groups": len(obj.vertex_groups),
                    "vertex_group_names_head": [g.name for g in obj.vertex_groups][:12],
                    "shape_keys": [k.name for k in mesh.shape_keys.key_blocks] if mesh.shape_keys else [],
                    "modifiers": [modifier_summary(m) for m in obj.modifiers],
                    "bbox_world": [list(obj.matrix_world @ __import__("mathutils").Vector(c)) for c in (obj.bound_box[0], obj.bound_box[6])],
                }
            )
        report["objects"].append(entry)
    for material in bpy.data.materials:
        report["materials"][material.name] = {"users": material.users, "nodes": node_summary(material)}
    for image in bpy.data.images:
        report["images"].append({"name": image.name, "source": image.source, "filepath": image.filepath, "abs": bpy.path.abspath(image.filepath) if image.filepath else None, "packed": image.packed_file is not None, "size": list(image.size), "users": image.users})
    with open(output, "w", encoding="utf-8") as file:
        json.dump(report, file, ensure_ascii=False, indent=1)


main()
