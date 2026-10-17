"""確認画像と写真テクスチャの描画で共通に使う、視点と描画設定（Blender内で使う）。"""

from contextlib import contextmanager

import bpy
from mathutils import Vector

RESOLUTION = 900
CAMERA = "pitari_uv_check_camera"
UV_MAP = "pitari"


def object_mode():
    """編集モードのまま保存されたファイルでは、メッシュのUV配列が空で返る。読む前にオブジェクトモードへ戻す。"""
    obj = bpy.context.object
    if obj is not None and obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def texture_material(name, image, uv_map=UV_MAP):
    """指定のUV（既定はpitari）で画像をBase Colorに貼るだけの材質。"""
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_map
    texture.image = image
    links.new(uv.outputs["UV"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    shader.inputs["Roughness"].default_value = 0.9
    nodes.active = texture
    material.use_backface_culling = False
    return material, texture


def look_at(camera, eye, target):
    camera.location = eye
    camera.rotation_euler = (target - eye).normalized().to_track_quat("-Z", "Y").to_euler()


def views(target, anchors):
    """視点名 → (カメラの位置, 注視点, 写す幅m, 体を写すか)。脇の下は体に隠れるため体を消す。"""
    center = sum((target.matrix_world @ Vector(c) for c in target.bound_box), Vector()) / 8

    def at(name):
        return target.matrix_world @ Vector(anchors[name]["position_3d"])

    return {
        "front": (center + Vector((0, -2, 0)), center, 0.78, True),
        "back": (center + Vector((0, 2, 0)), center, 0.78, True),
        "wearer_right_side": (center + Vector((-2, 0, 0)), center, 0.78, True),
        "wearer_left_side": (center + Vector((2, 0, 0)), center, 0.78, True),
        "underarm_right": (at("armpit_right") + Vector((-0.9, -0.5, -1.2)), at("armpit_right"), 0.36, False),
        "underarm_left": (at("armpit_left") + Vector((0.9, -0.5, -1.2)), at("armpit_left"), 0.36, False),
        "underarm_right_back": (at("armpit_right") + Vector((-0.9, 0.5, -1.2)), at("armpit_right"), 0.36, False),
        "underarm_left_back": (at("armpit_left") + Vector((0.9, 0.5, -1.2)), at("armpit_left"), 0.36, False),
        "neck_front_top": (at("front_neck_center") + Vector((0, -1.0, 1.4)), at("front_neck_center") + Vector((0, 0.03, 0)), 0.36, True),
        "neck_back_top": (at("back_neck_center") + Vector((0, 1.0, 1.4)), at("back_neck_center") + Vector((0, -0.03, 0)), 0.36, True),
    }


def camera(holder):
    data = bpy.data.cameras.get(CAMERA) or bpy.data.cameras.new(CAMERA)
    data.type = "ORTHO"
    data.clip_start, data.clip_end = 0.01, 10
    obj = bpy.data.objects.get(CAMERA) or bpy.data.objects.new(CAMERA, data)
    if obj.name not in holder.objects:
        holder.objects.link(obj)
    return obj


@contextmanager
def workbench_settings(scene, camera_object):
    """テクスチャの色をそのまま見るための描画設定にし、終わったら元に戻す。"""
    saved = {
        "engine": scene.render.engine,
        "x": scene.render.resolution_x,
        "y": scene.render.resolution_y,
        "percentage": scene.render.resolution_percentage,
        "view_transform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
        "camera": scene.camera,
        "film_transparent": scene.render.film_transparent,
        "light": scene.display.shading.light,
        "color_type": scene.display.shading.color_type,
        "world_color": tuple(scene.world.color) if scene.world else None,
        "hide_render": {o.name: o.hide_render for o in bpy.data.objects},
    }
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    if scene.world:
        scene.world.color = (0.18, 0.18, 0.18)
    scene.camera = camera_object
    try:
        yield
    finally:
        for name, hidden in saved["hide_render"].items():
            if name in bpy.data.objects:
                bpy.data.objects[name].hide_render = hidden
        scene.render.engine = saved["engine"]
        scene.render.resolution_x, scene.render.resolution_y = saved["x"], saved["y"]
        scene.render.resolution_percentage = saved["percentage"]
        scene.view_settings.view_transform = saved["view_transform"]
        scene.view_settings.look = saved["look"]
        scene.camera = saved["camera"]
        scene.render.film_transparent = saved["film_transparent"]
        scene.display.shading.light = saved["light"]
        scene.display.shading.color_type = saved["color_type"]
        if scene.world and saved["world_color"]:
            scene.world.color = saved["world_color"]


def render_views(scene, camera_object, view_table, body, out_dir):
    for view, (eye, look, scale, with_body) in view_table.items():
        body.hide_render = not with_body
        look_at(camera_object, eye, look)
        camera_object.data.ortho_scale = scale
        scene.render.filepath = str(out_dir / f"{view}.png")
        bpy.ops.render.render(write_still=True)
