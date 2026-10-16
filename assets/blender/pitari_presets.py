"""
Pitari アバターのプリセット（髪・靴・肌）の共通処理（Blender 4.2 + MPFB2 2.0.x）

build_tshirt.py（体の肌と、靴で隠れる足の頂点属性）と build_presets.py（髪・靴の glb）から import して使う。
色はブラウザで掛け合わせるので、テクスチャは明暗だけの灰色にする。
"""
import os

import bpy
import numpy as np

from bl_ext.blender_org.mpfb.services.humanservice import HumanService

import pitari_tshirt as pt

MH_DATA = r"C:\MakeHuman\data"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PRESETS = os.path.join(ROOT, "apps", "web", "public", "presets")
OUT = os.path.join(HERE, "out", "presets")

# id → (MakeHumanのアセット, 表示名)。ファイルは PRESETS/hair/<id>.glb
HAIR = {
    "short": ("short02", "ショート"),
    "medium": ("short03", "ミディアム"),
    "long": ("long01", "ロング"),
    "spiky": ("short01", "無造作ショート"),
}
SHOES = {
    "sneaker": ("shoes05", "スニーカー"),
}
# 顔のパーツ（目・眉毛・まつ毛）。いつも着ける。PRESETS/face/face.glb に 1 つにまとめる
FACE = {
    "eyes": ("eyes", "low-poly"),
    "eyebrows": ("eyebrows", "eyebrow001"),
    "eyelashes": ("eyelashes", "eyelashes01"),
}
EYE_TEXTURE = os.path.join(MH_DATA, "eyes", "materials", "brown_eye.png")
SKIN = os.path.join(MH_DATA, "skins", "young_caucasian_male", "young_lightskinned_male_diffuse.png")
HAIR_COLORS = ["#1E1B19", "#3E2C22", "#6B4A32", "#9C7451", "#C9A86A", "#9A9894"]
SKIN_COLORS = ["#F3E2D2", "#E8CBB0", "#D6AC89", "#BC8963", "#8F5E3D", "#5C3B26"]

TEXTURE_MAX = 1024
# 灰色にしたテクスチャの明るさの中央値。色を掛けたとき、だいたい指定の色に見えるよう1より少し下にする
# （明るい所が白で頭打ちにならないように）
HAIR_GRAY_MEDIAN = 0.8
SKIN_GRAY_MEDIAN = 0.9
# 眉毛・まつ毛のテクスチャは薄い半透明なので、アルファをこの倍にしてから 0.5 で切る
BROW_ALPHA_GAIN = 3.0
SHOE_DELETE_GROUP = "Delete." + SHOES["sneaker"][0]


# 種類 → (MakeHuman の data の下のフォルダ, MPFB の asset_type)
KINDS = {
    "hair": ("hair", "Hair"),
    "shoes": ("clothes", "Clothes"),
    "eyes": ("eyes", "Eyes"),
    "eyebrows": ("eyebrows", "Eyebrows"),
    "eyelashes": ("eyelashes", "Eyelashes"),
}


def mhclo_path(kind, name):
    return os.path.join(MH_DATA, KINDS[kind][0], name, f"{name}.mhclo")


def add_asset(body, kind, name):
    """髪・靴・顔のパーツを体に着せる。MPFB の材質とモディファイアは外し、体の Mask（靴の下を隠す）も外す。
    体には靴で隠れる頂点の頂点グループ（Delete.<name>）が残る"""
    obj = HumanService.add_mhclo_asset(mhclo_path(kind, name), body, asset_type=KINDS[kind][1],
                                       subdiv_levels=0, set_up_rigging=False)
    obj.name = name
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)
    for m in list(body.modifiers):
        if m.type == "MASK" and m.vertex_group.startswith("Delete."):
            body.modifiers.remove(m)
    return obj


def vertex_group_weights(obj, group):
    """頂点グループに入っている頂点を1、ほかを0にした配列"""
    g = obj.vertex_groups[group].index
    return np.array([float(any(x.group == g and x.weight > 0 for x in v.groups)) for v in obj.data.vertices])


# ---------------------------------------------------------------- テクスチャ

def gray_texture(src, name, median, keep_alpha, file_format, keep_hue=False, alpha_gain=1.0):
    """src の画像を灰色（明るさだけ）にし、TEXTURE_MAX 以下へ縮めて OUT に保存した bpy の画像を返す。
    明るさは、色のある画素（不透明な所）の中央値が median になるよう揃える。
    keep_hue なら灰色にせず、色ごとに中央値で割って、平均の色からの色の差（唇・ほおの赤みなど）を残す。
    alpha_gain はアルファに掛ける倍率（薄い眉毛が、アルファ 0.5 で切ったときに消えないように）"""
    img = bpy.data.images.load(src, check_existing=False)
    w, h = img.size
    s = min(1.0, TEXTURE_MAX / max(w, h))
    if s < 1.0:
        img.scale(int(w * s), int(h * s))
        w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    px[:, 3] = np.clip(px[:, 3] * alpha_gain, 0.0, 1.0)
    lum = px[:, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    used = (px[:, 3] > 0.5) & (lum > 0.02)              # 透明な所と、UVの外の黒い所は除く
    lum = np.clip(lum * (median / float(np.median(lum[used]))), 0.0, 1.0)
    # 透明な所の色（白などのことがある）は、縮小やミップマップで縁に混ざって白い線になるので、明るさの中央値で埋める
    lum[px[:, 3] <= 0.5] = median
    out = np.empty_like(px)
    if keep_hue:
        med = np.median(px[used, :3], axis=0)
        out[:, :3] = np.clip(px[:, :3] / med * median, 0.0, 1.0)
    else:
        out[:, 0] = out[:, 1] = out[:, 2] = lum
    out[:, 3] = px[:, 3] if keep_alpha else 1.0
    bpy.data.images.remove(img)

    os.makedirs(OUT, exist_ok=True)
    ext = "png" if file_format == "PNG" else "jpg"
    res = bpy.data.images.new(name, w, h, alpha=keep_alpha)
    res.pixels.foreach_set(out.ravel())
    res.filepath_raw = os.path.join(OUT, f"{name}.{ext}")
    res.file_format = file_format
    res.save()
    pt.log(f"テクスチャ {name}: {w}×{h}, 中央値 {median}（元の中央値 {float(np.median(px[used, :3])):.3f}）")
    return res


def _textured_material(name, image, alpha_clip):
    """画像を Base Color に入れた材質。alpha_clip なら画像のアルファを Math:Round に通す。
    glTF の書き出しはこの形を alphaMode MASK（alphaCutoff 0.5）として出し、three.js では alphaTest で描かれる"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.8
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha_clip:
        clip = nodes.new("ShaderNodeMath")
        clip.operation = "ROUND"
        links.new(tex.outputs["Alpha"], clip.inputs[0])
        links.new(clip.outputs[0], bsdf.inputs["Alpha"])
        mat.blend_method = "CLIP"
        mat.use_backface_culling = False            # 髪は板ポリゴンなので両面を描く（glTF の doubleSided）
    return mat


def skin_material(body):
    # 灰色にすると唇やほおの赤みも消えて顔色が悪く見えるので、平均の色からの色の差は残す
    img = gray_texture(SKIN, "skin_detail", SKIN_GRAY_MEDIAN, keep_alpha=False, file_format="JPEG", keep_hue=True)
    body.data.materials.clear()
    body.data.materials.append(_textured_material("skin", img, alpha_clip=False))


def diffuse_texture(asset):
    """髪の .mhmat に書かれた diffuseTexture のファイル名"""
    with open(os.path.join(MH_DATA, "hair", asset, f"{asset}.mhmat"), encoding="utf-8") as fp:
        return next(line.split(None, 1)[1].strip() for line in fp if line.startswith("diffuseTexture"))


def hair_material(obj, asset):
    src = os.path.join(MH_DATA, "hair", asset, diffuse_texture(asset))
    img = gray_texture(src, f"{asset}_gray", HAIR_GRAY_MEDIAN, keep_alpha=True, file_format="PNG")
    obj.data.materials.clear()
    obj.data.materials.append(_textured_material(f"hair_{asset}", img, alpha_clip=True))


EYE_SATURATION = 0.45       # MakeHuman の茶色の目は赤みが強く、赤い目に見えるので、色みをこの割合に抜く
EYE_TEXTURE_PX = 512


def eye_texture():
    """目のテクスチャ。色みを EYE_SATURATION に抜いて、EYE_TEXTURE_PX に縮める"""
    img = bpy.data.images.load(EYE_TEXTURE, check_existing=False)
    img.scale(EYE_TEXTURE_PX, EYE_TEXTURE_PX)
    px = np.empty(EYE_TEXTURE_PX * EYE_TEXTURE_PX * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    lum = px[:, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    px[:, :3] = lum[:, None] + (px[:, :3] - lum[:, None]) * EYE_SATURATION
    bpy.data.images.remove(img)
    res = bpy.data.images.new("eyes", EYE_TEXTURE_PX, EYE_TEXTURE_PX)
    res.pixels.foreach_set(px.ravel())
    os.makedirs(OUT, exist_ok=True)
    res.filepath_raw = os.path.join(OUT, "eyes.jpg")
    res.file_format = "JPEG"
    res.save()
    return res


def face_material(obj, kind, asset):
    """目は元の色のテクスチャ。眉毛・まつ毛は髪と同じく灰色にして、ブラウザで髪の色を掛ける"""
    obj.data.materials.clear()
    if kind == "eyes":
        obj.data.materials.append(_textured_material("eyes", eye_texture(), alpha_clip=False))
        return
    src = os.path.join(MH_DATA, kind, asset, f"{asset}.png")
    img = gray_texture(src, f"{asset}_gray", HAIR_GRAY_MEDIAN, keep_alpha=True, file_format="PNG",
                       alpha_gain=BROW_ALPHA_GAIN)
    obj.data.materials.append(_textured_material(f"hair_{asset}", img, alpha_clip=True))


def export_glb_many(objs, path):
    """複数のオブジェクトを 1 つの glb に書き出す（顔のパーツ）"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        for k in o.data.shape_keys.key_blocks:
            k.value = 0.0
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
                              export_morph=True, export_morph_normal=True, export_animations=False,
                              export_skins=False, export_yup=True)
    pt.log("GLB:", path)


# 靴のテクスチャ（shoes05_diffuse.png）で靴下が入っている所（右下の四角、Blender の UV）
SOCK_UV_MIN = (0.76, 0.0)
SOCK_UV_MAX = (1.0, 0.155)
SOCK_GRAY_MEDIAN = 0.85


def shoe_texture(asset):
    """靴のテクスチャを灰色にする。靴は明るさをそのまま使う（白い甲と黒い側面・靴底の明暗を残す）。
    靴下の四角は明るさの中央値を SOCK_GRAY_MEDIAN に揃える（ブラウザで靴下の色を掛けるため）"""
    src = os.path.join(MH_DATA, "clothes", asset, f"{asset}_diffuse.png")
    img = bpy.data.images.load(src, check_existing=False)
    w, h = img.size
    s = min(1.0, TEXTURE_MAX / max(w, h))
    if s < 1.0:
        img.scale(int(w * s), int(h * s))
        w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)                                  # bpy の画素は下の行から（v が小さい方から）
    bpy.data.images.remove(img)
    lum = px[:, :, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    x0, x1 = int(SOCK_UV_MIN[0] * w), int(SOCK_UV_MAX[0] * w)
    y0, y1 = int(SOCK_UV_MIN[1] * h), int(SOCK_UV_MAX[1] * h)
    sock = lum[y0:y1, x0:x1]
    lum[y0:y1, x0:x1] = np.clip(sock * (SOCK_GRAY_MEDIAN / float(np.median(sock))), 0, 1)
    out = np.ones((h, w, 4), dtype=np.float32)
    out[:, :, 0] = out[:, :, 1] = out[:, :, 2] = lum
    res = bpy.data.images.new(f"{asset}_gray", w, h)
    res.pixels.foreach_set(out.ravel())
    os.makedirs(OUT, exist_ok=True)
    res.filepath_raw = os.path.join(OUT, f"{asset}_gray.jpg"); res.file_format = "JPEG"; res.save()
    return res


def shoe_material(obj, asset):
    """靴と靴下で材質を分ける（材質名 shoes と socks。ブラウザで別々の色を掛けられる）。どちらも同じ灰色のテクスチャ"""
    img = shoe_texture(asset)
    me = obj.data
    me.materials.clear()
    me.materials.append(_textured_material("shoes", img, alpha_clip=False))
    me.materials.append(_textured_material("socks", img, alpha_clip=False))
    uv = me.uv_layers.active.data
    socks = 0
    for p in me.polygons:
        u, v = np.mean([uv[li].uv for li in p.loop_indices], axis=0)
        is_sock = SOCK_UV_MIN[0] <= u <= SOCK_UV_MAX[0] and SOCK_UV_MIN[1] <= v <= SOCK_UV_MAX[1]
        p.material_index = 1 if is_sock else 0
        socks += is_sock
    pt.log(f"靴下の面 {socks} / {len(me.polygons)}")
