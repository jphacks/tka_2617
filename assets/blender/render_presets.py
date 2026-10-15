"""
プリセットの確認：書き出した glb を読み込んで重ね、サムネイルと体型ごとの確認画像を描き、めり込みを数える

実行（リポジトリのルートで。先に build_tshirt.py と build_presets.py を実行しておく）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background --python assets/blender/render_presets.py

出力:
  apps/web/public/presets/thumbs/<kind>_<id>_{front,angle}.png   体に着けた正面と斜め45°（選択画面のサムネイル）
  assets/blender/out/presets/builds_check.png                    体型4種×プリセット（斜め45°と後ろ）
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
import pitari_tshirt as pt  # noqa: E402
import pitari_presets as pp  # noqa: E402

MODELS = os.path.join(pp.ROOT, "apps", "web", "public", "models")
THUMBS = os.path.join(pp.PRESETS, "thumbs")
THUMB_PX = 512
CHECK_PX = 320
# サムネイルの色（ブラウザの初期値と同じにする想定）
THUMB_HAIR = pp.HAIR_COLORS[1]
THUMB_SKIN = pp.SKIN_COLORS[1]
INSIDE_M = 0.002            # 体の面からこれより内側にある頂点を「めり込み」と数える
CHECK_HEIGHTS_CM = [150.0, 195.0]


def srgb_to_linear(hex_color):
    c = np.array([int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return tuple(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4))


def import_glb(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if len(objs) != 1:
        raise RuntimeError(f"{path}: メッシュが{len(objs)}個")
    obj = objs[0]
    obj.name = name
    return obj


def tint(obj, hex_color):
    """ブラウザと同じく、テクスチャに色を掛ける（Base Color の前に掛け算を挟む）"""
    for mat in obj.data.materials:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
        sock = bsdf.inputs["Base Color"]
        if not sock.is_linked:
            sock.default_value = (*srgb_to_linear(hex_color), 1.0)
            continue
        src = sock.links[0].from_socket
        mul = nodes.new("ShaderNodeVectorMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = srgb_to_linear(hex_color)
        links.new(src, mul.inputs[0])
        links.new(mul.outputs[0], sock)


def hide_under_shoes(body):
    """ブラウザで靴を履いたときと同じく、_shoe が 1 の体の頂点を隠す"""
    attr = body.data.attributes.get("_SHOE") or body.data.attributes.get("_shoe")
    w = np.empty(len(body.data.vertices), dtype=np.float32)
    attr.data.foreach_get("value", w)
    g = body.vertex_groups.new(name="shoe")
    g.add([int(i) for i in np.where(w > 0.5)[0]], 1.0, "REPLACE")
    m = body.modifiers.new("shoe", "MASK")
    m.vertex_group, m.invert_vertex_group = "shoe", True
    m.show_render = m.show_viewport = False
    return m, w


def set_keys(objs, values):
    for o in objs:
        for k in o.data.shape_keys.key_blocks[1:]:
            k.value = values.get(k.name, 0.0)


def bbox(objs):
    pts = np.vstack([pt.mixed_coords(o, current_values(o)) for o in objs])
    return pts.min(0), pts.max(0)


def current_values(o):
    return {k.name: k.value for k in o.data.shape_keys.key_blocks[1:]}


def setup_scene():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError as e:
        pt.log("EEVEE が使えない:", e)
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w"); sc.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.55, 0.55, 0.58, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    for rot, energy in (((math.radians(50), 0, math.radians(-30)), 3.0), ((math.radians(60), 0, math.radians(150)), 1.5)):
        ld = bpy.data.lights.new("sun", "SUN"); ld.energy = energy
        lo = bpy.data.objects.new("sun", ld); lo.rotation_euler = rot
        sc.collection.objects.link(lo)
    cd = bpy.data.cameras.new("cam"); cd.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
    return cam


VIEWS = {"front": 0.0, "angle": 45.0, "back": 180.0}


def render(cam, lo, hi, view, path, px, margin=1.2):
    """lo〜hi の箱が収まるように、view の向き（着用者の正面から左回りの角度）から描く"""
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = px
    c = (lo + hi) / 2
    a = math.radians(VIEWS[view])
    d = Vector((math.sin(a), -math.cos(a), 0.0))         # 着用者は −Y を向く。45° は着用者の左前
    cam.location = Vector(c) + d * 3.0
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = float(max(hi - lo)) * margin
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def penetration(body, hidden, obj, values):
    """obj の頂点のうち、体の面から INSIDE_M より内側にある数と最大の深さ（cm）。隠した体の面は除く"""
    B = pt.mixed_coords(body, values)
    polys = [p for p in pt.polys_of(body) if not any(hidden[i] > 0.5 for i in p)]
    bvh = BVHTree.FromPolygons([Vector(p) for p in B], polys)
    P = pt.mixed_coords(obj, values)
    depth = []
    for p in P:
        loc, n, _, _ = bvh.find_nearest(Vector(p), 0.05)
        if loc is not None:
            sd = (Vector(p) - loc).dot(n)
            if sd < -INSIDE_M:
                depth.append(-sd)
    return len(depth), (max(depth) * 100 if depth else 0.0)


def compose(paths, cols, out):
    """同じ大きさの画像を cols 列に並べて1枚にする（白背景）"""
    imgs = [bpy.data.images.load(p, check_existing=False) for p in paths]
    w, h = imgs[0].size
    rows = math.ceil(len(imgs) / cols)
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for k, img in enumerate(imgs):
        px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
        px = px.reshape(h, w, 4)
        a = px[:, :, 3:4]
        r, c = rows - 1 - k // cols, k % cols                   # bpy の画素は下の行から
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w, :3] = px[:, :, :3] * a + (1 - a)
        bpy.data.images.remove(img)
    res = bpy.data.images.new("sheet", cols * w, rows * h, alpha=True)
    res.pixels.foreach_set(sheet.ravel())
    res.filepath_raw = out; res.file_format = "PNG"; res.save()
    pt.log("確認画像:", out)


def main():
    pt.clear_scene()
    with open(os.path.join(pp.PRESETS, "presets.json"), encoding="utf-8") as fp:
        presets = json.load(fp)
    with open(os.path.join(MODELS, "tshirt_male_height.json"), encoding="utf-8") as fp:
        standard_cm = json.load(fp)["standard_cm"]
    body = import_glb(os.path.join(MODELS, "avatar_male.glb"), "avatar")
    tint(body, THUMB_SKIN)
    mask, hidden = hide_under_shoes(body)
    items = []
    for kind in ("hair", "shoes"):
        for e in presets[kind]:
            obj = import_glb(os.path.join(pp.ROOT, "apps", "web", "public", e["path"].lstrip("/")), f"{kind}_{e['id']}")
            if kind == "hair":
                tint(obj, THUMB_HAIR)
            obj.hide_render = True
            items.append((kind, e["id"], obj))
    cam = setup_scene()
    os.makedirs(THUMBS, exist_ok=True)

    def frame(kind, obj):
        """髪は頭と髪、靴はひざ下と靴が入る箱"""
        lo, hi = bbox([obj])
        B = pt.mixed_coords(body, current_values(body))
        if kind == "hair":
            top = B[:, 2].max()
            head = B[B[:, 2] > top - 0.28]
        else:
            head = B[B[:, 2] < 0.12]
        return np.minimum(lo, head.min(0)), np.maximum(hi, head.max(0))

    # サムネイル（標準体型・標準の身長）
    for kind, pid, obj in items:
        obj.hide_render = False
        mask.show_render = kind == "shoes"
        lo, hi = frame(kind, obj)
        for view in ("front", "angle"):
            render(cam, lo, hi, view, os.path.join(THUMBS, f"{kind}_{pid}_{view}.png"), THUMB_PX)
        obj.hide_render = True

    # 体型4種 × プリセット（斜め45°と後ろ）
    tmp = os.path.join(pp.OUT, "check")
    os.makedirs(tmp, exist_ok=True)
    paths = []
    for b in pt.BUILDS:
        vals = pt.build_values(b)
        set_keys([body] + [o for *_, o in items], vals)
        for kind, pid, obj in items:
            obj.hide_render = False
            mask.show_render = kind == "shoes"
            lo, hi = frame(kind, obj)
            for view in ("angle", "back"):
                p = os.path.join(tmp, f"{b}_{kind}_{pid}_{view}.png")
                render(cam, lo, hi, view, p, CHECK_PX)
                paths.append(p)
            obj.hide_render = True
    compose(paths, len(items) * 2, os.path.join(pp.OUT, "builds_check.png"))

    # めり込み（体型4種 × 身長3つ）
    pt.log(f"めり込み（体の面から{INSIDE_M * 1000:.0f}mmより内側の頂点数／最大の深さ）")
    for b in pt.BUILDS:
        for h_cm in [standard_cm] + CHECK_HEIGHTS_CM:
            vals = pt.build_values(b, None, h_cm - standard_cm)
            res = [f"{kind}/{pid} {n} ({d:.2f}cm)" for kind, pid, obj in items
                   for n, d in [penetration(body, hidden, obj, vals)]]
            pt.log(f"  {b:8s} {h_cm:6.1f}cm  " + ", ".join(res))
    pt.log("完了")


main()
