"""
サイズ合わせの検証

ブラウザと同じ計算（M × size_* = 実寸 − 基準寸法。基準寸法と M はその体型・身長の値を補間）でキーの値を出し、
その形の Tシャツをメッシュ上で計測して、入力した実寸との差を確かめる。
あわせて指定の組み合わせで、突き抜け対策（web の push-out.ts）と同じ計算で服を押し出し、
押し出した後の寸法の入力とのずれ（合否には使わない）、体へのめり込みを出して画像を書き出す。

実行（pitari/ で、build_tshirt.py の後に）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background assets/blender/out/build.blend --python assets/blender/verify_sizes.py
長袖（build_longsleeve.py の後に）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background assets/blender/out/build_longsleeve.blend --python assets/blender/verify_sizes.py -- longsleeve
女性（build_tshirt_female.py の後に。服の名前の後に female）:
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" --background assets/blender/out/build_female.blend --python assets/blender/verify_sizes.py -- tshirt female

合格条件：標準体型は全項目 ±0.5cm 以内、ほかの体型は ±1cm 以内。不合格なら終了コード 1
女性は、押し出しを着せるための体（avatar_fit）に対して行い、さらに次も合格条件にする（check_bust）：
  谷間に服の頂点が入っていない／胸の下に、着せるための体で埋めた深さの BUST_GAP_MIN 倍以上、服と体の間の空間がある
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
import pitari_female as pf  # noqa: E402
import pitari_tshirt as pt  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, "apps", "web", "public", "models")
# 確かめる服（"tshirt" か "longsleeve"）。オブジェクト名と、JSON・基準点のファイル名に使う
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GARMENT = ARGS[0] if ARGS else "tshirt"
GENDER = ARGS[1] if len(ARGS) > 1 else "male"
FEMALE = GENDER == "female"
RENDERS = os.path.join(HERE, "out", "_".join(
    ["renders"] + ([GARMENT] if GARMENT != "tshirt" else []) + ([GENDER] if FEMALE else [])))
# 女性は胸の形を見るので、背面の代わりに横から描く
VIEWS = ((("front", (0, -1, 0)), ("side", (1, 0, 0)), ("three_quarter", (0.7, -0.7, 0))) if FEMALE else
         (("front", (0, -1, 0)), ("three_quarter", (0.7, -0.7, 0)), ("back", (0, 1, 0))))
TOL = {"standard": 0.5}
TOL_OTHER = 1.0
# 標準の身長に加えて確かめる身長（cm）。測った身長（HEIGHT_SAMPLES_CM）の間も確かめる
HEIGHTS_CM = [150.0, 155.0, 160.0, 167.0, 180.0, 185.0, 190.0, 195.0]

# 基準寸法からの差（着丈, 身幅, 肩幅, 袖丈）
OFFSETS = [
    (0, 0, 0, 0), (5, 5, 3, 3), (-3, -6, -2, -2), (10, 10, 5, 10), (8, -4, 4, -3),
    (-5, 8, -3, 5), (3, 2, 1, 1), (-6, -3, -4, -5), (0, 10, 0, 0), (10, 0, 0, 10),
]
# 指定の 3 つの組み合わせ
CASES = [
    ("broad_width-6", "broad", (0, -6, 0, 0)),
    ("slim_width+10", "slim", (0, 10, 0, 0)),
    ("standard_length+10_sleeve+10", "standard", (10, 0, 0, 10)),
    ("chubby_width-6", "chubby", (0, -6, 0, 0)),        # お腹が出る体型で小さいサイズ
    ("chubby_length+7_width-6", "chubby", (7, -6, -1, 1)),   # 丈を伸ばすと腰が裾から出やすい
    ("standard_base", "standard", (0, 0, 0, 0)),
    ("standard_length-6", "standard", (-6, 0, 0, 0)),   # 着丈を短くしたとき、裾より下の体で裾が引っ張られないか
    ("standard_width-16", "standard", (0, -16, 0, 0)),    # E で押し出したときの寸法のずれを見る
]
# 身長を変えた組み合わせ（名前, 体型, 身長 cm, 基準寸法からの差）
HEIGHT_CASES = [
    ("standard_h150", "standard", 150.0, (0, 0, 0, 0)),
    ("broad_h195_width-6", "broad", 195.0, (0, -6, 0, 0)),
    ("chubby_h155_length+7", "chubby", 155.0, (7, 0, 0, 0)),
]


def load_json(name):
    with open(os.path.join(MODELS, name), encoding="utf-8") as fp:
        return json.load(fp)


def fit_at(build, height_cm, height):
    """ブラウザの fitAt と同じ計算：前後の身長の基準寸法と M を直線で補間する（範囲の外は端の値）"""
    samples = height["builds"][build]
    hs = [s["height_cm"] for s in samples]
    h = min(max(height_cm, hs[0]), hs[-1])
    i = min(max(int(np.searchsorted(hs, h)) - 1, 0), len(hs) - 2)
    lo, hi = samples[i], samples[i + 1]
    t = (h - lo["height_cm"]) / (hi["height_cm"] - lo["height_cm"])
    base_b = {p: lo["base"][p] * (1 - t) + hi["base"][p] * t for p in pt.SIZE_PARTS}
    parts = height["parts"]
    M = (np.array(lo["m"]) * (1 - t) + np.array(hi["m"]) * t)[[parts.index(p) for p in pt.SIZE_PARTS]]
    return base_b, M


def key_values(target, base_b, M):
    """ブラウザの sizeKeyValues と同じ計算：M × キー = 実寸 − 基準 を解く"""
    diff = np.array([target[p] - base_b[p] for p in pt.SIZE_PARTS])
    k = np.linalg.solve(M, diff)
    return {p: float(v) for p, v in zip(pt.SIZE_PARTS, k)}


def check_accuracy(shirt, lm, polys, base, corr, height):
    worst_all, ok = {}, True
    standard_cm = height["standard_cm"]
    for b in pt.BUILDS:
        tol = TOL.get(b, TOL_OTHER)
        for h_cm in [standard_cm] + HEIGHTS_CM:
            h = h_cm - standard_cm
            base_b, M = fit_at(b, h_cm, height)
            worst = 0.0
            for off in OFFSETS:
                target = {p: base_b[p] + o for p, o in zip(pt.SIZE_PARTS, off)}
                k = key_values(target, base_b, M)
                got = pt.measure(pt.mixed_coords(shirt, pt.build_values(b, k, h)), lm, polys)
                err = {p: got[p] - target[p] for p in pt.SIZE_PARTS}
                e = max(abs(v) for v in err.values())
                worst = max(worst, e)
                if e > tol:
                    ok = False
                    pt.log(f"NG {b} {h_cm:.1f}cm {off}: 誤差 " + ", ".join(f"{p} {v:+.2f}" for p, v in err.items()))
            worst_all[(b, h_cm)] = worst
            pt.log(f"{b:10s} {h_cm:6.1f}cm  最大誤差 {worst:.2f}cm（許容 ±{tol}cm）{'OK' if worst <= tol else 'NG'}")
    return ok, worst_all


def bvh_of(P, polys):
    return BVHTree.FromPolygons([Vector(p) for p in P], polys)


def penetration(shirt_P, body_P, shirt_polys, body_polys, cover):
    """(a) 体の内側に入った Tシャツの頂点 (b) Tシャツの外に出た体の頂点（服の下の重み > 0 の範囲）"""
    body_bvh, shirt_bvh = bvh_of(body_P, body_polys), bvh_of(shirt_P, shirt_polys)
    a = []
    for p in shirt_P:
        loc, n, _, _ = body_bvh.find_nearest(Vector(p))
        sd = (Vector(p) - loc).dot(n)
        if sd < -0.002:
            a.append(-sd)
    b = []
    for i in np.where(cover > 0)[0]:
        loc, n, _, _ = shirt_bvh.find_nearest(Vector(body_P[i]), 0.03)
        if loc is not None and (Vector(body_P[i]) - loc).dot(n) > 0.002:
            b.append((Vector(body_P[i]) - loc).dot(n))
    fmt = lambda xs: f"{len(xs)} 頂点（最大 {max(xs) * 100:.2f}cm）" if xs else "0"
    return fmt(a), fmt(b)


PUSH_OFFSET = 0.008       # web の PUSH_OFFSET_M と同じ
PUSH_SMOOTH_ITERS = 4
PUSH_COVERED_MIN = 0.99   # web の COVERED_MIN と同じ
PUSH_TIP_SEARCH = 0.03    # web の TIP_SEARCH_M と同じ
PUSH_ABOVE = 0.002        # web の LAYER_ABOVE_M と同じ
PUSH_RIM_SMOOTH_ITERS = 3 # web の RIM_SMOOTH_ITERS と同じ


def push_out_e(S, body_P, body_polys, shirt_polys, cover):
    """web の updatePush と同じ計算：体から PUSH_OFFSET 未満の服の頂点を外へ押し出し、なだらかに広げ、
    服で覆われる体の頂点が服の外へ出ていれば、その面の頂点を外へ足し、縁に沿ってならす。押し出した後の形を返す"""
    keys = {}
    weld = np.array([keys.setdefault(tuple(np.round(p, 5)), len(keys)) for p in S])
    count = len(keys)
    nb = [set() for _ in range(count)]
    for poly in shirt_polys:
        ids = [weld[i] for i in poly]
        for k in range(len(ids)):
            a, b = ids[k], ids[(k + 1) % len(ids)]
            if a != b:
                nb[a].add(b); nb[b].add(a)
    nb = [list(x) for x in nb]
    rep = np.zeros(count, dtype=np.int64)
    rep[weld] = np.arange(len(S))
    Pw = S[rep]

    body_bvh = bvh_of(body_P, body_polys)
    disp = np.zeros((count, 3))
    for j in range(count):
        loc, n, _, _ = body_bvh.find_nearest(Vector(Pw[j]), 0.1)
        if loc is None:
            continue
        sd = (Vector(Pw[j]) - loc).dot(n)
        if sd < PUSH_OFFSET:
            disp[j] = np.array(n) * (PUSH_OFFSET - sd)
    for _ in range(PUSH_SMOOTH_ITERS):
        nxt = disp.copy()
        for j in range(count):
            if nb[j]:
                avg = disp[nb[j]].mean(axis=0)
                if np.linalg.norm(avg) > np.linalg.norm(disp[j]):
                    nxt[j] = 0.5 * disp[j] + 0.5 * avg
        disp = nxt

    faces = [[weld[i] for i in poly] for poly in shirt_polys]
    shirt_bvh = bvh_of(Pw + disp, faces)
    extra = np.zeros_like(disp)
    for bp in body_P[cover >= PUSH_COVERED_MIN]:
        loc, n, idx, _ = shirt_bvh.find_nearest(Vector(bp), PUSH_TIP_SEARCH)
        if loc is None:
            continue
        # 一番近い服の点より下にある体（着丈を短くして裾より下に出た所）は比べない
        if loc.z - bp[2] > PUSH_ABOVE:
            continue
        out = (Vector(bp) - loc).dot(n)
        if out <= -PUSH_OFFSET / 2:
            continue
        v = np.array(n) * (out + PUSH_OFFSET / 2)
        for j in faces[idx]:
            if np.linalg.norm(v) > np.linalg.norm(extra[j]):
                extra[j] = v
    disp = disp + extra

    # 縁（面1つにしか使われていない辺）の押し出し量を、縁に沿った両隣とならす
    edge_use = {}
    for f in faces:
        for k in range(len(f)):
            e = tuple(sorted((f[k], f[(k + 1) % len(f)])))
            edge_use[e] = edge_use.get(e, 0) + 1
    rim = [[] for _ in range(count)]
    for (a, b), used in edge_use.items():
        if used == 1:
            rim[a].append(b); rim[b].append(a)
    for _ in range(PUSH_RIM_SMOOTH_ITERS):
        nxt = disp.copy()
        for j in range(count):
            if len(rim[j]) >= 2:
                nxt[j] = 0.5 * disp[j] + 0.5 * disp[rim[j]].mean(axis=0)
        disp = nxt
    return S + disp[weld]


INSIDE_TOL = 0.001          # 着せるための体の面からこれより内側にある服の頂点を「入っている」とする
BUST_GAP_MIN = 0.9          # 胸の下の、服と体の間の空間は、着せるための体で埋めた深さのこの倍以上
BUST_GAP_DEPTH = 0.12       # 胸の下を、乳首の高さからこの深さまで調べる


def check_bust(S, body_P, fit_P, polys, body_polys, nipples):
    """女性の胸まわり。返り値は (谷間に入った服の頂点の数, [(左右, 服と体の間の空間 cm, 埋めた深さ cm)])。
    谷間：乳首の間（|x| < 乳首の |x|）で、乳首の 3cm 下から谷間を埋めた高さまでにある服の頂点のうち、
    着せるための体の内側（本物の体との間の、埋めた所）に入ったもの。
    胸の下：乳首を通る縦の列で、着せるための体が本物の体より一番前に出た高さの、本物の体から服までの前後の距離"""
    z_b, x_n = float(body_P[nipples, 2].mean()), float(np.abs(body_P[nipples, 0]).mean())
    fit_bvh = bvh_of(fit_P, body_polys)
    region = (np.abs(S[:, 0]) < x_n) & (S[:, 2] > z_b - 0.03) & (S[:, 2] < z_b + pf.FIT_BUST_RISE)
    inside = 0
    for p in S[region]:
        loc, n, _, _ = fit_bvh.find_nearest(Vector(p))
        inside += (Vector(p) - loc).dot(n) < -INSIDE_TOL
    zs = np.arange(z_b - BUST_GAP_DEPTH, z_b, pf.FIT_STEP)
    gaps = []
    for side, x in (("左", x_n), ("右", -x_n)):
        xs = np.array([x])
        body_y = pf.front_profile(body_P, body_polys, zs, xs)[:, 0]
        fill = body_y - pf.front_profile(fit_P, body_polys, zs, xs)[:, 0]
        gap = body_y - pf.front_profile(S, polys, zs, xs)[:, 0]
        i = int(np.nanargmax(fill))
        gaps.append((side, float(gap[i]) * 100, float(fill[i]) * 100))
    return int(inside), gaps


def bust_ok(name, inside, gaps):
    ok = inside == 0 and all(g >= BUST_GAP_MIN * f for _, g, f in gaps)
    pt.log(f"  [{name}] 谷間に入った服の頂点 {inside} / 胸の下の空間 " + ", ".join(
        f"{s} {g:.2f}cm（埋めた深さ {f:.2f}cm）" for s, g, f in gaps) + f" {'OK' if ok else 'NG'}")
    return ok


def render_case(name, shirt_P, body_P, shirt, body):
    """ブラウザと同じ形（服は体の外へ押し出した状態）で、正面・斜め・背面を描く"""
    os.makedirs(RENDERS, exist_ok=True)
    tmp = []
    for src, P in ((shirt, shirt_P), (body, body_P)):
        me = src.data.copy()
        ob_tmp = bpy.data.objects.new("tmp", me)
        bpy.context.scene.collection.objects.link(ob_tmp)
        if me.shape_keys:
            ob_tmp.shape_key_clear()
        M = np.array(src.matrix_world.inverted())
        me.vertices.foreach_set("co", (P @ M[:3, :3].T + M[:3, 3]).ravel())
        ob_tmp.matrix_world = src.matrix_world
        me.update()
        tmp.append(ob_tmp)
    for o in (shirt, body):
        o.hide_render = True
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_WORKBENCH"
    except TypeError:
        pass
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.render.resolution_x, sc.render.resolution_y = 1200, 1000
    sc.render.film_transparent = False
    cam_data = bpy.data.cameras.new("verify_cam"); cam_data.type = "ORTHO"; cam_data.ortho_scale = 1.25
    cam = bpy.data.objects.new("verify_cam", cam_data); sc.collection.objects.link(cam)
    sc.camera = cam
    paths = []
    for view, d in VIEWS:
        target = Vector((0, 0, 1.08))
        cam.location = target + Vector(d) * 3
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(RENDERS, f"{name}_{view}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    for o in tmp + [cam]:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(me, bpy.types.Mesh):
            bpy.data.meshes.remove(me)
    bpy.data.cameras.remove(cam_data) if cam_data.users == 0 else None
    for o in (shirt, body):
        o.hide_render = False
    return paths


def main():
    shirt, body = bpy.data.objects[GARMENT], bpy.data.objects["avatar"]
    # 押し出しとめり込みの相手。女性は着せるための体（描かない）
    collider = bpy.data.objects[pf.FIT_NAME] if FEMALE else body
    collider.hide_render = FEMALE
    lm_name = f"{GARMENT}_female_landmarks.json" if FEMALE else f"{GARMENT}_landmarks.json"
    with open(os.path.join(HERE, "out", lm_name), encoding="utf-8") as fp:
        lm = json.load(fp)
    base, corr = load_json(f"{GARMENT}_{GENDER}_base.json"), load_json(f"{GARMENT}_{GENDER}_correction.json")
    height = load_json(f"{GARMENT}_{GENDER}_height.json")
    polys = pt.polys_of(shirt)
    body_polys = pt.polys_of(body)
    cover = np.empty(len(body.data.vertices), dtype=np.float32)
    body.data.attributes["_cover"].data.foreach_get("value", cover)

    ok, _ = check_accuracy(shirt, lm, polys, base, corr, height)

    standard_cm = height["standard_cm"]
    if FEMALE:
        nipples = pf.group_verts(body, "nippleTip")
        pt.log("着せ直したままの服（押し出す前、基準の寸法）")
        for b in pt.BUILDS:
            vals = pt.build_values(b)
            ok &= bust_ok(b, *check_bust(pt.mixed_coords(shirt, vals), pt.mixed_coords(body, vals),
                                         pt.mixed_coords(collider, vals), polys, body_polys, nipples))
    cases = [(name, b, standard_cm, off) for name, b, off in CASES] + HEIGHT_CASES
    for name, b, h_cm, off in cases:
        h = h_cm - standard_cm
        base_b, M = fit_at(b, h_cm, height)
        target = {p: base_b[p] + o for p, o in zip(pt.SIZE_PARTS, off)}
        k = key_values(target, base_b, M)
        S = pt.mixed_coords(shirt, pt.build_values(b, k, h))
        Bd = pt.mixed_coords(body, pt.build_values(b, None, h))
        Cd = pt.mixed_coords(collider, pt.build_values(b, None, h))
        got = pt.measure(S, lm, polys)
        Se = push_out_e(S, Cd, body_polys, polys, cover)
        got_e = pt.measure(Se, lm, polys)
        a, c = penetration(Se, Cd, polys, body_polys, cover)
        pt.log(f"[{name}] キー {', '.join(f'{p} {v:+.2f}' for p, v in k.items())}")
        pt.log(f"  実測 {', '.join(f'{p} {got[p]:.2f}' for p in pt.SIZE_PARTS)}（目標 {', '.join(f'{target[p]:.2f}' for p in pt.SIZE_PARTS)}）")
        pt.log(f"  押し出した後の入力とのずれ {', '.join(f'{p} {got_e[p] - target[p]:+.2f}' for p in pt.SIZE_PARTS)}")
        pt.log(f"  押し出した後、体の内側に入った Tシャツの頂点: {a} / Tシャツから出た体の頂点: {c}")
        if FEMALE:
            ok &= bust_ok("押し出した後", *check_bust(Se, Bd, Cd, polys, body_polys, nipples))
        for path in render_case(name, Se, Bd, shirt, body):
            pt.log("  画像:", path)

    pt.log("合格" if ok else "不合格")
    if bpy.app.background and not ok:
        sys.exit(1)


main()
