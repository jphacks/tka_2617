"""
Pitari 長袖のシャツの生成（Blender 4.2 + MPFB2 2.0.x）

MPFB の male_casualsuit03 のシャツの部分（先頭 1613 頂点、後ろはジーンズ）を使う。
前は元から左右に分かれていて、裾・左右の前の縁・襟の外側が 1 本の縁の輪になっている。
寸法の 4 項目・キー名・測り方は Tシャツと同じで、基準点の見つけ方だけをこのシャツの形に合わせる。
袖は元から手首まであるので、長袖（pitari_longsleeve）の袖丈キー・垂れ方のキー・_sleeve をそのまま使う。
"""
import bmesh
import numpy as np

import pitari_tshirt as pt
from bl_ext.blender_org.mpfb.services.humanservice import HumanService

MHCLO = r"C:\MakeHuman\data\clothes\male_casualsuit03\male_casualsuit03.mhclo"
SHIRT_VERTS = 1613          # casualsuit03 の先頭 1613 頂点がシャツ（後ろはジーンズ）
SUIT_VERTS = 2499
SLEEVE_X = 0.2              # UV の島の中心が |x| > これなら袖
COLLAR_Z = 0.08             # 襟の島：島の一番下が、シャツの一番上からこの距離以内
HEM_BAND = 0.04             # 縁の輪のうち、一番下からこの高さまでを裾とする
SLEEVE_RINGS = 12           # 袖を付け根から袖口まで、この数の輪（区間）に分けて腕の中心線を作る


def fold_ring(P, sv, inner):
    """手首の折り返しの輪（袖口）。casualsuit03 の袖口は手首で内側へ折り返され、裏地が前腕の途中まで戻って
    そこで縁の輪（inner）になっている。袖の向き（袖の頂点の中心 → inner の中心）で一番先にある、inner と同じ数の頂点"""
    c = P[inner].mean(0)
    sv = np.array(sorted(sv))
    d = c - P[sv].mean(0); d /= np.linalg.norm(d)
    t = (P[sv] - c) @ d
    return [int(i) for i in sv[np.argsort(-t)[:len(inner)]]]


def add_shirt(body):
    """casualsuit03 を着せ、ジーンズ部分を消してシャツだけにする"""
    shirt = HumanService.add_mhclo_asset(MHCLO, body, asset_type="Clothes", subdiv_levels=0,
                                         set_up_rigging=False)
    shirt.name = "shirt"
    for m in list(shirt.modifiers):
        shirt.modifiers.remove(m)
    for m in list(body.modifiers):
        if m.type == "MASK" and "casualsuit" in m.name:
            body.modifiers.remove(m)
    me = shirt.data
    if len(me.vertices) != SUIT_VERTS:
        raise RuntimeError(f"casualsuit03 の頂点数が想定外: {len(me.vertices)}")
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in range(SHIRT_VERTS, len(bm.verts))], context="VERTS")
    bm.to_mesh(me); bm.free(); me.update()
    return shirt


def _sleeve_rings(P, sleeve, seam, cuff):
    """袖の頂点を、付け根（縫い目の中心）→ 袖口の直線上の位置で SLEEVE_RINGS 個の区間に分ける。
    最後は袖口の輪。長袖の袖丈キー（pitari_longsleeve）が、区間の中心を結んで腕の中心線にする"""
    c0, c1 = P[seam].mean(0), P[cuff].mean(0)
    u = (c1 - c0) / np.linalg.norm(c1 - c0)
    L = float((c1 - c0) @ u)
    rest = [i for i in sleeve if i not in set(cuff) and i not in set(seam)]
    t = np.clip(((P[rest] - c0) @ u) / L, 0, 0.999)
    bins = (t * SLEEVE_RINGS).astype(int)
    rings = [[int(i) for i, b in zip(rest, bins) if b == k] for k in range(SLEEVE_RINGS)]
    return [r for r in rings if r] + [list(cuff)]


def find_landmarks(shirt):
    """寸法の基準点・計測経路を頂点インデックスで求める（標準体型の Basis で 1 回だけ）。
    中身は pitari_tshirt.find_landmarks と同じ形にする（measure・サイズキーがそのまま使える）"""
    me = shirt.data
    P = pt.world_coords(shirt)
    islands = pt._uv_islands(me)
    top = P[:, 2].max()
    collar = [i for i in islands if P[list(i[0])][:, 2].min() > top - COLLAR_Z]
    sleeves = [i for i in islands if abs(P[list(i[0])][:, 0].mean()) > SLEEVE_X]
    torso = [i for i in islands if i not in collar and i not in sleeves]
    back = max(torso, key=lambda i: P[list(i[0])][:, 1].mean())     # 着用者は −Y を向く
    torso_verts = set().union(*(i[0] for i in torso))
    collar_verts = set().union(*(i[0] for i in collar))
    loops = pt._boundary_loops(me)
    edge = max(loops, key=len)                                       # 裾・前の縁・襟の外側
    hem_z = P[edge][:, 2].min()
    hem = [i for i in edge if P[i][2] < hem_z + HEM_BAND]
    neck = sorted(torso_verts & collar_verts)                         # 身頃と襟の縫い目

    lm = {"sides": {}, "sleeve_verts": {}}
    for side, sign in (("left", 1), ("right", -1)):                 # MPFB の +X はキャラクターの左
        sv = set().union(*(i[0] for i in sleeves if P[list(i[0])][:, 0].mean() * sign > 0))
        seam = sorted(sv & torso_verts)
        inner = max((l for l in loops if set(l) <= sv), key=len)       # 袖口の裏地の端
        cuff = fold_ring(P, sv, inner)
        tip = max(seam, key=lambda i: P[i][2])
        armpit = min(seam, key=lambda i: P[i][2])
        cuff_top = max(cuff, key=lambda i: P[i][2])
        lm["sides"][side] = {
            "shoulder_tip": int(tip), "armpit": int(armpit),
            "seam": [int(i) for i in seam], "cuff": [int(i) for i in cuff],
            "sleeve_path": [int(i) for i in pt._shortest_path(me, P, tip, cuff_top, sv)],
            "rings": _sleeve_rings(P, sorted(sv), seam, cuff),
        }
        lm["sleeve_verts"][side] = sorted(int(i) for i in sv)

    back_neck = min((i for i in neck if P[i][1] > 0), key=lambda i: abs(P[i][0]))
    back_hem = min((i for i in hem if P[i][1] > 0), key=lambda i: abs(P[i][0]))
    front_edge = [i for i in edge if P[i][1] < 0 and i not in hem and i not in collar_verts]
    # 左右の前身頃（UV の島）。前は中心で重なっているので、x の正負ではなく島で分ける
    panels = {("left" if P[list(i[0])][:, 0].mean() > 0 else "right"): set(i[0]) for i in torso if i is not back}
    lm.update({
        "back_neck_center": int(back_neck),
        "length_path": [int(i) for i in pt._shortest_path(me, P, back_neck, back_hem, back[0])],
        "torso_faces": [int(f) for i in torso for f in i[1]],
        # 身頃（襟を含む）。身幅・肩幅のキーで一緒に動かす
        "torso_verts": sorted(int(i) for i in torso_verts | collar_verts),
        "neck": [int(i) for i in neck], "hem": [int(i) for i in hem],
        "front_edge": {s: sorted(int(i) for i in front_edge if i in panels[s]) for s in ("left", "right")},
        "front_panels": {s: sorted(int(i) for i in panels[s] - collar_verts) for s in ("left", "right")},
        "collar_verts": sorted(int(i) for i in collar_verts),
    })
    polys = [tuple(p.vertices) for p in me.polygons]
    lm["shoulder_crossings"] = pt._shoulder_crossings(
        P, [polys[f] for f in lm["torso_faces"]], lm["sides"]["left"]["shoulder_tip"],
        lm["sides"]["right"]["shoulder_tip"], pt._point_along(P, lm["length_path"], pt.SHOULDER_DROP))
    return lm


# ---------------------------------------------------------------- 前の開け閉め（キー shirt_close・shirt_open）

V_GAP = 0.008               # 左右の前身頃の重なりが、下での重なりよりこれだけ減った高さから上を、襟元の V 字とする
CLOSE_REACH = 0.07          # 閉めるとき、前の縁からこの距離までの身頃・襟を一緒に寄せる
OPEN_ANGLE = 0.45           # 開けるとき、前の縁を体の中心の縦の軸の周りに回す角度（rad）
OPEN_SIDE_ANGLE = 1.3       # 前の中心からこの角度（rad）の所（脇の近く）では回さない
COLLAR_SPREAD = 1.2         # 閉めるとき、襟の先からこの角度（rad）の所まで、回す量を 1 から 0 へ下げる
COLLAR_GOAL = 0.03          # 閉めたときの、襟の先の前の中心からの角度（rad）


def _edge_at(P, edge, z):
    """前の縁の、高さ z での位置（前の縁の頂点を高さで直線補間）"""
    E = P[edge][np.argsort(P[edge][:, 2])]
    return np.array([np.interp(z, E[:, 2], E[:, k]) for k in range(3)])


def v_bottom(P, lm):
    """襟元の V 字の一番下の高さ：左右の前身頃の重なりが、下での重なりより V_GAP 減り始める高さ。
    重なりは「右の前の縁の x − 左の前の縁の x」（下では右の縁が +x 側にあって重なっている。上へ行くと交差して開く）。
    縁の間の距離で見ると、交差する所で一度 0 に近づくので開き始めを見逃す"""
    L, R = lm["front_edge"]["left"], lm["front_edge"]["right"]
    zs = np.linspace(P[lm["hem"]][:, 2].max(), P[lm["neck"]][:, 2].min(), 60)
    overlap = [float(_edge_at(P, R, z)[0] - _edge_at(P, L, z)[0]) for z in zs]
    base = float(np.median(overlap[:20]))                       # V 字より下の、元からの重なり
    for z, o in zip(zs, overlap):
        if o < base - V_GAP:
            return float(z)
    return float(zs[-1])


def _turn(P, idx, cy, angles):
    """idx の頂点を、(x, y) = (0, cy) を通る縦の軸の周りに angles（rad、前 → 着用者の左が正）だけ回したときの移動量"""
    X, Y = P[idx, 0], P[idx, 1] - cy
    r = np.hypot(X, Y)
    th = np.arctan2(X, -Y) + angles
    return np.stack([r * np.sin(th) - X, -r * np.cos(th) - Y], axis=1)


def _front_angle(P, idx, cy, sign):
    """前の中心から横への角度（rad）。前の中心 0、脇 π/2、中心を越えた所は 0"""
    return np.clip(np.arctan2(sign * P[idx, 0], -(P[idx, 1] - cy)), 0, None)


def _collar_side(P, lm, sign):
    return np.array([i for i in lm["collar_verts"] if P[i][0] * sign > 0])


def close_displacement(P, lm):
    """閉める：前を襟元まで閉じる。
    前身頃は、V 字の部分で左右の前の縁を、V 字の一番下での位置（左右が元から重なっている所）へ寄せる
    （前の縁からの距離で寄せる量を減らし、近くの前身頃も一緒に寄せる）。
    襟の前側は、首の縦の軸の周りに回して、襟の先を前の中心で合わせる（横に押すと襟が潰れるので回す）。
    前後の位置は変えない（体に入る所は押し出しで出る）"""
    zv = v_bottom(P, lm)
    cy_neck = P[lm["neck"]][:, 1].mean()
    d = np.zeros_like(P)
    for side, sign in (("left", 1), ("right", -1)):
        edge = lm["front_edge"][side]
        x_ref = _edge_at(P, edge, zv)[0]
        idx = np.array(lm["front_panels"][side])
        idx = idx[P[idx, 2] > zv]
        for i in idx:
            e = _edge_at(P, edge, P[i][2])
            reach = abs(P[i][0] - e[0])
            w = (1 - pt._smooth01(reach / CLOSE_REACH)) * pt._smooth01((P[i][2] - zv) / 0.03)
            d[i, 0] = (x_ref - e[0]) * w
        col = _collar_side(P, lm, sign)
        ang = _front_angle(P, col, cy_neck, sign)
        end = ang.min()                                         # 襟の先（前の中心に一番近い所）
        w = 1 - pt._smooth01((ang - end) / COLLAR_SPREAD)
        d[col, :2] += _turn(P, col, cy_neck, -sign * max(end - COLLAR_GOAL, 0) * w)
    return d


def open_displacement(P, lm):
    """開ける：前身頃と襟の前側（前の縁 → 脇）を、体の中心の縦の軸の周りに、前の縁で OPEN_ANGLE、脇で 0 になるよう外へ回す。
    上から下まで同じだけ開く（襟元から開いた形）。半径は変えない（体に入る所は押し出しで出る）"""
    torso = np.array(lm["torso_verts"])
    cy = P[torso][:, 1].mean()
    d = np.zeros_like(P)
    for side, sign in (("left", 1), ("right", -1)):
        idx = np.concatenate([np.array(lm["front_panels"][side]), _collar_side(P, lm, sign)])
        w = 1 - pt._smooth01(_front_angle(P, idx, cy, sign) / OPEN_SIDE_ANGLE)
        d[idx, :2] = _turn(P, idx, cy, sign * OPEN_ANGLE * w)
    return d


# ---------------------------------------------------------------- 写真から貼る用の UV（pitari）

UV_MARGIN = 0.02            # 画像の端と、前・後ろの島の間の余白（UV）


def make_pitari_uv(shirt):
    """シャツの写真用の UV（pitari）を作り、元の UVMap と置き換える（glTF の TEXCOORD_0 を pitari にする）。
    前と後ろから 1 枚ずつ撮った写真を貼るので、面の向き（法線の y）で前と後ろに分け、
    前は正面から、後ろは背面から（着用者の左が画像の左）まっすぐ投影する。
    長袖の pitari と同じく、前を上半分、後ろを下半分に、同じ縮尺で並べる。
    前を開けたときに見える裏側は、表と同じ UV（同じ所の柄）になる"""
    me = shirt.data
    P = pt.world_coords(shirt, "Basis") if me.shape_keys else pt.world_coords(shirt)
    N = pt.vertex_normals(P, pt.polys_of(shirt))
    uv = me.uv_layers.new(name="pitari")
    front = np.array([N[list(p.vertices)].mean(0)[1] < 0 for p in me.polygons])
    loops = [(p.index, li, me.loops[li].vertex_index) for p in me.polygons for li in p.loop_indices]
    pts = {True: [], False: []}
    for f, li, v in loops:
        x, z = P[v][0], P[v][2]
        pts[bool(front[f])].append((li, x if front[f] else -x, z))
    w = max(max(p[1] for p in ps) - min(p[1] for p in ps) for ps in pts.values())
    h = max(max(p[2] for p in ps) - min(p[2] for p in ps) for ps in pts.values())
    scale = min((1 - 2 * UV_MARGIN) / w, (0.5 - 1.5 * UV_MARGIN) / h)
    for is_front, ps in pts.items():
        cx = (max(p[1] for p in ps) + min(p[1] for p in ps)) / 2
        cz = (max(p[2] for p in ps) + min(p[2] for p in ps)) / 2
        cv = 0.75 - UV_MARGIN / 4 if is_front else 0.25 + UV_MARGIN / 4
        for li, x, z in ps:
            uv.data[li].uv = (0.5 + (x - cx) * scale, cv + (z - cz) * scale)
    me.uv_layers.remove(me.uv_layers["UVMap"])
    uv = me.uv_layers["pitari"]
    me.uv_layers.active = uv
    uv.active_render = True
    pt.log(f"pitari UV: 前の面 {int(front.sum())}、後ろの面 {int((~front).sum())}、縮尺 {scale:.3f}（1m あたり）")
