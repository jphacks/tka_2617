"""
ズボン（MPFB の male_casualsuit06 のジーンズ部分）の共通処理：取り出し・基準点・計測

pitari_tshirt の生成・切り口・最短経路の処理を使う。
寸法の定義はチームの採寸（DeepFashion2 のズボンの点）に合わせる：
  ウエスト（点 1→3 ×2）  ウエストの上端の輪の一周
  ヒップ（点 4→14 ×2）   股の 2cm 上で、ズボン全体を水平に切った一周
  わたり幅（点 9→14）    股の 1cm 下で、片脚を水平に切った一周 ÷ 2（左右の平均）
  股上（点 2→9）         前のウエストの中心から、前の中心の縫い目に沿って股まで
  股下（点 9→7・11）     股から裾の内側の点までの直線距離（左右の平均）。脚の開き方に左右されない。
                         頂点をたどる道は、メッシュが粗くて階段状になり長く出るので使わない
  裾幅（点 11→12）       裾の輪の一周 ÷ 2（左右の平均）
"""
import bmesh
import numpy as np
from bl_ext.blender_org.mpfb.services.humanservice import HumanService

import pitari_tshirt as pt

TROUSER_PARTS = ["waist", "hip", "thigh", "rise", "inseam", "hem"]   # 入力 6 項目＝サイズキー（size_*）
HIP_RISE = 0.02             # ヒップは股の 2cm 上で切る。股に近いと、大きく広げたときに股のまわりの形の変化を拾って値が跳ねる
THIGH_DROP = 0.01           # わたり幅は股の 1cm 下で切る


def add_jeans(body):
    """casualsuit06 を着せ、Tシャツ部分を消してジーンズだけにする"""
    jeans = HumanService.add_mhclo_asset(pt.MHCLO, body, asset_type="Clothes", subdiv_levels=0,
                                         set_up_rigging=False)
    jeans.name = "jeans"
    for m in list(jeans.modifiers):
        jeans.modifiers.remove(m)
    for m in list(body.modifiers):
        if m.type == "MASK" and "casualsuit" in m.name:
            body.modifiers.remove(m)
    me = jeans.data
    if len(me.vertices) != 3708:
        raise RuntimeError(f"casualsuit06 の頂点数が想定外: {len(me.vertices)}")
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in range(pt.SHIRT_VERTS)], context="VERTS")
    _refine_lower_legs(bm)
    bm.to_mesh(me); bm.free(); me.update()
    return jeans


HEM_RINGS = 8               # 裾の輪から上へ 8 本ぶん（約 28cm、ひざの少し下まで）を細かくする
HEM_CUTS = 2                # その範囲の縦の辺を 3 等分する（輪の間隔 約 3.5cm → 約 1.2cm）


def _refine_lower_legs(bm):
    """裾のたまりのしわを表せるよう、ひざから下に輪を足す。
    範囲は高さではなく、裾の輪からメッシュのつながりをたどって決める。
    体型・身長が変わっても同じ辺が選ばれ、頂点の並びがそろうようにするため"""
    bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
    boundary = [e for e in bm.edges if e.is_boundary]
    seen, loops = set(), []
    for e in boundary:
        if e.index in seen:
            continue
        comp, stack = set(), [e]
        while stack:
            cur = stack.pop()
            if cur.index in seen:
                continue
            seen.add(cur.index)
            comp.update(cur.verts)
            for v in cur.verts:
                stack.extend(x for x in v.link_edges if x.is_boundary and x.index not in seen)
        loops.append(comp)
    loops.sort(key=lambda vs: sum(v.co.z for v in vs) / len(vs))
    vertical = set()
    for hem in loops[:2]:                                  # 下の 2 つが左右の裾
        prev, ring = set(), set(hem)
        for _ in range(HEM_RINGS):
            nxt = set()
            for v in ring:
                for e in v.link_edges:
                    o = e.other_vert(v)
                    if o not in ring and o not in prev:
                        nxt.add(o); vertical.add(e)
            prev, ring = ring, nxt
    bmesh.ops.subdivide_edges(bm, edges=list(vertical), cuts=HEM_CUTS, use_grid_fill=True)


def _ordered_boundary_loops(me):
    """縁の輪を、つながった順に並べた頂点インデックスの列にする"""
    adj = {}
    edge_faces = {}
    for p in me.polygons:
        for k in p.edge_keys:
            edge_faces[k] = edge_faces.get(k, 0) + 1
    for (a, b), n in edge_faces.items():
        if n == 1:
            adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    seen, loops = set(), []
    for s in adj:
        if s in seen:
            continue
        loop, prev, cur = [s], None, s
        seen.add(s)
        while True:
            nxt = [n for n in adj[cur] if n != prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur); loop.append(cur)
        loops.append(loop)
    return loops


def _center_seam(me):
    """左右の脚の UV の島の境目にある頂点（前と後ろの中心の縫い目）"""
    islands = pt._uv_islands(me)
    if len(islands) != 2:
        raise RuntimeError(f"ジーンズの UV の島が 2 つではない: {len(islands)}")
    return sorted(islands[0][0] & islands[1][0])


def find_trouser_landmarks(jeans):
    """基準点を頂点インデックスで求める（Basis の形で）"""
    me = jeans.data
    P = pt.world_coords(jeans, "Basis") if me.shape_keys else pt.world_coords(jeans)
    loops = _ordered_boundary_loops(me)
    if len(loops) != 3:
        raise RuntimeError(f"ジーンズの縁の輪が 3 つではない: {len(loops)}")
    loops.sort(key=lambda lp: -P[lp][:, 2].mean())
    waist, hems = loops[0], loops[1:]
    hems.sort(key=lambda lp: P[lp][:, 0].mean())          # 着用者の右（−X）が先
    seam = _center_seam(me)
    islands = pt._uv_islands(me)
    crotch = min(seam, key=lambda v: P[v][2])
    waist_seam = [v for v in seam if v in set(waist)]
    waist_front = min(waist_seam, key=lambda v: P[v][1])   # 着用者は −Y を向く
    front_path = pt._shortest_path(me, P, waist_front, crotch, set(seam))
    legs = {}
    for side, hem in zip(("right", "left"), hems):
        inner = min(hem, key=lambda v: abs(P[v][0]))
        legs[side] = {"hem": [int(v) for v in hem], "hem_inner": int(inner)}
    leg_verts = {}
    for side in legs:
        inner = legs[side]["hem_inner"]
        leg_verts[side] = sorted(int(v) for v in next(verts for verts, _ in islands if inner in verts))
    return {"waist": [int(v) for v in waist], "crotch": int(crotch),
            "front_path": [int(v) for v in front_path], "legs": legs, "leg_verts": leg_verts}


def _loop_len(P, loop):
    return pt._polyline_len(P[loop], True)


def _slice_loops(P, faces, z):
    """faces を水平面 z で切った切り口を、つながった線ごとに返す（鋭い折り返しは除く）"""
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
    return [(pt._drop_spikes(line, closed), closed) for line, closed in pt._chain_segments(segs)]


def measure_trousers(P, lm, polys):
    """ワールド座標 P (n,3) から 6 項目（cm）を測る"""
    z_crotch = P[lm["crotch"]][2]
    hip_loops = _slice_loops(P, polys, z_crotch + HIP_RISE)
    hip = sum(pt._polyline_len(line, closed) for line, closed in hip_loops)
    thigh_loops = [(line, closed) for line, closed in _slice_loops(P, polys, z_crotch - THIGH_DROP)]
    thighs = [pt._polyline_len(line, closed) / 2 for line, closed in thigh_loops]
    legs = lm["legs"].values()
    return {
        "waist": _loop_len(P, lm["waist"]) * 100,
        "hip": hip * 100,
        "thigh": float(np.mean(thighs)) * 100 if thighs else 0.0,
        "rise": pt._path_len(P, lm["front_path"]) * 100,
        "inseam": float(np.mean([np.linalg.norm(P[leg["hem_inner"]] - P[lm["crotch"]]) for leg in legs])) * 100,
        "hem": float(np.mean([_loop_len(P, leg["hem"]) / 2 for leg in legs])) * 100,
    }, {"hip_loops": len(hip_loops), "thigh_loops": len(thigh_loops)}


# ---------------------------------------------------------------- サイズキーの動かし方
# どれも Basis の形 P（ワールド座標）と倍率 k から、頂点ごとの移動量 d（n,3）を返す。
# 効かせる範囲は、股・ウエスト・裾の高さと脚の軸から決め、ジーンズの頂点番号には頼らない。
# 実際の倍率は、生成スクリプトが「測って +10cm になる値」を探して決める

HIP_KEEP = 0.03             # ウエストキーは、ヒップを測る高さから 3cm 上までは動かさない
CROTCH_BLEND = 0.03         # 股の上下 3cm で、脚の軸からの向きと体の中心からの向きを切り替える


def _heights(P, lm):
    z_crotch = P[lm["crotch"]][2]
    z_waist = P[lm["waist"]][:, 2].min()           # ウエストの上端の輪の一番低い所
    return z_crotch, z_waist


def _leg_axis(P, lm, side):
    """脚の軸：股の少し下の脚の中心から、裾の中心へ向かう線（始点と、下向きの単位ベクトル）"""
    z_crotch = P[lm["crotch"]][2]
    leg = np.array(lm["leg_verts"][side])
    band = leg[(P[leg, 2] < z_crotch - 0.02) & (P[leg, 2] > z_crotch - 0.06)]
    top = P[band].mean(0)
    bottom = P[lm["legs"][side]["hem"]].mean(0)
    u = bottom - top
    return top, u / np.linalg.norm(u)


def _radial_from_axis(X, c0, u):
    """X の、軸（c0 を通り向き u の線）から外向きの成分"""
    v = X - c0
    return v - np.outer(v @ u, u)


def _leg_of(P, lm):
    """頂点ごとに近い方の脚（right / left）。股の縫い目の頂点は軸に近い方へ"""
    axes = {s: _leg_axis(P, lm, s) for s in ("right", "left")}
    dist = {s: np.linalg.norm(_radial_from_axis(P, *axes[s]), axis=1) for s in axes}
    return np.where(dist["right"] <= dist["left"], "right", "left"), axes


def waist_displacement(P, lm, k):
    """ウエスト +: ウエストの帯を水平に広げ、ヒップを測る高さの少し上で 0 にする"""
    z_crotch, z_waist = _heights(P, lm)
    z0 = z_crotch + HIP_RISE + HIP_KEEP
    w = pt._smooth01((P[:, 2] - z0) / (z_waist - z0))
    c = P[lm["waist"]].mean(0)
    d = np.zeros_like(P)
    d[:, :2] = (P[:, :2] - c[:2]) * (k * w)[:, None]
    return d


def hip_displacement(P, lm, k):
    """ヒップ +: ヒップを測る高さで水平に広げ、ウエストの帯と太ももの中ほどに向かって 0 にする"""
    z_crotch, z_waist = _heights(P, lm)
    z_hip = z_crotch + HIP_RISE
    up = pt._smooth01((z_waist - P[:, 2]) / (z_waist - z_hip))
    knee = (z_crotch + P[lm["legs"]["right"]["hem"]][:, 2].mean()) / 2
    down = pt._smooth01((P[:, 2] - knee) / (z_hip - knee))
    w = np.where(P[:, 2] >= z_hip, up, down)
    band = (P[:, 2] > z_crotch) & (P[:, 2] < z_crotch + 0.04)
    c = P[band].mean(0)
    d = np.zeros_like(P)
    d[:, :2] = (P[:, :2] - c[:2]) * (k * w)[:, None]
    return d


def thigh_displacement(P, lm, k):
    """わたり幅 +: 太ももを広げ、ひざとウエストの帯に向かって 0 にする。
    股より下は脚の軸から、上は体の中心から外へ広げ、股の上下で向きをなだらかに切り替える
    （左右の脚の中心の縫い目が逆向きに引っ張られないように）"""
    z_crotch, z_waist = _heights(P, lm)
    side, axes = _leg_of(P, lm)
    knee = (z_crotch + P[lm["legs"]["right"]["hem"]][:, 2].mean()) / 2
    z_top = z_crotch - THIGH_DROP
    down = pt._smooth01((P[:, 2] - knee) / (z_top - knee))
    up = pt._smooth01((z_waist - P[:, 2]) / (z_waist - z_top))
    w = np.where(P[:, 2] <= z_top, down, up)
    leg_dir = np.zeros_like(P)
    for s, (c0, u) in axes.items():
        m = side == s
        leg_dir[m] = _radial_from_axis(P[m], c0, u)
    band = (P[:, 2] > z_crotch) & (P[:, 2] < z_crotch + 0.04)
    c = P[band].mean(0)
    body_dir = np.zeros_like(P)
    body_dir[:, :2] = P[:, :2] - c[:2]
    b = pt._smooth01((P[:, 2] - (z_crotch - CROTCH_BLEND)) / (2 * CROTCH_BLEND))[:, None]
    return ((1 - b) * leg_dir + b * body_dir) * (k * w)[:, None]


def hem_displacement(P, lm, k):
    """裾幅 +: 裾を脚の軸から広げ、ひざに向かって 0 にする"""
    z_crotch, _ = _heights(P, lm)
    side, axes = _leg_of(P, lm)
    z_hem = P[lm["legs"]["right"]["hem"]][:, 2].mean()
    knee = (z_crotch + z_hem) / 2
    w = pt._smooth01((knee - P[:, 2]) / (knee - z_hem))
    d = np.zeros_like(P)
    for s, (c0, u) in axes.items():
        m = side == s
        d[m] = _radial_from_axis(P[m], c0, u) * (k * w[m])[:, None]
    return d


def rise_displacement(P, lm, k):
    """股上 +: 股から上を上へ伸ばす（股で 0、ウエストの帯で k）"""
    z_crotch, z_waist = _heights(P, lm)
    w = np.clip((P[:, 2] - z_crotch) / (z_waist - z_crotch), 0, 1)
    d = np.zeros_like(P)
    d[:, 2] = k * w
    return d


def rise_displacement_from_hip(P, lm, k):
    """股上 +（女性）: ヒップを測る高さから上だけを上へ伸ばす（ヒップの高さで 0、ウエストの帯で k）。
    股から伸ばすと、ヒップを測る高さで切る所が上へずれる。腰の丸みが強い女性の体では、ヒップがキーの値に比例しなくなり
    （股上 +4 だけで 0.5cm ずれる）、ヒップとわたり幅のキーがほぼ同じ向きに効くので、解いたキーで大きくずれた"""
    z_crotch, z_waist = _heights(P, lm)
    z_hip = z_crotch + HIP_RISE
    w = np.clip((P[:, 2] - z_hip) / (z_waist - z_hip), 0, 1)
    d = np.zeros_like(P)
    d[:, 2] = k * w
    return d


def inseam_displacement(P, lm, k):
    """股下 +: 股から下を、脚の軸に沿って伸ばす（股で 0、裾で k）"""
    crotch = P[lm["crotch"]]
    side, axes = _leg_of(P, lm)
    d = np.zeros_like(P)
    for s, (_, u) in axes.items():
        m = side == s
        span = (P[lm["legs"][s]["hem_inner"]] - crotch) @ u
        t = np.clip(((P[m] - crotch) @ u) / span, 0, 1)
        d[m] = np.outer(k * t, u)
    return d


DISPLACEMENTS = {"waist": waist_displacement, "hip": hip_displacement, "thigh": thigh_displacement,
                 "rise": rise_displacement, "inseam": inseam_displacement, "hem": hem_displacement}
# 女性は股上のキーだけ違う形にする
FEMALE_DISPLACEMENTS = {**DISPLACEMENTS, "rise": rise_displacement_from_hip}


# ---------------------------------------------------------------- 体の寸法（着られるかの判定）

def _hull_len(pts):
    """水平面の点の凸包の一周（外からメジャーを 1 本巻いた長さ）"""
    q = sorted(set((round(float(x), 6), round(float(y), 6)) for x, y in pts[:, :2]))
    if len(q) < 3:
        return 0.0

    def half(points):
        h = []
        for p in points:
            while len(h) >= 2 and ((h[-1][0] - h[-2][0]) * (p[1] - h[-2][1])
                                   - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0])) <= 0:
                h.pop()
            h.append(p)
        return h

    hull = np.array(half(q)[:-1] + half(q[::-1])[:-1])
    return pt._polyline_len(hull, True)


def body_trouser_measures(B, body_polys, P, lm):
    """ズボンの寸法と同じ高さで体を切った周囲（cm）。ウエストは胴の一周、
    ヒップはその高さの体（胴か左右の脚）を外から 1 本で巻いた長さ、太ももは片脚の一周 ÷ 2（左右の平均）。
    ジーンズの股は体の股より低く、ヒップの高さで体はもう左右の脚に分かれていることがあるので、ヒップは巻いた長さにする。
    この高さでは手も切れるので、体の中心をまたぐ切り口（胴）と、脚の近くの切り口だけを使う"""
    z_crotch = P[lm["crotch"]][2]
    z_waist = P[lm["waist"]][:, 2].mean()

    def torso(z):
        return sum(pt._polyline_len(line, closed) for line, closed in _slice_loops(B, body_polys, z)
                   if line[:, 0].min() < 0 < line[:, 0].max()) * 100

    legs = [pt._polyline_len(line, closed) / 2 * 100
            for line, closed in _slice_loops(B, body_polys, z_crotch - THIGH_DROP)
            if not line[:, 0].min() < 0 < line[:, 0].max() and abs(line[:, 0].mean()) < 0.2]
    near = [line for line, _ in _slice_loops(B, body_polys, z_crotch + HIP_RISE)
            if line[:, 0].min() < 0 < line[:, 0].max() or abs(line[:, 0].mean()) < 0.2]
    hip = _hull_len(np.vstack(near)) * 100 if near else 0.0
    return {"waist": torso(z_waist), "hip": hip, "thigh": float(np.mean(legs)) if legs else 0.0}
