"""
女性アバターの共通処理（Blender 4.2 + MPFB2 2.0.x）：着せるための体と、女性の体の身幅

着せるための体は、本物の体の胸の前だけを前へ出した、見えないメッシュ。服の着せ直し（mhclo）・押し出し・検証はこれに対して行う。
  1. 谷間を埋める：高さごとに、胴の切り口の前側を、左右のふくらみの外側で結ぶ（ブラや巻き尺と同じ形）
  2. 胸の下を落とす：胸の一番前の点（乳首の高さ）から下は、縦の列ごとに、前面をウエストへまっすぐ下ろす
どちらも切り口・縦の列の「前側の凸包」で、手では形を決めない。体の形から計算するので、体型・身長キーの体にも同じ計算をする。
mhclo の服は体の helper（helper-tights）の頂点を基準に着せるので、肌と helper-tights の両方に同じ計算をする。
体は変形させない（ADR 0007）。
"""
import os

import bpy
import numpy as np

import pitari_presets as pp
import pitari_tshirt as pt

SKIN = os.path.join(pp.MH_DATA, "skins", "young_caucasian_female", "young_lightskinned_female_diffuse.png")
FIT_NAME = "avatar_fit"     # 着せるための体のオブジェクト名（glb のメッシュ名）

FIT_STEP = 0.005            # 前面の高さ・横の位置を、この間隔の格子で調べる
FIT_HALF_WIDTH = 0.16       # 体の中心から左右この幅まで（腕を含めない）
FIT_EDGE_FADE = 0.03        # 左右の端のこの幅で、前へ出す量を 0 へ下げる
FIT_BUST_RISE = 0.10        # 谷間を埋めるのは、乳首の高さからこの高さ上まで
FIT_TOP_FADE = 0.03         # その上端のこの幅で、前へ出す量を 0 へ下げる
FIT_FRONT_TOL = 0.006       # 前面からこの距離以内の頂点を、前面の頂点として動かす
WAIST_SEARCH = 0.01         # ウエスト（胴の一周が一番短い高さ）を、この間隔で探す


def group_verts(body, name):
    g = body.vertex_groups[name].index
    return np.array([v.index for v in body.data.vertices if any(x.group == g for x in v.groups)])


def _faces_within(polys, verts):
    inside = np.zeros(max(max(p) for p in polys) + 1, bool)
    inside[verts] = True
    return [p for p in polys if all(inside[i] for i in p)]


def fit_topology(body):
    """着せるための体を計算するのに使う、頂点番号の組（どの体型・身長の体でも同じ）"""
    polys = pt.polys_of(body)
    skin = np.where(pt.helper_keep_mask(body))[0]
    tights = group_verts(body, "helper-tights")
    return {
        "surfaces": [(skin, _faces_within(polys, skin)), (tights, _faces_within(polys, tights))],
        "skin_faces": _faces_within(polys, skin),
        "nipples": group_verts(body, "nippleTip"),
        "spine": group_verts(body, "joint-spine-3"),
    }


def bust_z(P, topo):
    """胸の一番前の点（乳首）の高さ"""
    return float(P[topo["nipples"], 2].mean())


def waist_z(P, topo):
    """ウエスト：腰の関節（joint-spine-3）から乳首までで、胴の一周が一番短い高さ"""
    z0, z1 = float(P[topo["spine"], 2].mean()), bust_z(P, topo)
    zs = np.arange(z0, z1, WAIST_SEARCH)
    return float(zs[np.argmin([pt.body_width(P, topo["skin_faces"], z) for z in zs])])


def front_profile(P, faces, zs, xs):
    """高さ zs・横の位置 xs の格子で、胴の前面の y（MPFB は前が −Y なので、切り口の y の最小）。無い所は nan"""
    F = np.full((len(zs), len(xs)), np.nan)
    quads = np.array([p if len(p) == 4 else (p[0], p[1], p[2], p[2]) for p in faces])
    for i, z in enumerate(zs):
        pts = []
        for k in range(4):
            a, b = P[quads[:, k]], P[quads[:, (k + 1) % 4]]
            cross = (a[:, 2] - z) * (b[:, 2] - z) < 0
            t = (z - a[cross, 2]) / (b[cross, 2] - a[cross, 2])
            pts.append((np.where(cross)[0], a[cross] + t[:, None] * (b[cross] - a[cross])))
        face = np.concatenate([f for f, _ in pts])
        xy = np.concatenate([p for _, p in pts])[:, :2]
        order = np.argsort(face, kind="stable")
        face, xy = face[order], xy[order]
        pair = face[:-1] == face[1:]                      # 面ごとに 2 点（切り口の線分）
        a, b = xy[:-1][pair], xy[1:][pair]
        lo, hi = np.minimum(a[:, 0], b[:, 0]), np.maximum(a[:, 0], b[:, 0])
        for j, x in enumerate(xs):
            hit = (lo <= x) & (x < hi)
            if hit.any():
                t = (x - a[hit, 0]) / (b[hit, 0] - a[hit, 0])
                F[i, j] = (a[hit, 1] + t * (b[hit, 1] - a[hit, 1])).min()
    return F


def _front_envelope(t, y):
    """点 (t, y) の前側（y の小さい側）の凸包を、t の位置で返す。nan の点は使わず、nan のまま返す"""
    ok = ~np.isnan(y)
    out = np.full_like(y, np.nan)
    if ok.sum() < 2:
        out[ok] = y[ok]
        return out
    hull = []
    for p in zip(t[ok], y[ok]):
        while len(hull) >= 2:
            (t0, y0), (t1, y1) = hull[-2], hull[-1]
            if (t1 - t0) * (p[1] - y0) - (y1 - y0) * (p[0] - t0) <= 0:   # 左回りでなければ除く
                hull.pop()
            else:
                break
        hull.append(p)
    h = np.array(hull)
    out[ok] = np.interp(t[ok], h[:, 0], h[:, 1])
    return out


def _bilinear(G, zs, xs, z, x):
    """格子 G（nan は 0 として）を点 (z, x) で直線補間する。格子の外は 0"""
    G = np.nan_to_num(G)
    fi = (z - zs[0]) / FIT_STEP
    fj = (x - xs[0]) / FIT_STEP
    inside = (fi >= 0) & (fi <= len(zs) - 1) & (fj >= 0) & (fj <= len(xs) - 1)
    i0 = np.clip(np.floor(fi).astype(int), 0, len(zs) - 2)
    j0 = np.clip(np.floor(fj).astype(int), 0, len(xs) - 2)
    u, v = np.clip(fi - i0, 0, 1), np.clip(fj - j0, 0, 1)
    val = (G[i0, j0] * (1 - u) * (1 - v) + G[i0 + 1, j0] * u * (1 - v)
           + G[i0, j0 + 1] * (1 - u) * v + G[i0 + 1, j0 + 1] * u * v)
    return np.where(inside, val, 0.0)


def _fit_surface(P, verts, faces, z_waist, z_bust):
    """1 つの面（肌か helper-tights）の、前面の頂点を前へ出す量（y だけ, verts と同じ並び）"""
    zs = np.arange(z_waist, z_bust + FIT_BUST_RISE + FIT_STEP / 2, FIT_STEP)
    xs = np.arange(-FIT_HALF_WIDTH, FIT_HALF_WIDTH + FIT_STEP / 2, FIT_STEP)
    F = front_profile(P, faces, zs, xs)
    # 1. 高さごとに、前面を左右のふくらみの外側で結ぶ
    G = np.array([_front_envelope(xs, row) for row in F])
    # 2. 乳首の高さから下は、縦の列ごとに前面をウエストへまっすぐ下ろす
    below = zs <= z_bust
    for j in range(len(xs)):
        G[below, j] = _front_envelope(zs[below], G[below, j])
    D = G - F                                               # 0 以下（前へ出す）
    D *= (1 - pt._smooth01((np.abs(xs) - (FIT_HALF_WIDTH - FIT_EDGE_FADE)) / FIT_EDGE_FADE))[None, :]
    D *= (1 - pt._smooth01((zs - (z_bust + FIT_BUST_RISE - FIT_TOP_FADE)) / FIT_TOP_FADE))[:, None]
    V = P[verts]
    front = V[:, 1] - _bilinear(F, zs, xs, V[:, 2], V[:, 0]) < FIT_FRONT_TOL
    return np.where(front, _bilinear(D, zs, xs, V[:, 2], V[:, 0]), 0.0)


def fit_coords(P, topo):
    """体の形 P（helper 込みの全頂点、ワールド座標）から、着せるための体の形を作る"""
    zb, zw = bust_z(P, topo), waist_z(P, topo)
    out = P.copy()
    for verts, faces in topo["surfaces"]:
        out[verts, 1] += _fit_surface(P, verts, faces, zw, zb)
    return out


def dress_on_fit(dress, topo):
    """dress（体に服を着せる関数）を、着せるための体の形に着せる関数にする。
    体にキー __fit（着せるための体との差）を値 1 で足して mhclo で着せ、着せたらキーを消す"""
    def dress_fit(body):
        P = pt.body_mix_coords(body)
        basis = pt.world_coords(body, body.data.shape_keys.reference_key.name)
        key = pt.set_key_from_world(body, "__fit", basis + fit_coords(P, topo) - P)
        key.value = 1.0
        garment = dress(body)
        body.shape_key_remove(key)
        return garment
    return dress_fit


def add_fit_body(body, keep, topo, std, shapes, height_shapes, thumb_in):
    """着せるための体のメッシュ（焼き込んだ体と同じ頂点の並び）。体と同じ体型キー・身長キー・thumb_in と _cover を持つ。
    std・shapes・height_shapes・thumb_in は helper 込みの体の形（build_tshirt と同じ）、keep は残した頂点"""
    fit_std = fit_coords(std, topo)[keep]
    me = bpy.data.meshes.new(FIT_NAME)
    M = np.array(body.matrix_world.inverted())
    me.from_pydata([tuple(p) for p in fit_std @ M[:3, :3].T + M[:3, 3]], [], pt.polys_of(body))
    me.shade_smooth()                       # 面ごとに頂点が分かれて glb が大きくならないように
    # 体と同じ UV を持たせる。glb は UV の継ぎ目で頂点を分けるので、そろえないと頂点の並びが体と変わり、
    # ブラウザで着せるための体の頂点番号を体に使えない（袖の中に隠れる腕など）
    src = body.data.uv_layers.active
    uv = np.empty(len(src.data) * 2)
    src.data.foreach_get("uv", uv)
    me.uv_layers.new(name=src.name).data.foreach_set("uv", uv)
    me.update()
    fit = bpy.data.objects.new(FIT_NAME, me)
    bpy.context.scene.collection.objects.link(fit)
    fit.matrix_world = body.matrix_world.copy()
    cover = np.empty(len(body.data.vertices), dtype=np.float32)
    body.data.attributes["_cover"].data.foreach_get("value", cover)
    pt.set_point_attribute(fit, "_cover", cover)
    fit.shape_key_add(name="Basis", from_mix=False)
    for b, (body_co, _) in shapes.items():
        pt.set_key_from_world(fit, pt.build_key(b), fit_coords(body_co, topo)[keep])
    for d, (body_co, _) in height_shapes.items():
        pt.set_key_from_world(fit, pt.height_key(d), pt.height_key_world(fit_std, fit_coords(body_co, topo)[keep]))
    pt.set_key_from_world(fit, "thumb_in", fit_std + (thumb_in - std)[keep])
    moved = np.linalg.norm(fit_std - std[keep], axis=1)
    pt.log(f"{FIT_NAME}: 前へ出した頂点 {int((moved > 1e-4).sum())}（最大 {moved.max() * 100:.2f}cm）")
    return fit


def bust_verts(topo, keep):
    """焼き込んだ体（helper を消した頂点の並び）での乳首の頂点番号"""
    return np.searchsorted(np.where(keep)[0], topo["nipples"])


def body_width(P, fit_P, body_polys, z, z_bust):
    """女性の体の身幅（cm）：脇の下 1cm 下（z）の胴の一周 ÷ 2 と、着せるための体で胸の一番高い所（z_bust）の一周 ÷ 2 の大きい方。
    胸の一番高い所は脇の下より下にあり、脇の下の高さだけでは胸の大きさが入らないため"""
    return max(pt.body_width(P, body_polys, z), pt.body_width(fit_P, body_polys, z_bust))
