"""
Pitari 長袖の生成（Blender 4.2 + MPFB2 2.0.x）

Tシャツ（pitari_tshirt.add_shirt）の袖口から手首まで、腕に沿って輪を足して長袖にする。
Tシャツの頂点は番号も形も変えず、足した頂点は後ろに付け足すので、Tシャツの基準点はそのまま使える。
体型・身長ごとの形も、その体の腕に沿って同じ数の輪を足して作る（mhclo のフィッティングは Tシャツの部分だけ）。
"""
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import pitari_tshirt as pt

RINGS = 14                  # 袖口から手首までに足す輪の数
WRIST_EASE = 0.012          # 手首の輪の、腕の表面からのゆとり（m）
EASE_FADE = 0.5             # 袖口のゆとりから手首のゆとりへ、輪の半分までかけて移る
MARCH_STEP = 0.01           # 腕の中心線をたどる間隔（m）
MARCH_MAX = 0.6
RAY_DIRS = 16               # 腕の断面を測る向きの数
FOREARM_MIN = 0.15          # 手首は、袖口からこれより先で探す（ひじの細い所を手首と間違えない）
HAND_GROW = 1.25            # 断面の半径がそれまでの最小値のこれ倍を超えたら手に入ったとみなす
WRIST_BAND = 0.01           # 手首の位置を覚える体の頂点：手首の断面からこの距離以内の腕の表面の頂点
UNFOLD = 0.01               # Tシャツの袖口は内側へ折り返してあるので、折り返しの縁から外側の面に沿ってこれだけ先へ開く
ROUND = 0.5                 # 輪の半径を、腕の断面の形（0）と円（1）の間のこの割合にする（腕の凹凸を袖に写さない）


def ordered_loop(me, loop):
    """境界の頂点の集合を、辺でつながった順に並べる（どの体でも同じ順になる）"""
    s = set(loop)
    adj = {i: [] for i in loop}
    for e in me.edges:
        a, b = e.vertices
        if a in s and b in s:
            adj[a].append(b); adj[b].append(a)
    out = [min(loop)]
    seen = {out[0]}
    while len(out) < len(loop):
        nxt = next((j for j in sorted(adj[out[-1]]) if j not in seen), None)
        if nxt is None:
            raise RuntimeError(f"袖口の輪がつながっていません: {len(out)} / {len(loop)}")
        out.append(nxt); seen.add(nxt)
    return out


def body_bvh(body):
    """helper を除いた体の面の BVH（体型キー・マクロを混ぜた形）"""
    P = pt.body_mix_coords(body)
    keep = pt.helper_keep_mask(body)
    polys = [p for p in pt.polys_of(body) if all(keep[i] for i in p)]
    return BVHTree.FromPolygons([Vector(p) for p in P], polys)


def _plane_basis(d):
    a = np.array([0.0, 0.0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    e1 = np.cross(d, a); e1 /= np.linalg.norm(e1)
    return e1, np.cross(d, e1)


def _section(bvh, c, d):
    """中心 c・向き d の面で、腕の表面まで RAY_DIRS 方向に光線を飛ばす。当たった点（なければ None）"""
    e1, e2 = _plane_basis(d)
    hits = []
    for k in range(RAY_DIRS):
        a = 2 * np.pi * k / RAY_DIRS
        r = np.cos(a) * e1 + np.sin(a) * e2
        loc, _, _, _ = bvh.ray_cast(Vector(c), Vector(r), 0.15)
        if loc is None:
            return None
        hits.append(np.array(loc))
    return np.array(hits)


def march_arm(bvh, c, d):
    """袖口の中心 c から向き d に、腕の断面の中心をたどる。中心・向き・断面の平均半径の列"""
    centers, dirs, radii = [], [], []
    for _ in range(int(MARCH_MAX / MARCH_STEP)):
        hits = _section(bvh, c, d)
        if hits is None:
            break
        for _ in range(2):                                    # 断面の中心へ寄せて測り直す
            c = hits.mean(0)
            hits = _section(bvh, c, d)
            if hits is None:
                break
        if hits is None:
            break
        centers.append(c); dirs.append(d)
        radii.append(float(np.linalg.norm(hits - c, axis=1).mean()))
        if len(centers) >= 2:
            nd = centers[-1] - centers[-2]
            d = 0.5 * d + 0.5 * nd / np.linalg.norm(nd)
            d /= np.linalg.norm(d)
        c = c + d * MARCH_STEP
    return np.array(centers), np.array(dirs), np.array(radii)


def find_wrist(radii):
    """前腕より先で、手に入る手前の一番細い所の番号"""
    start = int(FOREARM_MIN / MARCH_STEP)
    best = start
    for i in range(start, len(radii)):
        if radii[i] < radii[best]:
            best = i
        elif radii[i] > radii[best] * HAND_GROW:
            break
    return best


def _ray_radius(bvh, c, r):
    loc, _, _, _ = bvh.ray_cast(Vector(c), Vector(r), 0.15)
    return float(np.linalg.norm(np.array(loc) - c)) if loc is not None else None


def wrist_verts(B, keep, center, d, radius):
    """手首の断面の近くにある腕の表面の頂点（体の頂点番号）。体型・身長が変わっても、この頂点の平均を手首にする"""
    X = B - center
    near = (np.abs(X @ d) < WRIST_BAND) & (np.linalg.norm(X, axis=1) < radius * 1.6) & keep
    return [int(i) for i in np.where(near)[0]]


def sleeve_rings(P, bvh, seam, cuff, wrist=None):
    """袖口 cuff（順に並べた頂点番号）の先に足す RINGS 個の輪の座標 (RINGS, len(cuff), 3) と、手首の中心・向き・半径。
    wrist（手首の点）を渡すと、腕の中心線上でそこに一番近い所を手首にする。渡さなければ、腕の一番細い所を探す"""
    c_seam, c_cuff = P[seam].mean(0), P[cuff].mean(0)
    u = c_cuff - c_seam; u /= np.linalg.norm(u)
    centers, dirs, radii = march_arm(bvh, c_cuff, u)
    w = find_wrist(radii) if wrist is None else int(np.argmin(np.linalg.norm(centers - wrist, axis=1)))
    wrist_info = (centers[w], dirs[w], radii[w])
    centers, dirs = centers[:w + 1], dirs[:w + 1]
    arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(centers, axis=0), axis=1))])

    # 袖口の頂点ごとの、軸まわりの向き・腕の表面からのゆとり・軸の向きのずれ
    X = P[cuff] - centers[0]
    axial = X @ dirs[0]
    radial = X - np.outer(axial, dirs[0])
    dist = np.linalg.norm(radial, axis=1)
    rdir = radial / dist[:, None]
    ease0 = np.array([dist[i] - (_ray_radius(bvh, centers[0], rdir[i]) or dist[i]) for i in range(len(cuff))])

    n = len(cuff)
    C, D, Rd = np.empty((RINGS, 3)), np.empty((RINGS, 3)), np.empty((RINGS, n, 3))
    rho = np.empty((RINGS, n))
    for j in range(RINGS):
        s = (j + 1) / RINGS * arc[-1]
        k = min(int(np.searchsorted(arc, s)), len(arc) - 1)
        k0 = max(k - 1, 0)
        t = 0.0 if arc[k] == arc[k0] else (s - arc[k0]) / (arc[k] - arc[k0])
        C[j] = centers[k0] + t * (centers[k] - centers[k0])
        d = dirs[k0] + t * (dirs[k] - dirs[k0]); D[j] = d / np.linalg.norm(d)
        for i in range(n):
            r = rdir[i] - (rdir[i] @ D[j]) * D[j]; Rd[j, i] = r / np.linalg.norm(r)
            h = _ray_radius(bvh, C[j], Rd[j, i])
            if h is None:
                raise RuntimeError(f"腕の表面が見つかりません（輪 {j + 1}）")
            rho[j, i] = h
    # 腕の凹凸（ひじなど）を写さないよう、円に寄せてから、輪の並びの向きにならす
    rho = (1 - ROUND) * rho + ROUND * rho.mean(1, keepdims=True)
    padded = np.vstack([rho[:1], rho, rho[-1:]])
    rho = (padded[:-2] + padded[1:-1] + padded[2:]) / 3

    rings = np.empty((RINGS, n, 3))
    for j in range(RINGS):
        f = (j + 1) / RINGS
        g = pt._smooth01(f / EASE_FADE)
        ease = np.maximum((1 - g) * ease0 + g * WRIST_EASE, 0.004)
        rings[j] = C[j] + Rd[j] * (rho[j] + ease)[:, None] + np.outer(axial * (1 - f), D[j])
    return rings, wrist_info


def unfold_cuff(me, P, cuff):
    """内側へ折り返した袖口の縁を、外側の面（折り返しの縁 → その1つ上の輪）の延長に動かした座標"""
    s = set(cuff)
    adj = {}
    for e in me.edges:
        a, b = e.vertices
        adj.setdefault(a, set()).add(b); adj.setdefault(b, set()).add(a)
    out = {}
    for i in cuff:
        fold = next(j for j in adj[i] if j not in s)
        above = max((j for j in adj[fold] if j not in s and j != i),
                    key=lambda j: np.linalg.norm(P[j] - P[i]))
        v = P[fold] - P[above]
        out[i] = P[fold] + v / np.linalg.norm(v) * UNFOLD
    return out


def extend_sleeves(shirt, body, lm, wrists=None):
    """Tシャツ shirt の両袖を手首まで伸ばす。lm は標準体型の Tシャツの基準点（頂点番号はどの体でも同じ）。
    wrists は袖ごとの手首の体の頂点番号（標準体型で返した値）。渡さなければ腕の一番細い所を手首にする。
    袖ごとに、袖口の頂点の並び（cuff）、足した輪の頂点番号（rings、輪ごとに cuff と同じ列の順）、
    手首の体の頂点番号（wrist）を返す"""
    me = shirt.data
    P = pt.world_coords(shirt)
    B = pt.body_mix_coords(body)
    keep = pt.helper_keep_mask(body)
    bvh = body_bvh(body)
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active
    Minv = np.array(shirt.matrix_world.inverted())
    added = {}
    for side in ("right", "left"):
        bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
        cuff = ordered_loop(me, lm["sides"][side]["cuff"])
        for i, p in unfold_cuff(me, P, cuff).items():
            P[i] = p
            bm.verts[i].co = Vector(p @ Minv[:3, :3].T + Minv[:3, 3])
        point = B[wrists[side]].mean(0) if wrists else None
        rings, (wc, wd, wr) = sleeve_rings(P, bvh, lm["sides"][side]["seam"], cuff, point)
        wv = wrists[side] if wrists else wrist_verts(B, keep, wc, wd, wr)
        # 袖口の辺を持つ面の向き（a→b の順か）に合わせて、新しい面を逆回りに張る
        edge_face = {}
        for f in bm.faces:
            vs = [v.index for v in f.verts]
            for k in range(len(vs)):
                edge_face[(vs[k], vs[(k + 1) % len(vs)])] = f
        forward = (cuff[0], cuff[1]) in edge_face
        uv_of = {}
        for i in cuff:
            loop = next(l for l in bm.verts[i].link_loops)
            uv_of[i] = loop[uvl].uv.copy()
        prev = [bm.verts[i] for i in cuff]
        ids = []
        for ring in rings:
            local = ring @ Minv[:3, :3].T + Minv[:3, 3]
            cur = [bm.verts.new(Vector(p)) for p in local]
            n = len(cuff)
            for i in range(n):
                a, b = prev[i], prev[(i + 1) % n]
                a2, b2 = cur[i], cur[(i + 1) % n]
                face = bm.faces.new([b, a, a2, b2] if forward else [a, b, b2, a2])
                face.smooth = True
                for l in face.loops:              # UV は袖口の同じ列の値を使う（テクスチャを貼るときに展開し直す）
                    col = (cur.index(l.vert) if l.vert in cur else prev.index(l.vert)) % n
                    l[uvl].uv = uv_of[cuff[col]]
            ids.append(cur)
            prev = cur
        added[side] = (cuff, ids, wv)
    bm.verts.index_update()
    result = {s: {"cuff": cuff, "rings": [[v.index for v in ring] for ring in rs], "wrist": wv}
              for s, (cuff, rs, wv) in added.items()}
    bm.to_mesh(me); bm.free(); me.update()
    return result


def longsleeve_landmarks(lm, added):
    """Tシャツの基準点に、足した輪を加える。袖口は最後の輪、袖丈の経路は Tシャツの袖口の一番上の頂点の列を手首までたどる"""
    out = {**lm, "sides": {}, "sleeve_verts": {}}
    for side, a in added.items():
        s = dict(lm["sides"][side])
        col = a["cuff"].index(s["sleeve_path"][-1])
        s["sleeve_path"] = list(s["sleeve_path"]) + [ring[col] for ring in a["rings"]]
        s["cuff"] = list(a["rings"][-1])
        s["rings"] = [list(a["cuff"])] + [list(r) for r in a["rings"]]    # Tシャツの袖口から手首までの輪
        out["sides"][side] = s
        out["sleeve_verts"][side] = list(lm["sleeve_verts"][side]) + [i for r in a["rings"] for i in r]
    return out


def _arm_axis(P, lm, side):
    """腕の中心線（縫い目の中心 → 袖口から手首までの輪の中心）の点・線分の長さ・累積の長さ・向き"""
    s = lm["sides"][side]
    A = np.vstack([P[s["seam"]].mean(0)] + [P[r].mean(0) for r in s["rings"]])
    seg = np.diff(A, axis=0)
    L = np.linalg.norm(seg, axis=1)
    return A, L, np.concatenate([[0.0], np.cumsum(L)]), seg / L[:, None]


def sleeve_params(P, lm):
    """袖の頂点ごとの、腕の中心線に沿った位置（縫い目 0 → 袖口 1）。胴の頂点は 0"""
    out = np.zeros(len(P))
    torso = set(lm["torso_verts"])
    for side in ("left", "right"):
        A, L, S, T = _arm_axis(P, lm, side)
        for i in lm["sleeve_verts"][side]:
            if i in torso:
                continue
            t = np.clip(((P[i] - A[:-1]) * T).sum(1) / L, 0, 1)
            near = A[:-1] + T * (t * L)[:, None]
            j = int(np.argmin(np.linalg.norm(P[i] - near, axis=1)))
            out[i] = (S[j] + t[j] * L[j]) / S[-1]
    return out


def sleeve_displacement(P, lm, k):
    """袖丈 +: 袖の頂点を前腕の向き（手首までの後ろ半分の輪の中心を結ぶ向き）に、縫い目（0）→ 袖口（k）の割合で動かす。
    割合は腕の中心線に沿った位置（sleeve_params）で決める。
    Tシャツの袖丈キー（縫い目→袖口の直線の向き）だと、ひじで曲がった腕から袖口が外れる。
    頂点ごとに中心線の向きへ動かすと、ひじで向きが分かれて、キーを混ぜたときの寸法の変わり方が直線から外れる"""
    t = sleeve_params(P, lm)
    d = np.zeros_like(P)
    for side in ("left", "right"):
        A = _arm_axis(P, lm, side)[0]
        u = A[-1] - A[len(A) // 2]
        u /= np.linalg.norm(u)
        idx = np.array(lm["sleeve_verts"][side])
        d[idx] = np.outer(k * t[idx], u)
    return d


DISPLACEMENTS = {**pt.DISPLACEMENTS, "sleeve": sleeve_displacement}


# ---------------------------------------------------------------- 余った袖の垂れ方（布のシミュレーション）

DRAPE_CM = [3, 6, 10]       # 袖丈が腕より長い分（cm）。この長さごとに、手に垂れた形をキー drape_<cm> にする
DRAPE_FREE_BACK = 0.08      # 手首から肩の側へこの長さより先の袖を、布として動かす（ほかは止めておく）
DRAPE_OPEN = 0.4            # 手首より先の袖口を、始めに半径のこの割合まで広げる（手に食い込んだ状態から始めない）
DRAPE_FRAMES = 60


def _radial_dirs(P, lm, side, idx):
    """腕の中心線に対する、頂点ごとの外向きの単位ベクトル"""
    A, L, _, T = _arm_axis(P, lm, side)
    out = np.zeros((len(idx), 3))
    for n, i in enumerate(idx):
        t = np.clip(((P[i] - A[:-1]) * T).sum(1) / L, 0, 1)
        near = A[:-1] + T * (t * L)[:, None]
        j = int(np.argmin(np.linalg.norm(P[i] - near, axis=1)))
        r = P[i] - near[j]
        out[n] = r / max(np.linalg.norm(r), 1e-9)
    return out


def drape_shape(shirt, body, lm, excess_cm):
    """袖丈キーで excess_cm 長くした長袖の、手首より先の袖を布として手に垂らした形（ワールド座標）"""
    import bpy
    P0 = pt.mixed_coords(shirt, {"size_sleeve": float(excess_cm)})
    B = pt.world_coords(shirt, "Basis")
    t = sleeve_params(B, lm)
    s0 = pt.measure(B, lm, pt.polys_of(shirt))["sleeve"] / 100
    e = excess_cm / 100
    arc = t * (s0 + e)                                        # 縫い目からの、腕に沿った長さ（伸ばした後）
    start = P0.copy()
    for side in ("left", "right"):
        idx = np.array([i for i in lm["sleeve_verts"][side] if t[i] > 0])
        beyond = np.clip((arc[idx] - s0) / e, 0, 1)           # 手首 0 → 袖口 1
        r = _radial_dirs(P0, lm, side, idx)
        start[idx] += r * (DRAPE_OPEN * 0.045 * beyond ** 2)[:, None]
    free = arc > s0 - DRAPE_FREE_BACK

    # シェイプキーを持つメッシュを複製すると、消すときにキーの参照が壊れるので、頂点と面だけで作る（ワールド座標）
    me = bpy.data.meshes.new("drape_tmp")
    me.from_pydata([tuple(p) for p in start], [], pt.polys_of(shirt))
    me.update()
    obj = bpy.data.objects.new("drape_tmp", me)
    bpy.context.scene.collection.objects.link(obj)
    pin = obj.vertex_groups.new(name="pin")
    pin.add([int(i) for i in np.where(~free)[0]], 1.0, "REPLACE")
    cloth = obj.modifiers.new("cloth", "CLOTH")
    st = cloth.settings
    st.quality = 12
    st.mass = 0.2
    st.tension_stiffness = st.compression_stiffness = 10.0
    st.shear_stiffness = 5.0
    st.bending_stiffness = 0.5                                # 指の間に落ち込まない程度の硬さ
    st.air_damping = 1.0
    st.vertex_group_mass = "pin"
    cloth.collision_settings.distance_min = 0.006
    cloth.collision_settings.collision_quality = 4
    cloth.collision_settings.use_self_collision = False
    col = body.modifiers.new("collision", "COLLISION")
    body.collision.thickness_outer = 0.008                    # 指の上をなでるように（指の間に入り込まないように）
    sc = bpy.context.scene
    cloth.point_cache.frame_start, cloth.point_cache.frame_end = 1, DRAPE_FRAMES
    for f in range(1, DRAPE_FRAMES + 1):
        sc.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg).to_mesh()
    co = np.empty(len(ev.vertices) * 3); ev.vertices.foreach_get("co", co)
    obj.evaluated_get(dg).to_mesh_clear()
    res = co.reshape(-1, 3)
    body.modifiers.remove(col)
    pt.remove_objects([obj])
    sc.frame_set(1)
    moved = np.linalg.norm(res - P0, axis=1)
    pt.log(f"drape_{excess_cm}: 動いた頂点 {int((moved > 1e-4).sum())}、最大 {moved.max() * 100:.1f}cm")
    return res, P0


def make_drape_keys(shirt, body, lm):
    """DRAPE_CM ごとに、垂れた形と袖丈キーだけの形の差を、キー drape_<cm>（値 1 で差のぶん）にする"""
    B = pt.world_coords(shirt, "Basis")
    for e in DRAPE_CM:
        res, P0 = drape_shape(shirt, body, lm, e)
        pt.set_key_from_world(shirt, f"drape_{e}", B + (res - P0))


# ---------------------------------------------------------------- 写真から貼る用の UV（pitari）

UV_MARGIN = 0.02            # 並べ直した島の、画像の端と島どうしの間の余白（UV）


UV_MIN_RUN = 8              # 袖口を一周したとき、島がこの本数より短く入れ替わる所は、隣の島にそろえる


def _face_island(me, loop_uv, f):
    return "front" if np.mean([loop_uv[(f.index, v)][0] for v in f.vertices]) < 0.5 else "back"


def _merge_short_runs(cols, cuff, me, loop_uv, n):
    """袖口の辺ごとの島（cols[c] = (島, {0: 始まりの頂点の UV, 1: 終わりの頂点の UV})）のうち、
    短く入れ替わる所を隣の島にそろえる。テクスチャ担当の UV は袖の前後の切れ目が階段状なので、
    そのままだと、離れた所の島から細い帯が延びる。そろえた辺の UV は、その島での頂点の UV、無ければ隣の辺から延ばす"""
    labels = [cols[c][0] for c in range(n)]
    start = next(c for c in range(n) if labels[c] != labels[c - 1])     # 島の変わり目から一周する
    runs, cur = [], [start]
    for k in range(1, n):
        c = (start + k) % n
        if labels[c] == labels[cur[-1]]:
            cur.append(c)
        else:
            runs.append(cur); cur = [c]
    runs.append(cur)
    for i, run in enumerate(runs):
        if len(run) >= UV_MIN_RUN:
            continue
        prev_run, next_run = runs[i - 1], runs[(i + 1) % len(runs)]
        target = labels[(prev_run if len(prev_run) >= len(next_run) else next_run)[0]]
        for c in run:
            ends = {}
            for k, v in enumerate((cuff[c], cuff[(c + 1) % n])):
                for p in me.polygons:
                    if v in p.vertices and (p.index, v) in loop_uv and _face_island(me, loop_uv, p) == target:
                        ends[k] = loop_uv[(p.index, v)]
                        break
            cols[c] = (target, ends)
    # 島での UV が無い頂点は、同じ島の隣の辺の UV から直線で延ばす
    for c in range(n):
        isl, ends = cols[c]
        for k in (0, 1):
            if k in ends:
                continue
            a, b = cols[(c - 1) % n], cols[(c - 2) % n]
            if a[0] == isl and b[0] == isl and 0 in a[1] and 0 in b[1]:
                ends[k] = a[1][0] + (a[1][0] - b[1][0]) * (1 + k)
            else:
                a, b = cols[(c + 1) % n], cols[(c + 2) % n]
                ends[k] = a[1][1] + (a[1][1] - b[1][1]) * (2 - k)


UV_CUFF_JUMP = 0.008        # 袖口の UV が、同じ島の隣の列から袖の向きにこれより離れていたら、隣に合わせる
UV_CUFF_WINDOW = 3          # 比べる隣の列の数（片側）


def _straighten_cuff(cols, n, step):
    """延ばし始める袖口の UV を、袖の向きにそろえる。テクスチャ担当の UV は袖の前後の切れ目が階段状で、
    切れ目の近くの数列だけ袖口が袖の先の方へずれ、そこから延ばすと細い帯が飛び出すため。
    同じ島の隣の列（両側 UV_CUFF_WINDOW 列）の、袖の向きの位置の中央値から UV_CUFF_JUMP より離れた端を、中央値に合わせる"""
    for isl, st in step.items():
        d = st / np.linalg.norm(st)
        idx = [c for c in range(n) if cols[c][0] == isl]
        along = {(c, k): float(cols[c][1][k] @ d) for c in idx for k in (0, 1)}
        fixed = {}
        for c in idx:
            near = [along[(cc, k)] for cc in idx
                    if 0 < min((cc - c) % n, (c - cc) % n) <= UV_CUFF_WINDOW for k in (0, 1)]
            if not near:
                continue
            med = float(np.median(near))
            for k in (0, 1):
                if abs(along[(c, k)] - med) > UV_CUFF_JUMP:
                    fixed[(c, k)] = cols[c][1][k] + d * (med - along[(c, k)])
        for (c, k), v in fixed.items():
            cols[c][1][k] = v
        if fixed:
            pt.log(f"pitari UV: 袖口の位置をそろえた端 {len(fixed)}（{isl}）")


def extend_pitari_uv(shirt, lm):
    """長袖の pitari UV を作る。Tシャツの部分はテクスチャ担当の UV（apply_pitari_uv で写したもの）のまま、
    手首まで足した面は、袖口の島（前身頃か後身頃）を、その島での袖の向きにまっすぐ延ばす（長さは袖口の近くの縮尺で）。
    延ばすと左右の島の袖がぶつかるので、前身頃を上半分、後身頃を下半分に、同じ縮尺で並べ直す"""
    me = shirt.data
    uv = me.uv_layers["pitari"]
    P = pt.world_coords(shirt, "Basis")
    U = np.empty(len(me.loops) * 2); uv.data.foreach_get("uv", U); U = U.reshape(-1, 2)
    where = {}                                     # 足した輪の頂点 → (輪の番号, 列)
    for side in ("left", "right"):
        for j, ring in enumerate(lm["sides"][side]["rings"]):
            for c, v in enumerate(ring):
                where[v] = (side, j, c)
    new_faces = [p for p in me.polygons if any(where.get(v, (0, 0))[1] > 0 for v in p.vertices)]
    new_ids = {p.index for p in new_faces}
    old_by_edge = {}
    for p in me.polygons:
        if p.index in new_ids:
            continue
        vs = list(p.vertices)
        for k in range(len(vs)):
            old_by_edge[frozenset((vs[k], vs[(k + 1) % len(vs)]))] = p
    loop_uv = {}                                   # (面, 頂点) → UV
    for p in me.polygons:
        for li in p.loop_indices:
            loop_uv[(p.index, me.loops[li].vertex_index)] = U[li]

    island = {}                                    # 足した面 → "front" か "back"
    for side in ("left", "right"):
        rings = lm["sides"][side]["rings"]
        cuff, n = rings[0], len(rings[0])
        # 列ごとの、袖口から輪までの長さ（3D）
        dist = np.zeros((len(rings), n))
        for j in range(1, len(rings)):
            dist[j] = dist[j - 1] + np.linalg.norm(P[rings[j]] - P[rings[j - 1]], axis=1)
        # 袖口の辺ごとに、隣の Tシャツの面から、島・袖口の UV・袖の向き・縮尺を取る
        cols, samples = {}, {"front": [], "back": []}
        for c in range(n):
            a, b = cuff[c], cuff[(c + 1) % n]
            f = old_by_edge[frozenset((a, b))]
            ua, ub = loop_uv[(f.index, a)], loop_uv[(f.index, b)]
            isl = "front" if (ua[0] + ub[0]) / 2 < 0.5 else "back"
            inner = [v for v in f.vertices if v not in (a, b)]
            ui = np.mean([loop_uv[(f.index, v)] for v in inner], axis=0)
            pc, pi = (P[a] + P[b]) / 2, P[inner].mean(0)
            duv = (ua + ub) / 2 - ui
            samples[isl].append((duv, np.linalg.norm(duv) / np.linalg.norm(pc - pi)))
            cols[c] = (isl, {0: ua, 1: ub})
        _merge_short_runs(cols, cuff, me, loop_uv, n)
        step = {}
        for isl, ss in samples.items():
            if ss:
                d = np.mean([s[0] / np.linalg.norm(s[0]) for s in ss], axis=0)
                step[isl] = d / np.linalg.norm(d) * float(np.median([s[1] for s in ss]))
        _straighten_cuff(cols, n, step)
        for p in new_faces:
            if where[p.vertices[0]][0] != side:
                continue
            cs = {where[v][2] for v in p.vertices}
            c = (n - 1) if cs == {n - 1, 0} else min(cs)
            isl, ends = cols[c]
            island[p.index] = isl
            for li in p.loop_indices:
                v = me.loops[li].vertex_index
                _, j, cv = where[v]
                base = ends[0] if cv == c else ends[1]
                U[li] = base + step[isl] * dist[j, cv]

    # 島ごとに並べ直す（前身頃を上半分、後身頃を下半分。縮尺は両方で同じ）
    loop_isl = np.empty(len(me.loops), dtype=object)
    for p in me.polygons:
        isl = island.get(p.index)
        if isl is None:
            isl = "front" if U[list(p.loop_indices)][:, 0].mean() < 0.5 else "back"
        loop_isl[list(p.loop_indices)] = isl
    boxes = {isl: (U[loop_isl == isl].min(0), U[loop_isl == isl].max(0)) for isl in ("front", "back")}
    scale = min(min((1 - 2 * UV_MARGIN) / (hi[0] - lo[0]), (0.5 - 1.5 * UV_MARGIN) / (hi[1] - lo[1]))
                for lo, hi in boxes.values())
    for isl, cy in (("front", 0.75 - UV_MARGIN / 4), ("back", 0.25 + UV_MARGIN / 4)):
        lo, hi = boxes[isl]
        m = loop_isl == isl
        U[m] = (U[m] - (lo + hi) / 2) * scale + np.array([0.5, cy])
    uv.data.foreach_set("uv", U.ravel())
    me.update()
    pt.log(f"pitari UV: 足した面 {len(new_faces)}、縮尺 {scale:.3f}（Tシャツの配置に対して）")
