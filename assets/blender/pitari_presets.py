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
SKIN = os.path.join(MH_DATA, "skins", "young_caucasian_male", "young_lightskinned_male_diffuse.png")
HAIR_COLORS = ["#1E1B19", "#3E2C22", "#6B4A32", "#9C7451", "#C9A86A", "#9A9894"]
SKIN_COLORS = ["#F3E2D2", "#E8CBB0", "#D6AC89", "#BC8963", "#8F5E3D", "#5C3B26"]

TEXTURE_MAX = 1024
# 灰色にしたテクスチャの明るさの中央値。色を掛けたとき、だいたい指定の色に見えるよう1より少し下にする
# （明るい所が白で頭打ちにならないように）
HAIR_GRAY_MEDIAN = 0.8
SKIN_GRAY_MEDIAN = 0.9
SHOE_RGBA = (0.92, 0.92, 0.92, 1.0)
SHOE_DELETE_GROUP = "Delete." + SHOES["sneaker"][0]


def mhclo_path(kind, name):
    return os.path.join(MH_DATA, "hair" if kind == "hair" else "clothes", name, f"{name}.mhclo")


def add_asset(body, kind, name):
    """髪・靴を体に着せる。MPFB の材質とモディファイアは外し、体の Mask（靴の下を隠す）も外す。
    体には靴で隠れる頂点の頂点グループ（Delete.<name>）が残る"""
    obj = HumanService.add_mhclo_asset(mhclo_path(kind, name), body,
                                       asset_type="Hair" if kind == "hair" else "Clothes",
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

def gray_texture(src, name, median, keep_alpha, file_format):
    """src の画像を灰色（明るさだけ）にし、TEXTURE_MAX 以下へ縮めて OUT に保存した bpy の画像を返す。
    明るさは、色のある画素（不透明な所）の中央値が median になるよう揃える"""
    img = bpy.data.images.load(src, check_existing=False)
    w, h = img.size
    s = min(1.0, TEXTURE_MAX / max(w, h))
    if s < 1.0:
        img.scale(int(w * s), int(h * s))
        w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    lum = px[:, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    used = (px[:, 3] > 0.5) & (lum > 0.02)              # 透明な所と、UVの外の黒い所は除く
    lum = np.clip(lum * (median / float(np.median(lum[used]))), 0.0, 1.0)
    # 透明な所の色（白などのことがある）は、縮小やミップマップで縁に混ざって白い線になるので、明るさの中央値で埋める
    lum[px[:, 3] <= 0.5] = median
    out = np.empty_like(px)
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
    img = gray_texture(SKIN, "skin_gray", SKIN_GRAY_MEDIAN, keep_alpha=False, file_format="JPEG")
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


def shoe_material(obj):
    pt.simple_material(obj, "shoes", SHOE_RGBA)
