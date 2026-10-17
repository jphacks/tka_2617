"""
Pitari Tシャツ生成の共通処理（Blender 4.2 + MPFB2 2.0.x）

build_tshirt.py / verify_sizes.py から import して使う。
単位はメートル（計測結果だけ cm で返す）。
"""
import heapq
import json
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

from bl_ext.blender_org.mpfb.services.humanservice import HumanService

MHCLO = r"C:\MakeHuman\data\clothes\male_casualsuit06\male_casualsuit06.mhclo"
SHIRT_VERTS = 2822          # casualsuit06 の先頭 2822 頂点が Tシャツ（後ろはジーンズ）
ARMPIT_DROP = 0.01          # 身幅は脇の下の高さで測る（measure/ の DF2 点 12→20 に合わせる）。
                            # 脇の頂点のすぐ近くは押し出しで上下に動き、切り口が不安定になるので 1cm だけ下げる
SHOULDER_DROP = 0.02        # 肩幅の切り口は後ろ襟ぐり中心から 2cm 下を通す（襟の穴を避ける）

# 標準体型（男性）。体型プリセットはここからの差分で作る
STANDARD_MACROS = {
    "gender": 1.0, "age": 0.5, "muscle": 0.5, "weight": 0.5, "proportions": 0.5,
    "height": 0.5, "cupsize": 0.5, "firmness": 0.5,
    "race": {"asian": 0.33, "caucasian": 0.33, "african": 0.33},
}


SIZE_PARTS = ["length", "width", "shoulder", "sleeve"]          # 入力 4 項目＝サイズキー（size_*）
BUILDS = ["slim", "standard", "broad", "chubby"]
# 体型プリセット：MPFB のマクロ（0〜1、0.5 が標準）の weight と muscle だけを変える。
# がっしり＝筋肉で肩・胸・腕が太い、ぽっちゃり＝体重でお腹・腰回りが出る
BUILD_MACROS = {
    "slim":     {"weight": 0.20, "muscle": 0.35},
    "standard": {"weight": 0.50, "muscle": 0.50},
    "broad":    {"weight": 0.60, "muscle": 0.85},
    "chubby":   {"weight": 0.90, "muscle": 0.30},
}


def macros_for(build):
    return {**STANDARD_MACROS, **BUILD_MACROS[build]}


def build_key(build):
    return None if build == "standard" else f"build_{build}"


# 身長キー：標準体型の身長（マクロ height 0.5）からの差。値 1.0 = 1cm。
# MPFB はマクロ 0.5 を境に低い側と高い側で別の形を混ぜるので、キーも 2 つに分ける。
# ±HEIGHT_SPAN_CM の体を作り、1 / HEIGHT_SPAN_CM 倍で 1cm キーにする
HEIGHT_DIRECTIONS = {"up": 1.0, "down": -1.0}
HEIGHT_SPAN_CM = 20.0
# 入力できる身長（cm）と、基準寸法とキーの効き方 M を測る身長（標準の身長はこの間に足す）。
# M は体型と身長の組み合わせで少し変わるので、身長ごとに測ってブラウザで補間する
HEIGHT_MIN_CM = 150.0
HEIGHT_MAX_CM = 195.0
HEIGHT_SAMPLES_CM = [150.0, 160.0, 185.0, 195.0]


def height_key(direction):
    return f"height_{direction}"


def body_height_cm(body):
    """helper を除いた体の高さ（cm）。feet_on_ground なので足の裏は z = 0"""
    z = body_mix_coords(body)[helper_keep_mask(body)][:, 2]
    return float(z.max() - z.min()) * 100


def log(*a):
    print("[pitari]", *a, flush=True)


# ---------------------------------------------------------------- シーン

def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def create_body(macros):
    body = HumanService.create_human(mask_helpers=True, detailed_helpers=True,
                                     extra_vertex_groups=True, feet_on_ground=True,
                                     scale=0.1, macro_detail_dict=macros)
    body.name = "avatar"
    return body


def add_shirt(body):
    """casualsuit06 を着せ、ジーンズ部分を消して Tシャツだけにする"""
    shirt = HumanService.add_mhclo_asset(MHCLO, body, asset_type="Clothes", subdiv_levels=0,
                                         set_up_rigging=False)
    shirt.name = "tshirt"
    for m in list(shirt.modifiers):
        shirt.modifiers.remove(m)
    # 服の下を隠す Mask は使わない（隠し方はブラウザ側で決める）
    for m in list(body.modifiers):
        if m.type == "MASK" and "casualsuit" in m.name:
            body.modifiers.remove(m)
    me = shirt.data
    if len(me.vertices) != 3708:
        raise RuntimeError(f"casualsuit06 の頂点数が想定外: {len(me.vertices)}")
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in range(SHIRT_VERTS, len(bm.verts))], context="VERTS")
    bm.to_mesh(me); bm.free(); me.update()
    return shirt


def world_coords(obj, key=None):
    """頂点のワールド座標 (n,3)。key を渡すとそのシェイプキーの形"""
    src = obj.data.shape_keys.key_blocks[key].data if key else obj.data.vertices
    co = np.empty(len(src) * 3); src.foreach_get("co", co)
    co = co.reshape(-1, 3)
    M = np.array(obj.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3]


# ---------------------------------------------------------------- 基準点

def _uv_islands(me):
    """UVMap の島ごとの頂点集合（前身頃・後ろ身頃・左袖・右袖の 4 つになる）"""
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv["UVMap"]
    parent = list(range(len(bm.faces)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x

    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        a, b = e.link_faces

        def uv(f):
            return {l.vert.index: tuple(round(c, 5) for c in l[uvl].uv) for l in f.loops if l.vert in e.verts}

        if uv(a) == uv(b):
            parent[find(a.index)] = find(b.index)
    isl = {}
    for f in bm.faces:
        isl.setdefault(find(f.index), set()).update(v.index for v in f.verts)
    fisl = {}
    for f in bm.faces:
        fisl.setdefault(find(f.index), []).append(f.index)
    bm.free()
    return [(isl[k], fisl[k]) for k in isl]


def _boundary_loops(me):
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    seen, loops = set(), []
    for v in bm.verts:
        if not v.is_boundary or v.index in seen:
            continue
        stack, comp = [v.index], []
        seen.add(v.index)
        while stack:
            i = stack.pop(); comp.append(i)
            for e in bm.verts[i].link_edges:
                if e.is_boundary:
                    j = e.other_vert(bm.verts[i]).index
                    if j not in seen:
                        seen.add(j); stack.append(j)
        loops.append(comp)
    bm.free()
    return loops


def _shortest_path(me, P, start, goal, allowed):
    """allowed の頂点だけを通る最短経路（頂点インデックスの列）"""
    adj = {}
    for e in me.edges:
        a, b = e.vertices
        if a in allowed and b in allowed:
            d = float(np.linalg.norm(P[a] - P[b]))
            adj.setdefault(a, []).append((b, d)); adj.setdefault(b, []).append((a, d))
    dist, prev, q = {start: 0.0}, {}, [(0.0, start)]
    while q:
        d, i = heapq.heappop(q)
        if i == goal:
            break
        if d > dist[i]:
            continue
        for j, w in adj.get(i, []):
            if d + w < dist.get(j, 1e9):
                dist[j] = d + w; prev[j] = i; heapq.heappush(q, (d + w, j))
    if goal not in dist:
        raise RuntimeError(f"経路が見つかりません {start}->{goal}")
    path = [goal]
    while path[-1] != start:
        path.append(prev[path[-1]])
    return path[::-1]


def find_landmarks(shirt):
    """寸法の基準点・計測経路を頂点インデックスで求める（標準体型の Basis で 1 回だけ）"""
    me = shirt.data
    P = world_coords(shirt)
    islands = _uv_islands(me)
    if len(islands) != 4:
        raise RuntimeError(f"UV の島が 4 つではありません: {len(islands)}")
    torso = [i for i in islands if abs(P[list(i[0])][:, 0].mean()) < 0.05]
    sleeves = [i for i in islands if abs(P[list(i[0])][:, 0].mean()) >= 0.05]
    back, front = sorted(torso, key=lambda i: -P[list(i[0])][:, 1].mean())   # MPFB は前が -Y
    torso_verts = back[0] | front[0]
    loops = _boundary_loops(me)
    neck = max(loops, key=lambda l: P[l][:, 2].mean())
    hem = min(loops, key=lambda l: P[l][:, 2].mean())

    lm = {"sides": {}, "sleeve_verts": {}}
    for sv, _ in sleeves:
        side = "left" if P[list(sv)][:, 0].mean() > 0 else "right"     # MPFB の +X はキャラクターの左
        seam = sorted(sv & torso_verts)
        cuff = max((l for l in loops if set(l) <= sv), key=len)
        tip = max(seam, key=lambda i: P[i][2])
        armpit = min(seam, key=lambda i: P[i][2])
        cuff_top = max(cuff, key=lambda i: P[i][2])
        lm["sides"][side] = {
            "shoulder_tip": int(tip), "armpit": int(armpit),
            "seam": [int(i) for i in seam], "cuff": [int(i) for i in cuff],
            "sleeve_path": [int(i) for i in _shortest_path(me, P, tip, cuff_top, sv)],
        }
        lm["sleeve_verts"][side] = sorted(int(i) for i in sv)

    back_neck = min((i for i in neck if P[i][1] > 0), key=lambda i: abs(P[i][0]))
    back_hem = min((i for i in hem if P[i][1] > 0), key=lambda i: abs(P[i][0]))
    lm.update({
        "back_neck_center": int(back_neck),
        "length_path": [int(i) for i in _shortest_path(me, P, back_neck, back_hem, back[0])],
        "torso_faces": [int(f) for f in back[1] + front[1]],
        "torso_verts": sorted(int(i) for i in torso_verts),
        "neck": [int(i) for i in neck], "hem": [int(i) for i in hem],
    })
    polys = [tuple(p.vertices) for p in me.polygons]
    lm["shoulder_crossings"] = _shoulder_crossings(
        P, [polys[f] for f in lm["torso_faces"]], lm["sides"]["left"]["shoulder_tip"],
        lm["sides"]["right"]["shoulder_tip"], _point_along(P, lm["length_path"], SHOULDER_DROP))
    return lm


# ---------------------------------------------------------------- 計測

def _path_len(P, path):
    return float(np.linalg.norm(np.diff(P[path], axis=0), axis=1).sum())


SPIKE_TURN_DEG = 120.0      # 切り口でこれより鋭く折り返す点は、メッシュの細かな折れとして除く


def _slice_len(P, faces, z):
    """faces を水平面 z で切った切り口の長さ。
    切り口をつながった線に並べ、鋭く折り返す点を除いてから測る。
    体型キーと身長キーを足した形では、脇の縫い目に外から見えない小さな折れができ、
    切り口がそこで行って戻ると身幅が 1cm 以上長く出るため"""
    segs = []
    for poly in faces:
        pts = []
        n = len(poly)
        for k in range(n):
            ia, ib = poly[k], poly[(k + 1) % n]
            a, b = P[ia], P[ib]
            if (a[2] - z) * (b[2] - z) < 0:
                t = (z - a[2]) / (b[2] - a[2])
                pts.append(((min(ia, ib), max(ia, ib)), a + t * (b - a)))
        if len(pts) == 2:
            segs.append(pts)
    return sum(_polyline_len(_drop_spikes(line, closed), closed)
               for line, closed in _chain_segments(segs))


def _chain_segments(segs):
    """面ごとの線分を、共有する辺でつないだ線（点の列, 閉じているか）にする"""
    by_edge = {}
    for i, seg in enumerate(segs):
        for edge, _ in seg:
            by_edge.setdefault(edge, []).append(i)
    used = [False] * len(segs)
    lines = []
    for start in range(len(segs)):
        if used[start]:
            continue
        used[start] = True
        (e0, p0), (e1, p1) = segs[start]
        line, edges = [p0, p1], [e0, e1]
        for forward in (True, False):
            while True:
                end = edges[-1] if forward else edges[0]
                nxt = next((j for j in by_edge.get(end, []) if not used[j]), None)
                if nxt is None:
                    break
                used[nxt] = True
                (ea, pa), (eb, pb) = segs[nxt]
                e_new, p_new = (eb, pb) if ea == end else (ea, pa)
                if forward:
                    edges.append(e_new); line.append(p_new)
                else:
                    edges.insert(0, e_new); line.insert(0, p_new)
        closed = edges[0] == edges[-1]
        if closed:
            line.pop()
        lines.append((np.array(line), closed))
    return lines


def _drop_spikes(line, closed):
    """向きが SPIKE_TURN_DEG より大きく変わる点を、なくなるまで除く"""
    cos_limit = np.cos(np.radians(SPIKE_TURN_DEG))
    pts = list(line)
    changed = True
    while changed and len(pts) > 3:
        changed = False
        n = len(pts)
        for i in range(n) if closed else range(1, n - 1):
            a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
            u, v = b - a, c - b
            nu, nv = np.linalg.norm(u), np.linalg.norm(v)
            if nu > 0 and nv > 0 and np.dot(u, v) / (nu * nv) < cos_limit:
                del pts[i]
                changed = True
                break
    return np.array(pts)


def _polyline_len(pts, closed):
    d = np.diff(np.vstack([pts, pts[:1]]) if closed else pts, axis=0)
    return float(np.linalg.norm(d, axis=1).sum())


def _point_along(P, path, dist):
    """path に沿って先頭から dist 進んだ点"""
    for a, b in zip(path, path[1:]):
        seg = float(np.linalg.norm(P[b] - P[a]))
        if dist <= seg:
            return P[a] + (P[b] - P[a]) * (dist / seg)
        dist -= seg
    return P[path[-1]]


def _shoulder_crossings(P, faces, tl, tr, back_pt):
    """左右の肩先と、後ろ襟ぐりのすぐ下の点を通る平面で背中側を切り、
    切り口が横切る辺 (a, b, t) を左→右の順に返す（標準体型で 1 回だけ求めて固定する）"""
    n = np.cross(P[tr] - P[tl], back_pt - P[tl]); n /= np.linalg.norm(n)
    h = (P - P[tl]) @ n
    x0, x1 = sorted((P[tl][0], P[tr][0]))
    y_min = min(P[tl][1], P[tr][1]) - 0.01
    found = {}
    for poly in faces:
        cr = []
        for k in range(len(poly)):
            a, b = poly[k], poly[(k + 1) % len(poly)]
            if h[a] * h[b] < 0:
                cr.append((min(a, b), max(a, b)))
        if len(cr) != 2:
            continue
        for a, b in cr:
            t = h[a] / (h[a] - h[b])
            p = P[a] + t * (P[b] - P[a])
            if p[1] >= y_min and x0 < p[0] < x1:     # 背中側で、肩先の内側だけ
                found[(a, b)] = (float(t), p[0])
    order = sorted(found.items(), key=lambda kv: -kv[1][1])   # +X（左肩）→ −X（右肩）
    return [[int(a), int(b), t] for (a, b), (t, _) in order]


def _shoulder_len(P, lm):
    tl, tr = P[lm["sides"]["left"]["shoulder_tip"]], P[lm["sides"]["right"]["shoulder_tip"]]
    mid = [P[a] + t * (P[b] - P[a]) for a, b, t in lm["shoulder_crossings"]]
    pts = [tl] + [p for p in mid if tr[0] < p[0] < tl[0]] + [tr]    # 肩先より外に出た点は使わない
    return float(np.linalg.norm(np.diff(np.array(pts), axis=0), axis=1).sum())


def width_height(P, lm):
    """身幅を測る高さ（脇の下の 1cm 下, m）"""
    L, R = lm["sides"]["left"], lm["sides"]["right"]
    return (P[L["armpit"]][2] + P[R["armpit"]][2]) / 2 - ARMPIT_DROP


def body_width(B, body_polys, z):
    """体を高さ z で水平に切った胴の一周 ÷ 2（cm）。服の身幅と比べて、服が小さすぎないかを決める。
    この高さでは二の腕も切れるので、体の中心（x = 0）をまたぐ切り口だけを使う"""
    segs = []
    for poly in body_polys:
        pts = []
        n = len(poly)
        for k in range(n):
            ia, ib = poly[k], poly[(k + 1) % n]
            a, b = B[ia], B[ib]
            if (a[2] - z) * (b[2] - z) < 0:
                t = (z - a[2]) / (b[2] - a[2])
                pts.append(((min(ia, ib), max(ia, ib)), a + t * (b - a)))
        if len(pts) == 2:
            segs.append(pts)
    torso = [(line, closed) for line, closed in _chain_segments(segs)
             if line[:, 0].min() < 0 < line[:, 0].max()]
    return sum(_polyline_len(_drop_spikes(line, closed), closed) for line, closed in torso) / 2 * 100


def measure(P, lm, polys):
    """ワールド座標 P (n,3) から 4 項目（cm）を測る"""
    L, R = lm["sides"]["left"], lm["sides"]["right"]
    z = (P[L["armpit"]][2] + P[R["armpit"]][2]) / 2 - ARMPIT_DROP
    faces = [polys[f] for f in lm["torso_faces"]]
    return {
        "length": _path_len(P, lm["length_path"]) * 100,
        "width": _slice_len(P, faces, z) / 2 * 100,
        "shoulder": _shoulder_len(P, lm) * 100,
        "sleeve": (_path_len(P, L["sleeve_path"]) + _path_len(P, R["sleeve_path"])) / 2 * 100,
    }


def polys_of(obj):
    return [tuple(p.vertices) for p in obj.data.polygons]


# ---------------------------------------------------------------- シェイプキー

def mixed_coords(obj, values):
    """Basis に {キー名: 値} を足し合わせた形（ワールド座標）。glTF の morph と同じ線形和"""
    B = world_coords(obj, "Basis")
    P = B.copy()
    for name, v in values.items():
        if name and v:
            P += (world_coords(obj, name) - B) * v
    return P


def build_values(build, sizes=None, height_delta_cm=0.0):
    """体型 build、size_* の値、標準の身長からの差（cm）から、キー名→値の辞書を作る"""
    vals = {f"size_{p}": float(v) for p, v in (sizes or {}).items()}
    if build_key(build):
        vals[build_key(build)] = 1.0
    if height_delta_cm > 0:
        vals[height_key("up")] = float(height_delta_cm)
    elif height_delta_cm < 0:
        vals[height_key("down")] = float(-height_delta_cm)
    return vals


def set_key_from_world(obj, name, Pw):
    """ワールド座標 Pw をシェイプキー name として書く（なければ作る）"""
    if not obj.data.shape_keys:
        obj.shape_key_add(name="Basis", from_mix=False)
    kb = obj.data.shape_keys.key_blocks
    k = kb.get(name) or obj.shape_key_add(name=name, from_mix=False)
    M = np.array(obj.matrix_world.inverted())
    local = Pw @ M[:3, :3].T + M[:3, 3]
    k.data.foreach_set("co", local.ravel())
    obj.data.update()
    return k


def key_from_mix(obj, src, value, name, lo=-10.0, hi=10.0):
    """src キーだけを value にして New Shape from Mix し、name として残す"""
    kb = obj.data.shape_keys.key_blocks
    for k in kb:
        k.value = 0.0
    kb[src].value = value
    new = obj.shape_key_add(name=name, from_mix=True)
    kb[src].value = 0.0
    new.slider_min, new.slider_max = lo, hi      # Blender の上限は ±10（glTF 側は無制限）
    return new


def width_displacement(P, lm, k):
    """身幅 +: 脇より下の胴を水平に k 倍ぶん広げ、肩に向かって弱める。袖は縫い目についていく"""
    L, R = lm["sides"]["left"], lm["sides"]["right"]
    z_arm = (P[L["armpit"]][2] + P[R["armpit"]][2]) / 2
    z_top = (P[L["shoulder_tip"]][2] + P[R["shoulder_tip"]][2]) / 2
    torso = np.array(lm["torso_verts"])
    cy = P[torso][:, 1].mean()
    t = np.clip((P[:, 2] - z_arm) / (z_top - z_arm), 0, 1)
    w = 1 - t * t * (3 - 2 * t)                            # smoothstep で 1→0
    d = np.zeros_like(P)
    d[torso, 0] = P[torso, 0] * k * w[torso]
    d[torso, 1] = (P[torso, 1] - cy) * k * w[torso]
    follow_seam(P, lm, d)
    return d


def _smooth01(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def sleeve_axis(P, lm, side):
    """袖の付け根（縫い目の中心）と、付け根→袖口の向き"""
    seam = lm["sides"][side]["seam"]
    c0 = P[seam].mean(0)
    u = P[lm["sides"][side]["cuff"]].mean(0) - c0
    return c0, u / np.linalg.norm(u)


def length_displacement(P, lm, k):
    """着丈 +: 脇の高さ（0）→ 裾（1）で胴を下へ伸ばす。脇より上と袖は動かさない"""
    L, R = lm["sides"]["left"], lm["sides"]["right"]
    z_arm = min(P[L["armpit"]][2], P[R["armpit"]][2])
    z_hem = P[lm["hem"]][:, 2].mean()
    torso = np.array(lm["torso_verts"])
    d = np.zeros_like(P)
    d[torso, 2] = -k * np.clip((z_arm - P[torso, 2]) / (z_arm - z_hem), 0, None)
    return d


def _radial(P, c0, u, X):
    """袖の軸まわりの向き（単位ベクトル）"""
    r = (X - c0) - np.outer((X - c0) @ u, u)
    return r / np.linalg.norm(r, axis=-1, keepdims=True)


def sleeve_displacement(P, lm, k):
    """袖丈 +: 袖を軸の向きに伸ばす。軸まわりの同じ向きで、縫い目（0）→ 袖口（1）に均等に"""
    d = np.zeros_like(P)
    torso = set(lm["torso_verts"])
    for s in ("left", "right"):
        c0, u = sleeve_axis(P, lm, s)
        seam, cuff = np.array(lm["sides"][s]["seam"]), np.array(lm["sides"][s]["cuff"])
        rs, rc = _radial(P, c0, u, P[seam]), _radial(P, c0, u, P[cuff])
        ps, pc = (P[seam] - c0) @ u, (P[cuff] - c0) @ u
        for i in lm["sleeve_verts"][s]:
            if i in torso:
                continue
            r = _radial(P, c0, u, P[i][None])[0]
            t0, t1 = ps[np.argmax(rs @ r)], pc[np.argmax(rc @ r)]
            d[i] = u * k * float(np.clip(((P[i] - c0) @ u - t0) / (t1 - t0), 0, 1))
    return d


SHOULDER_FADE = 0.06        # 肩幅キーは脇の上 6cm から効き始め、脇の下の高さでは 0（身幅を測る高さを動かさない）
SHOULDER_FLAT = 0.03        # 肩先の手前 3cm からは肩先と同じだけ動かす


def shoulder_direction(P, lm, side, mode):
    """肩幅キーで肩先を動かす向き。"slope" = 肩のライン（首の付け根→肩先）、"arm" = 袖の軸"""
    if mode == "arm":
        return sleeve_axis(P, lm, side)[1]
    tip = P[lm["sides"][side]["shoulder_tip"]]
    neck = P[lm["neck"]]
    n = neck[np.argmax(neck[:, 0] * np.sign(tip[0]))]
    v = tip - n
    return v / np.linalg.norm(v)


SHOULDER_DIR = "slope"


def shoulder_displacement(P, lm, k, mode=None):
    """肩幅 +: 首の付け根（0）→ 肩先（1）で、肩まわりを肩のラインに沿って外へ動かす。
    マイナスでも肩の表面に沿って縮む。袖は縫い目についていく"""
    L, R = lm["sides"]["left"], lm["sides"]["right"]
    z_arm = (P[L["armpit"]][2] + P[R["armpit"]][2]) / 2
    x_neck = np.abs(P[lm["neck"]][:, 0]).max()
    torso = np.array(lm["torso_verts"])
    d = np.zeros_like(P)
    wz = _smooth01((P[:, 2] - z_arm) / SHOULDER_FADE)
    for s, sign in (("left", 1), ("right", -1)):
        u = shoulder_direction(P, lm, s, mode or SHOULDER_DIR)
        x_tip = abs(P[lm["sides"][s]["shoulder_tip"]][0])
        idx = torso[P[torso, 0] * sign > 0]
        wx = _smooth01((np.abs(P[idx, 0]) - x_neck) / (x_tip - SHOULDER_FLAT - x_neck))
        d[idx] = np.outer(k * wx * wz[idx], u)
    follow_seam(P, lm, d)
    return d


DISPLACEMENTS = {"length": length_displacement, "width": width_displacement,
                 "shoulder": shoulder_displacement, "sleeve": sleeve_displacement}


def follow_seam(P, lm, d):
    """袖の頂点に、袖の軸まわりで同じ向きにある縫い目の頂点と同じ移動量を与える（袖は形を保って平行移動）"""
    torso = set(lm["torso_verts"])
    for s in ("left", "right"):
        seam = np.array(lm["sides"][s]["seam"])
        c0, u = sleeve_axis(P, lm, s)
        rs = _radial(P, c0, u, P[seam])
        for i in lm["sleeve_verts"][s]:
            if i not in torso:
                d[i] = d[seam[np.argmax(rs @ _radial(P, c0, u, P[i][None])[0])]]


def solve_scale(fn, target, x0=0.1, iters=8):
    """fn(x) = target となる x をセカント法で探す"""
    x1, f0 = x0, fn(0.0)
    xs, fs = [0.0, x1], [f0, fn(x1)]
    for _ in range(iters):
        if abs(fs[-1] - target) < 1e-4:
            break
        x = xs[-1] + (target - fs[-1]) * (xs[-1] - xs[-2]) / (fs[-1] - fs[-2])
        xs.append(x); fs.append(fn(x))
    return xs[-1]


# ---------------------------------------------------------------- 書き出し

def make_material(name, rgba):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = 0.8
    mat.diffuse_color = rgba
    return mat


def simple_material(obj, name, rgba):
    obj.data.materials.clear()
    obj.data.materials.append(make_material(name, rgba))


def remove_objects(objs):
    for o in objs:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)


def body_mix_coords(body):
    """MPFB のマクロキーを混ぜた体の形（ワールド座標, helper 込みの全頂点）"""
    if not body.data.shape_keys:
        return world_coords(body)
    mix = body.shape_key_add(name="__mix", from_mix=True)
    P = world_coords(body, "__mix")
    body.shape_key_remove(mix)
    return P


def helper_keep_mask(body):
    """MPFB の Mask（helper を隠す）で残る頂点の bool 配列"""
    me = body.data
    keep = np.ones(len(me.vertices), bool)
    for m in [m for m in body.modifiers if m.type == "MASK"]:
        g = body.vertex_groups[m.vertex_group].index
        ing = np.array([any(x.group == g for x in v.groups) for v in me.vertices])
        keep &= ~ing if m.invert_vertex_group else ing
    return keep


def vertex_normals(P, polys):
    """面積で重み付けした頂点法線"""
    N = np.zeros_like(P)
    for poly in polys:
        for k in range(1, len(poly) - 1):
            a, b, c = poly[0], poly[k], poly[k + 1]
            n = np.cross(P[b] - P[a], P[c] - P[a])
            N[[a, b, c]] += n
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def bake_body(body):
    """体の Mask（helper を隠す）を頂点削除で確定し、MPFB のマクロキーを形に焼き込む。
    残した頂点のマスク（元の頂点数の bool 配列）を返す"""
    me = body.data
    keep = helper_keep_mask(body)
    for m in list(body.modifiers):
        body.modifiers.remove(m)
    if me.shape_keys:                                   # 現在の混合を Basis にする
        mix = body.shape_key_add(name="__mix", from_mix=True)
        co = np.empty(len(me.vertices) * 3); mix.data.foreach_get("co", co)
        body.shape_key_clear()
        me.vertices.foreach_set("co", co); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.where(~keep)[0]], context="VERTS")
    bm.to_mesh(me); bm.free(); me.update()
    log(f"avatar: {int(keep.sum())} 頂点（helper を削除）")
    return keep


COVER_NECK_FADE = 0.03      # 襟から内側 3cm で、重みを 0 から 1 へ徐々に上げる
COVER_OUT_FADE = 0.03       # 裾・袖口の外側 3cm まで、重みをなだらかに 0 へ下げる


def _kdtree(pts):
    t = KDTree(len(pts))
    for i, p in enumerate(pts):
        t.insert(p, i)
    t.balance()
    return t


COVER_RAY = 0.08            # 体の法線の向き 8cm 以内に Tシャツがあれば「服の下」


def cover_weights(body, shirt, lm):
    """体の頂点ごとの「服の下」重み（0〜1）。1 は服で完全に覆われる所。
    ブラウザの押し出し（push-out.ts）は、1 の所の体が服の外へ出ていないかを確かめる。
    体の頂点から法線の向き（外）に COVER_RAY 以内で Tシャツに当たる頂点を 1 とし、
    襟の近くは 0 へ、裾・袖口の外側へはなだらかに 0 へ"""
    B = world_coords(body); S = world_coords(shirt, "Basis")
    shirt_bvh = BVHTree.FromPolygons([Vector(p) for p in S], polys_of(shirt))
    near_neck = _kdtree(S[lm["neck"]])
    N = vertex_normals(B, polys_of(body))
    covered = np.zeros(len(B), bool)
    for i in range(len(B)):
        hit = shirt_bvh.ray_cast(Vector(B[i]) - Vector(N[i]) * 0.01, Vector(N[i]), COVER_RAY)
        covered[i] = hit[0] is not None
    w = covered.astype(float)
    for i in np.where(covered)[0]:
        w[i] = _smooth01(near_neck.find(B[i])[2] / COVER_NECK_FADE)
    near_cov = _kdtree(B[covered])
    for i in np.where(~covered)[0]:
        d = near_cov.find(B[i])[2]
        if d < COVER_OUT_FADE and near_neck.find(B[i])[2] > COVER_NECK_FADE:
            w[i] = _smooth01(1 - d / COVER_OUT_FADE)
    log(f"avatar: 服の下の重み >0 の頂点 {int((w > 0).sum())}（=1: {int((w >= 0.999).sum())}）")
    return w


def set_point_attribute(obj, name, values):
    me = obj.data
    a = me.attributes.get(name) or me.attributes.new(name, "FLOAT", "POINT")
    a.data.foreach_set("value", np.asarray(values, dtype=np.float32))


def export_glb(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if obj.data.shape_keys:
        for k in obj.data.shape_keys.key_blocks:
            k.value = 0.0
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=False, export_morph=True, export_morph_normal=True,
                              export_animations=False, export_skins=False, export_yup=True,
                              export_attributes=True)          # "_" で始まる属性（_cover）も出す
    log("GLB:", path)


# ---------------------------------------------------------------- 体型・身長ごとの服の形

def capture_builds(dress):
    """標準以外の体型ごとに体を作り、mhclo で服を着せ直して形だけ取り出す（dress は服を着せる関数）"""
    shapes = {}
    for b in BUILDS:
        if b == "standard":
            continue
        body = create_body(macros_for(b))
        garment = dress(body)
        shapes[b] = (body_mix_coords(body), world_coords(garment))
        remove_objects([garment, body])
        log(f"{b}: 体と服の形を取得")
    return shapes


def capture_heights(dress):
    """標準体型で身長を ±HEIGHT_SPAN_CM 変えた体を作り、mhclo で服を着せ直して形だけ取り出す。
    マクロ height の値は、実測の身長差が ±HEIGHT_SPAN_CM になるよう探す"""
    def measure_height(macro):
        body = create_body({**macros_for("standard"), "height": macro})
        h = body_height_cm(body)
        remove_objects([body])
        return h

    def solve_macro(target_cm, x1):
        """身長差が target_cm になるマクロの差をセカント法で探す。
        MPFB の中でマクロの値が丸められ、同じ身長が続くことがあるので、そこで止める"""
        x0, f0 = 0.0, 0.0
        f1 = measure_height(0.5 + x1) - standard_cm
        for _ in range(8):
            if abs(f1 - target_cm) < 0.01 or f1 == f0:
                break
            x0, f0, x1 = x1, f1, x1 + (target_cm - f1) * (x1 - x0) / (f1 - f0)
            f1 = measure_height(0.5 + x1) - standard_cm
        return x1

    standard_cm = measure_height(0.5)
    shapes = {}
    for d, sign in HEIGHT_DIRECTIONS.items():
        dx = solve_macro(sign * HEIGHT_SPAN_CM, sign * 0.1)
        body = create_body({**macros_for("standard"), "height": 0.5 + dx})
        got = body_height_cm(body) - standard_cm
        garment = dress(body)
        shapes[d] = (body_mix_coords(body), world_coords(garment))
        remove_objects([garment, body])
        log(f"{height_key(d)}: マクロ height {0.5 + dx:.4f}, 身長差 {got:+.2f}cm")
    log(f"標準の身長 {standard_cm:.2f}cm")
    return standard_cm, shapes


def height_key_world(B, P):
    """±HEIGHT_SPAN_CM の形 P から、1cm あたりのキーの形（ワールド座標）を作る"""
    return B + (P - B) / HEIGHT_SPAN_CM


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
    log("JSON:", path)
