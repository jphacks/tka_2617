"""pitari.blendの半袖トップス用UVテンプレートと検査データを作る。

入力：data/mesh_export.json（Blenderでscripts/export_mesh_data.pyを実行して作る）
出力：uv_template.json、masks/*.png、check/*.png、data/inspection_report.json

使い方（リポジトリ直下のPowerShell）：
  ./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/build_template.py
必要なライブラリはnumpyとPillowだけ。推論用の仮想環境に入っているため追加しない。

UV展開図の画像はなぞらない。部位・点・マスクはすべてBlenderの面と面コーナーのUVから作る。
"""

import argparse
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from uv_pixels import uv_to_pixel  # noqa: E402
from warp_support import delaunay, distance_to_boundary, mean_value_weights, point_in_polygon, signed_area, triangle_mask, triangle_signed_areas  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[2]
SIZE = 2048
TEMPLATE_ID = "pitari-short-sleeve-top"
TEMPLATE_VERSION = "0.1.0"
UV_LAYER = "pitari"
SOURCE_BLEND = ROOT / "inputs/tshirt/pitari.blend"
# 輪郭の区間を何cmおきに区切るか。写真側も同じ割合の位置で区切る。
SAMPLE_SPACING_M = 0.03
# 内部点の間隔（テクスチャのピクセル）。輪郭の点の間隔（約50px）と同程度にする。
INTERIOR_SPACING_PX = 48
FONT_JA = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"
FONT_EN = "C:/Windows/Fonts/arialbd.ttf"

PARTS = [
    ("front_body", "前身頃", "front", None),
    ("back_body", "後身頃", "back", None),
    ("sleeve_right_front", "着用者の右袖・前側", "front", "right"),
    ("sleeve_right_back", "着用者の右袖・後ろ側", "back", "right"),
    ("sleeve_left_front", "着用者の左袖・前側", "front", "left"),
    ("sleeve_left_back", "着用者の左袖・後ろ側", "back", "left"),
]
PART_COLORS = {
    "front_body": (86, 156, 214),
    "back_body": (230, 145, 56),
    "sleeve_right_front": (46, 170, 90),
    "sleeve_right_back": (20, 100, 50),
    "sleeve_left_front": (170, 90, 200),
    "sleeve_left_back": (100, 40, 130),
}
SIDE_JA = {"right": "着用者の右", "left": "着用者の左"}


# ---------------------------------------------------------------- メッシュの構造


def edge_key(a, b):
    return (a, b) if a < b else (b, a)


class Topology:
    def __init__(self, data):
        self.V = np.array(data["vertices"], dtype=float)
        self.faces = [f["vertices"] for f in data["faces"]]
        self.face_loops = [f["loops"] for f in data["faces"]]
        self.uv = np.array(data["uv"][UV_LAYER], dtype=float)
        self.edge_faces = defaultdict(list)
        for fi, vs in enumerate(self.faces):
            for k in range(len(vs)):
                self.edge_faces[edge_key(vs[k], vs[(k + 1) % len(vs)])].append(fi)
        self.centers = np.array([self.V[vs].mean(0) for vs in self.faces])
        normals = []
        for vs in self.faces:
            p = self.V[vs]
            n = np.cross(p[2] - p[0], p[3] - p[1]) if len(vs) == 4 else np.cross(p[1] - p[0], p[2] - p[0])
            normals.append(n / (np.linalg.norm(n) + 1e-20))
        self.normals = np.array(normals)

    def corner(self, face, vertex):
        return self.face_loops[face][self.faces[face].index(vertex)]

    def islands(self, uv):
        parent = list(range(len(self.faces)))

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        for (a, b), faces in self.edge_faces.items():
            if len(faces) != 2:
                continue
            f0, f1 = faces
            same = all(np.allclose(uv[self.corner(f0, v)], uv[self.corner(f1, v)], atol=1e-6) for v in (a, b))
            if same:
                parent[find(f0)] = find(f1)
        roots = [find(i) for i in range(len(self.faces))]
        order = sorted(set(roots), key=lambda r: -roots.count(r))
        return np.array([order.index(r) for r in roots])


def chain(edges, closed):
    adjacency = defaultdict(list)
    for a, b in edges:
        adjacency[a].append(b)
        adjacency[b].append(a)
    if any(len(n) > 2 for n in adjacency.values()):
        raise ValueError("辺の並びが枝分かれしている")
    seen, result = set(), []
    starts = [v for v, n in adjacency.items() if len(n) == 1]
    if closed and starts:
        raise ValueError("閉じた輪のはずが端点を持つ")
    for start in starts if not closed else list(adjacency):
        if start in seen:
            continue
        sequence, previous, current = [start], None, start
        seen.add(start)
        while True:
            following = [n for n in adjacency[current] if n != previous and n not in seen]
            if not following:
                break
            previous, current = current, following[0]
            sequence.append(current)
            seen.add(current)
        result.append(sequence)
    return result


# ---------------------------------------------------------------- 面上の点
# 点は(a, b, t)で表す。位置は(1-t)*P[a] + t*P[b]。頂点そのものは(v, v, 0)。


def vertex_point(v):
    return (v, v, 0.0)


def edge_point(a, b, t):
    if t <= 1e-9:
        return vertex_point(a)
    if t >= 1 - 1e-9:
        return vertex_point(b)
    return (a, b, t) if a < b else (b, a, 1.0 - t)


def point_vertices(point):
    a, b, _ = point
    return {a} if a == b else {a, b}


def t_on_edge(point, edge):
    a, b, t = point
    if a == b:
        return 0.0 if a == edge[0] else 1.0
    return t if (a, b) == edge else 1.0 - t


def shared_edge(p, q):
    vertices = point_vertices(p) | point_vertices(q)
    if len(vertices) != 2:
        raise ValueError(f"隣り合う点が同じ辺の上にない: {p} {q}")
    return tuple(sorted(vertices))


class Surface:
    def __init__(self, topology, island_of_face):
        self.t = topology
        self.island_of_face = island_of_face
        self.vertex_corners = defaultdict(list)
        for fi, vs in enumerate(topology.faces):
            for v, loop in zip(vs, topology.face_loops[fi]):
                self.vertex_corners[(v, island_of_face[fi])].append({"face": fi, "loop": loop})

    def position(self, point):
        a, b, t = point
        return (1 - t) * self.t.V[a] + t * self.t.V[b]

    def faces_of_edge(self, edge, island):
        return [f for f in self.t.edge_faces[edge] if self.island_of_face[f] == island]

    def uv(self, point, island):
        a, b, t = point
        if a == b:
            corners = self.vertex_corners.get((a, island))
            if not corners:
                raise ValueError(f"頂点{a}は島{island}にない")
            return self.t.uv[corners[0]["loop"]]
        faces = self.faces_of_edge((a, b), island)
        if not faces:
            raise ValueError(f"辺{(a, b)}は島{island}にない")
        face = min(faces)
        return (1 - t) * self.t.uv[self.t.corner(face, a)] + t * self.t.uv[self.t.corner(face, b)]

    def describe(self, point, island):
        """JSONへ書く面・面コーナーの情報。縫い目では同じ頂点が島ごとに別のUVを持つため、島を指定する。"""
        a, b, t = point
        if a == b:
            return {"type": "vertex", "vertex": a, "corners": self.vertex_corners[(a, island)]}
        face = min(self.faces_of_edge((a, b), island))
        return {
            "type": "edge",
            "vertices": [a, b],
            "t": round(t, 6),
            "face": face,
            "loops": [self.t.corner(face, a), self.t.corner(face, b)],
        }

    def interpolate(self, p, q, s):
        edge = shared_edge(p, q)
        t = (1 - s) * t_on_edge(p, edge) + s * t_on_edge(q, edge)
        return edge_point(edge[0], edge[1], t)


def polyline(vertices):
    return [vertex_point(v) for v in vertices]


def find_on_sequence(sequence, point):
    """頂点列の中で点がある位置。頂点ならその番号、辺上なら(i, i+1)の間を示すi+0.5。"""
    a, b, _ = point
    if a == b:
        return float(sequence.index(a))
    for i in range(len(sequence) - 1):
        if {sequence[i], sequence[i + 1]} == {a, b}:
            return i + 0.5
    raise ValueError(f"点{point}は列にない")


def sub_path(sequence, start, end):
    """開いた頂点列から、startとendの間の部分を点の列として取り出す。"""
    i, j = find_on_sequence(sequence, start), find_on_sequence(sequence, end)
    reverse = i > j
    if reverse:
        sequence = sequence[::-1]
        i, j = len(sequence) - 1 - i, len(sequence) - 1 - j
    inner = [vertex_point(v) for k, v in enumerate(sequence) if i < k < j]
    return [start] + inner + [end]


def cycle_arcs(cycle, start, end):
    """閉じた輪の上で、startからendへ向かう2通りの経路を返す。"""
    n = len(cycle)
    end_vertices = point_vertices(end)
    arcs = []
    for ordered in (list(cycle), list(cycle[::-1])):
        position = find_on_sequence(ordered + [ordered[0]], start)
        # 頂点からでも辺上からでも、次の頂点から歩き出す。
        index = int(math.floor(position)) + 1
        current = start[0] if start[0] == start[1] else None
        path = [start]
        for _ in range(n + 1):
            v = ordered[index % n]
            if len(end_vertices) == 2 and current is not None and {current, v} == end_vertices:
                path.append(end)
                break
            path.append(vertex_point(v))
            if end_vertices == {v}:
                break
            current = v
            index += 1
        else:
            raise ValueError("輪の上で終点に届かない")
        arcs.append(path)
    return arcs


def arc_in_island(surface, cycle, start, end, island):
    best = None
    for path in cycle_arcs(cycle, start, end):
        edges = [shared_edge(path[k], path[k + 1]) for k in range(len(path) - 1)]
        inside = [bool(surface.faces_of_edge(e, island)) for e in edges]
        score = sum(inside) / len(inside)
        if best is None or score > best[0]:
            best = (score, path)
    if best[0] < 0.9:
        raise ValueError("島に沿う経路が見つからない")
    return best[1]


def lengths(surface, path):
    positions = np.array([surface.position(p) for p in path])
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(positions, axis=0), axis=1))])


def point_at_fraction(surface, path, fraction):
    cumulative = lengths(surface, path)
    target = fraction * cumulative[-1]
    k = int(np.clip(np.searchsorted(cumulative, target) - 1, 0, len(path) - 2))
    span = cumulative[k + 1] - cumulative[k]
    s = 0.0 if span == 0 else (target - cumulative[k]) / span
    return k, surface.interpolate(path[k], path[k + 1], s)


def point_at_chord_fraction(surface, path, fraction):
    """始点と終点を結ぶ直線へ投影した割合で位置を決める。脇のジグザグで長さが伸びる影響を避ける。"""
    positions = np.array([surface.position(p) for p in path])
    chord = positions[-1] - positions[0]
    s = (positions - positions[0]) @ chord / (chord @ chord)
    for k in range(len(path) - 1):
        if (s[k] - fraction) * (s[k + 1] - fraction) <= 0 and s[k] != s[k + 1]:
            return k, surface.interpolate(path[k], path[k + 1], (fraction - s[k]) / (s[k + 1] - s[k]))
    raise ValueError("割合の位置が見つからない")


def point_at_x(surface, path, x):
    positions = np.array([surface.position(p) for p in path])
    for k in range(len(path) - 1):
        a, b = positions[k][0] - x, positions[k + 1][0] - x
        if a * b <= 0 and a != b:
            return k, surface.interpolate(path[k], path[k + 1], a / (a - b))
    raise ValueError("正中面と交わらない")


def split_path(path, k, point):
    first = path[: k + 1] + ([point] if point != path[k] else [])
    second = ([point] if point != path[k + 1] else []) + path[k + 1:]
    return first, second


# ---------------------------------------------------------------- ラスタライズ


def split_quad(points):
    """四角形を2つの三角形に分ける。凹んだ四角形では凹んだ頂点を通る対角線を使う。"""
    if len(points) == 3:
        return [points]
    orientation = np.sign(signed_area(points)) or 1.0
    for k in range(4):
        a, b, c = points[k - 1], points[k], points[(k + 1) % 4]
        if orientation * ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 0:
            return [points[[k, (k + 1) % 4, (k + 2) % 4]], points[[k, (k + 2) % 4, (k + 3) % 4]]]
    return [points[[0, 1, 2]], points[[0, 2, 3]]]


def polygon_pixel_mask(points, size):
    """多角形（ピクセル座標）の内側にある画素中心のマスクを、外接矩形の範囲で返す。"""
    x0 = max(int(math.floor(points[:, 0].min() - 0.5)), 0)
    x1 = min(int(math.ceil(points[:, 0].max() - 0.5)), size - 1)
    y0 = max(int(math.floor(points[:, 1].min() - 0.5)), 0)
    y1 = min(int(math.ceil(points[:, 1].max() - 0.5)), size - 1)
    if x1 < x0 or y1 < y0:
        return None
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    inside = np.zeros(xs.shape, bool)
    for triangle in split_quad(points):
        inside |= triangle_mask(triangle, xs, ys)
    return (slice(y0, y1 + 1), slice(x0, x1 + 1)), inside


def rasterize_faces(polygons, size):
    """面番号+1の画像（0は面なし）と、各画素中心を含む面の数を返す。辺上の画素は番号の小さい面に入れる。"""
    face_id = np.zeros((size, size), np.int32)
    count = np.zeros((size, size), np.uint8)
    for index, points in enumerate(polygons):
        result = polygon_pixel_mask(points, size)
        if result is None:
            continue
        window, inside = result
        count[window] += inside.astype(np.uint8)
        region = face_id[window]
        region[inside & (region == 0)] = index + 1
    return face_id, count


def clip_convex(subject, clipper):
    """凸多角形同士の共通部分（Sutherland–Hodgman）。どちらも反時計回り。"""
    output = list(subject)
    for k in range(len(clipper)):
        a, b = clipper[k - 1], clipper[k]
        current, output = output, []
        if not current:
            break
        for m in range(len(current)):
            p, q = current[m - 1], current[m]
            side_p = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
            side_q = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])
            if side_q >= 0:
                if side_p < 0:
                    output.append(p + (q - p) * side_p / (side_p - side_q))
                output.append(q)
            elif side_p >= 0:
                output.append(p + (q - p) * side_p / (side_p - side_q))
    return np.array(output) if len(output) >= 3 else None


def overlap_area(first, second):
    total = 0.0
    for a in split_quad(first):
        a = a if signed_area(a) > 0 else a[::-1]
        for b in split_quad(second):
            b = b if signed_area(b) > 0 else b[::-1]
            clipped = clip_convex(a, b)
            if clipped is not None:
                total += abs(signed_area(clipped))
    return total


# ---------------------------------------------------------------- 三角形分割


def triangulate_part(boundary):
    """輪郭（UV×SIZE、反時計回り）と内部の格子点をDelaunay分割し、部位の外の三角形を除く。

    戻り値：内部点の座標、三角形（輪郭の点が0..n-1、内部点がn..）
    """
    h = INTERIOR_SPACING_PX
    low, high = boundary.min(axis=0), boundary.max(axis=0)
    candidates = []
    for k, y in enumerate(np.arange(low[1] + h / 2, high[1], h * math.sqrt(3) / 2)):
        offset = h / 2 if k % 2 else 0.0
        for x in np.arange(low[0] + offset, high[0], h):
            candidates.append((x, y))
    candidates = np.array(candidates)
    keep = point_in_polygon(boundary, candidates) & (distance_to_boundary(boundary, candidates) >= 0.6 * h)
    interior = candidates[keep]
    # 同一円周上の点で分割が不定にならないよう、決まった小さなずらしを加える。
    interior = interior + np.random.default_rng(0).uniform(-0.01, 0.01, interior.shape)
    points = np.vstack([boundary, interior])
    triangles = delaunay(points)
    centroids = points[np.array(triangles)].mean(axis=1)
    triangles = [t for t, inside in zip(triangles, point_in_polygon(boundary, centroids)) if inside]
    n = len(boundary)
    edges = {tuple(sorted(e)) for a, b, c in triangles for e in ((a, b), (b, c), (c, a))}
    missing = [(k, (k + 1) % n) for k in range(n) if tuple(sorted((k, (k + 1) % n))) not in edges]
    areas = triangle_signed_areas(points, triangles)
    polygon_area = signed_area(boundary)
    if missing or (areas <= 0).any() or abs(areas.sum() - polygon_area) > 1e-6 * polygon_area:
        raise SystemExit(f"三角形分割が輪郭に沿わない（欠けた輪郭の辺{len(missing)}本）")
    return interior, triangles


def deformation_test(boundary, interior, triangles):
    """合成の変形（回転・縦横の伸縮・波打ち）を輪郭に加え、内部点を平均値座標で求めたとき裏返る三角形を数える。
    実写の検証ではない。接続関係が中程度の変形で破綻しないことだけを見る。"""
    weights = mean_value_weights(boundary, interior)
    reproduction = float(np.abs(weights @ boundary - interior).max()) if len(interior) else 0.0
    center = boundary.mean(axis=0)
    size = (boundary.max(axis=0) - boundary.min(axis=0)).max()
    angle = math.radians(10)
    rotation = np.array([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]]) @ np.diag([1.1, 0.9])

    def deform(p):
        q = (p - center) @ rotation.T
        wave = 0.03 * size * np.stack([np.sin(2 * math.pi * q[:, 1] / size), np.sin(2 * math.pi * q[:, 0] / size)], axis=1)
        return q + wave

    moved_boundary = deform(boundary)
    moved = np.vstack([moved_boundary, weights @ moved_boundary])
    flipped = int((triangle_signed_areas(moved, triangles) <= 0).sum())
    return {"mvc_reproduction_error_px": reproduction, "flipped_triangles_under_synthetic_deformation": flipped}


def segments_intersect(p1, p2, p3, p4):
    def orient(a, b, c):
        return np.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))

    return orient(p1, p2, p3) * orient(p1, p2, p4) < 0 and orient(p3, p4, p1) * orient(p3, p4, p2) < 0


def is_simple(points):
    n = len(points)
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            if segments_intersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n]):
                return False
    return True


def smooth(values, window=5):
    """端点を固定した移動平均。脇の階段状の境界をならす。"""
    if len(values) <= 2:
        return values.copy()
    half = window // 2
    result = values.copy()
    for k in range(1, len(values) - 1):
        lo, hi = max(0, k - half), min(len(values), k + half + 1)
        result[k] = values[lo:hi].mean(0)
    return result


# ---------------------------------------------------------------- 画像


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def save_mask(mask, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L").save(path)


def dilate(mask, radius):
    result = mask.copy()
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            shifted = np.zeros_like(mask)
            ys = slice(max(dy, 0), mask.shape[0] + min(dy, 0))
            xs = slice(max(dx, 0), mask.shape[1] + min(dx, 0))
            yt = slice(max(-dy, 0), mask.shape[0] + min(-dy, 0))
            xt = slice(max(-dx, 0), mask.shape[1] + min(-dx, 0))
            shifted[ys, xs] = mask[yt, xt]
            result |= shifted
    return result


def pad_colors(rgb, mask, radius):
    """マスクの外側radius画素まで隣の色を広げる。島の縁で背景色を拾い、継ぎ目に暗い点が出るのを防ぐ。"""
    rgb, filled = rgb.copy(), mask.copy()
    for _ in range(radius):
        grown, result = filled.copy(), rgb.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            take = np.roll(filled, (dy, dx), axis=(0, 1)) & ~grown
            result[take] = np.roll(rgb, (dy, dx), axis=(0, 1))[take]
            grown |= take
        rgb, filled = result, grown
    return rgb


def face_stretch(topology):
    """面ごとの、3D（m）からテクスチャ（px）への伸び。密度は特異値の幾何平均、縦横比は特異値の比。"""
    density, anisotropy = [], []
    for vs, loops in zip(topology.faces, topology.face_loops):
        p = topology.V[vs]
        q = topology.uv[loops] * SIZE
        values = []
        for a, b, c in ((0, 1, 2), (0, 2, 3)) if len(vs) == 4 else ((0, 1, 2),):
            e1, e2 = p[b] - p[a], p[c] - p[a]
            x = e1 / np.linalg.norm(e1)
            y = np.cross(np.cross(e1, e2), x)
            y /= np.linalg.norm(y)
            local = np.array([[e1 @ x, e2 @ x], [e1 @ y, e2 @ y]])
            jacobian = np.column_stack([q[b] - q[a], q[c] - q[a]]) @ np.linalg.inv(local)
            values.append(np.linalg.svd(jacobian, compute_uv=False))
        values = np.array(values)
        density.append(float(np.sqrt(values[:, 0] * values[:, 1]).mean()))
        anisotropy.append(float((values[:, 0] / values[:, 1]).max()))
    return np.array(density), np.array(anisotropy)


def boundary_of(mask):
    inner = mask.copy()
    inner[1:, :] &= mask[:-1, :]
    inner[:-1, :] &= mask[1:, :]
    inner[:, 1:] &= mask[:, :-1]
    inner[:, :-1] &= mask[:, 1:]
    return mask & ~inner


# ---------------------------------------------------------------- 本体


def main():
    global ROOT, TEMPLATE_ID, SOURCE_BLEND
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", choices=["short_sleeve_top", "long_sleeve_top"], default="short_sleeve_top")
    args = parser.parse_args()
    if args.category == "long_sleeve_top":
        SOURCE_BLEND = ROOT / "inputs/longsleeve/pitari_longsleeve.blend"
        ROOT = ROOT / "longsleeve"
        TEMPLATE_ID = "pitari-long-sleeve-top"
    (ROOT / "check").mkdir(parents=True, exist_ok=True)
    data = json.loads((ROOT / "data/mesh_export.json").read_text(encoding="utf-8"))
    topology = Topology(data)
    V, faces = topology.V, topology.faces
    face_count = len(faces)

    # 着用者の向き：人体のLeftグループが+X側なら、上(+Z)と合わせて前は-Y。
    orientation = data["body_orientation"]
    left_sign = 1.0 if orientation["left_group_mean_x"] > 0 else -1.0
    forward = np.cross([left_sign, 0, 0], [0, 0, 1])
    center_x = (orientation["left_group_mean_x"] + orientation["right_group_mean_x"]) / 2

    def side_of(x):
        return "left" if (x - center_x) * left_sign > 0 else "right"

    # 島：pitariのUVで2つ。法線の平均が前を向く方を前面とする。
    pitari = topology.islands(topology.uv)
    if args.category == "long_sleeve_top":
        # 受領UVは前後2領域と背面の袖の小島3つ。元のUVを保ち、写真の前後だけをまとめる。
        bounds = [topology.uv[loops, 1] for loops in topology.face_loops]
        if any(values.min() < 0.5 < values.max() for values in bounds):
            raise SystemExit("長そでのUVが前後の領域をまたいでいます")
        pitari = np.array([0 if values.mean() > 0.5 else 1 for values in bounds])
    if pitari.max() != 1:
        raise SystemExit(f"pitariのUV島が2つではない（{pitari.max() + 1}個）。テンプレートを作り直す必要がある")
    facing = [float((topology.normals[pitari == k] @ forward).mean()) for k in (0, 1)]
    front_island = int(np.argmax(facing))
    island_name = {front_island: "front", 1 - front_island: "back"}
    view_island = {"front": front_island, "back": 1 - front_island}

    # 袖と身頃の境界：元のUVMapでは袖が別の島になっている。袖付けの線として使う。
    if "sleeve_vertices" in data:
        # 長そでには元のUVMapがないため、受領した袖の頂点集合で袖付けを決める。
        sleeves = [set(data["sleeve_vertices"][side]) for side in ("right", "left")]
        original = np.array([next((i + 1 for i, vertices in enumerate(sleeves) if set(face) <= vertices), 0) for face in faces])
    else:
        original = topology.islands(np.array(data["uv"]["UVMap"], dtype=float))
    original_count = original.max() + 1
    mean_x = [topology.centers[original == k, 0].mean() for k in range(original_count)]
    sleeve_islands = sorted(range(original_count), key=lambda k: -abs(mean_x[k] - center_x))[:2]
    is_sleeve = np.isin(original, sleeve_islands)
    sleeve_side = {k: side_of(mean_x[k]) for k in sleeve_islands}

    part_of_face = []
    for fi in range(face_count):
        view = island_name[pitari[fi]]
        if is_sleeve[fi]:
            part_of_face.append(f"sleeve_{sleeve_side[original[fi]]}_{view}")
        else:
            part_of_face.append(f"{view}_body")
    part_of_face = np.array(part_of_face)
    part_names = [p[0] for p in PARTS]
    unassigned = [fi for fi in range(face_count) if part_of_face[fi] not in part_names]

    # 元のUVMapでは前身頃だった面のうち、pitariで背面の島に入った帯（脇）。
    original_front_body = max((k for k in range(original_count) if k not in sleeve_islands), key=lambda k: (topology.normals[original == k] @ forward).mean())
    side_wrap = [fi for fi in range(face_count) if original[fi] == original_front_body and island_name[pitari[fi]] == "back"]
    if args.category == "long_sleeve_top":
        side_wrap = []

    surface = Surface(topology, pitari)

    # ---- 境界：メッシュの穴、前後の切れ目、袖付け
    boundary_edges = [e for e, f in topology.edge_faces.items() if len(f) == 1]
    seam_edges = [e for e, f in topology.edge_faces.items() if len(f) == 2 and pitari[f[0]] != pitari[f[1]]]
    armhole_edges = [e for e, f in topology.edge_faces.items() if len(f) == 2 and is_sleeve[f[0]] != is_sleeve[f[1]]]
    holes = chain(boundary_edges, closed=True)
    if len(holes) != 4:
        raise SystemExit(f"穴が4つ（襟ぐり・裾・両袖口）ではない: {len(holes)}")
    hole_center = [V[h].mean(0) for h in holes]
    by_abs_x = sorted(range(4), key=lambda k: -abs(hole_center[k][0] - center_x))
    cuffs = {side_of(hole_center[k][0]): holes[k] for k in by_abs_x[:2]}
    rest = sorted(by_abs_x[2:], key=lambda k: hole_center[k][2])
    hem, neck = holes[rest[0]], holes[rest[1]]
    hole_of_vertex = {}
    for name, hole in [("hem", hem), ("neck", neck), ("cuff_right", cuffs["right"]), ("cuff_left", cuffs["left"])]:
        for v in hole:
            hole_of_vertex[v] = name

    seams = {}
    for path in chain(seam_edges, closed=False):
        ends = {hole_of_vertex.get(path[0]), hole_of_vertex.get(path[-1])}
        side = side_of(V[path].mean(0)[0])
        if ends == {"neck", f"cuff_{side}"}:
            seams[f"top_{side}"] = path if hole_of_vertex[path[0]] == "neck" else path[::-1]
        elif ends == {"hem", f"cuff_{side}"}:
            seams[f"bottom_{side}"] = path if hole_of_vertex[path[0]] == "hem" else path[::-1]
        else:
            raise SystemExit(f"想定外の前後の切れ目: {ends}")
    armholes = {side_of(V[c].mean(0)[0]): c for c in chain(armhole_edges, closed=True)}
    if set(seams) != {"top_right", "top_left", "bottom_right", "bottom_left"} or set(armholes) != {"right", "left"}:
        raise SystemExit("前後の切れ目・袖付けの線が左右2本ずつそろわない")

    def crossing(path, cycle):
        """切れ目の列と袖付けの輪が交わる位置。1辺ぶん重なる場合はその辺の中点。"""
        members = [k for k, v in enumerate(path) if v in set(cycle)]
        if not members or members[-1] - members[0] != len(members) - 1:
            raise SystemExit("切れ目と袖付けの交点が1か所にまとまらない")
        if len(members) == 1:
            return vertex_point(path[members[0]]), "頂点で交わる"
        if len(members) == 2:
            return edge_point(path[members[0]], path[members[1]], 0.5), "切れ目と袖付けが1辺ぶん重なるため、その辺の中点"
        middle = members[len(members) // 2]
        return vertex_point(path[middle]), f"{len(members)}頂点ぶん重なるため中央の頂点"

    # ---- 固定点（anchors）
    anchors = {}

    def add(name, point, label, side, status, definition, note=None):
        anchors[name] = {"point": point, "label_ja": label, "wearer_side": side, "status": status, "definition": definition, "notes": [note] if note else []}

    for side in ("right", "left"):
        top, bottom = seams[f"top_{side}"], seams[f"bottom_{side}"]
        ja = SIDE_JA[side]
        add(f"neck_side_{side}", vertex_point(top[0]), f"{ja}の襟ぐりと肩線の交点", side, "definite", "前後の切れ目（肩側）と襟ぐりの穴の交点")
        add(f"cuff_top_{side}", vertex_point(top[-1]), f"{ja}袖口の上側の角", side, "definite", "前後の切れ目（袖山側）と袖口の穴の交点")
        shoulder, how = crossing(top, armholes[side])
        add(f"shoulder_{side}", shoulder, f"{ja}の肩先", side, "definite", "前後の切れ目（肩側）と袖付けの線の交点", how)
        add(f"hem_side_{side}", vertex_point(bottom[0]), f"{ja}の裾の角", side, "definite", "前後の切れ目（脇側）と裾の穴の交点")
        add(f"cuff_bottom_{side}", vertex_point(bottom[-1]), f"{ja}袖口の下側の角", side, "definite", "前後の切れ目（袖下側）と袖口の穴の交点")
        armpit, how = crossing(bottom, armholes[side])
        add(f"armpit_{side}", armpit, f"{ja}の脇（袖下と脇線の交点）", side, "definite", "前後の切れ目（脇側）と袖付けの線の交点", how)

    # ---- 区間：島ごとに、固定点の間を境界に沿ってたどる
    segment_paths = {}
    for side in ("right", "left"):
        top, bottom = seams[f"top_{side}"], seams[f"bottom_{side}"]
        a = {k: anchors[f"{k}_{side}"]["point"] for k in ("neck_side", "shoulder", "cuff_top", "cuff_bottom", "armpit", "hem_side")}
        segment_paths[f"shoulder_seam_{side}"] = sub_path(top, a["neck_side"], a["shoulder"])
        segment_paths[f"sleeve_top_{side}"] = sub_path(top, a["shoulder"], a["cuff_top"])
        segment_paths[f"sleeve_under_{side}"] = sub_path(bottom, a["cuff_bottom"], a["armpit"])
        segment_paths[f"side_{side}"] = sub_path(bottom, a["armpit"], a["hem_side"])
        for view, island in view_island.items():
            segment_paths[f"cuff_{side}_{view}"] = arc_in_island(surface, cuffs[side], a["cuff_top"], a["cuff_bottom"], island)
            segment_paths[f"armhole_{side}_{view}"] = arc_in_island(surface, armholes[side], a["shoulder"], a["armpit"], island)

    for view, island in view_island.items():
        neck_arc = arc_in_island(surface, neck, anchors["neck_side_right"]["point"], anchors["neck_side_left"]["point"], island)
        k, center = point_at_x(surface, neck_arc, center_x)
        segment_paths[f"neckline_right_{view}"], segment_paths[f"neckline_left_{view}"] = split_path(neck_arc, k, center)
        add(f"{view}_neck_center", center, "前襟ぐりの中心" if view == "front" else "後ろ襟ぐりの中心", None, "definite", f"{'前' if view == 'front' else '後ろ'}側の襟ぐりの穴と正中面（x={center_x:.4f}）の交点")
        hem_arc = arc_in_island(surface, hem, anchors["hem_side_right"]["point"], anchors["hem_side_left"]["point"], island)
        k, center = point_at_x(surface, hem_arc, center_x)
        segment_paths[f"hem_right_{view}"], segment_paths[f"hem_left_{view}"] = split_path(hem_arc, k, center)
        add(f"hem_center_{view}", center, f"{'前' if view == 'front' else '後ろ'}側の裾の中心", None, "definite", f"{'前' if view == 'front' else '後ろ'}側の裾の穴と正中面の交点")

    # 位置の定義が公式にない点。公式図の描画位置からの目安で置き、確定扱いにしない。
    for side in ("right", "left"):
        ja = SIDE_JA[side]
        _, point = point_at_fraction(surface, segment_paths[f"neckline_{side}_front"], 0.5)
        add(f"front_neck_mid_{side}", point, f"{ja}の前襟ぐりの途中", side, "approximate", "前襟ぐりの、肩線との交点から中心までの3D弧長の50%。DeepFashion2の図で3・5はこのあたりに描かれているが、位置の定義はない")
        _, point = point_at_chord_fraction(surface, segment_paths[f"sleeve_top_{side}"], 0.5)
        add(f"sleeve_top_mid_{side}", point, f"{ja}袖山の途中", side, "approximate", "肩先から袖口上側の角までを結ぶ直線へ投影した50%の位置。8・24の目安")
        _, point = point_at_chord_fraction(surface, segment_paths[f"sleeve_under_{side}"], 0.5)
        add(f"sleeve_under_mid_{side}", point, f"{ja}袖下の途中", side, "approximate", "袖口下側の角から脇までの直線へ投影した50%の位置。11・21の目安")
        _, point = point_at_chord_fraction(surface, segment_paths[f"side_{side}"], 0.235)
        add(f"side_upper_{side}", point, f"{ja}脇線の上部", side, "approximate", "脇から裾の角までの直線へ投影した23.5%の位置。公式図で13・19が描かれた位置の比率")
        _, point = point_at_chord_fraction(surface, segment_paths[f"side_{side}"], 0.58)
        add(f"side_mid_{side}", point, f"{ja}脇線の中ほど", side, "approximate", "脇から裾の角までの直線へ投影した58%の位置。公式図で14・18が描かれた位置の比率")
        for view in ("front", "back"):
            path = segment_paths[f"armhole_{side}_{view}"]
            k, point = point_at_fraction(surface, path, 0.5)
            segment_paths[f"armhole_{side}_{view}_upper"], segment_paths[f"armhole_{side}_{view}_lower"] = split_path(path, k, point)
            add(
                f"aux_armhole_mid_{side}_{view}",
                point,
                f"{ja}袖付けの中点（{'前' if view == 'front' else '後ろ'}側）",
                side,
                "auxiliary",
                "袖付けの線の、肩先から脇までの3D弧長の50%。DeepFashion2にない補助点",
            )

    # ---- 各点のUV（島ごと）と3D位置
    def anchor_record(name, entry):
        point = entry["point"]
        record = {
            "label_ja": entry["label_ja"],
            "wearer_side": entry["wearer_side"],
            "status": entry["status"],
            "definition": entry["definition"],
            "position_3d": [round(float(c), 6) for c in surface.position(point)],
            "uv_by_view": {},
        }
        for view, island in view_island.items():
            try:
                uv = surface.uv(point, island)
            except ValueError:
                continue
            record["uv_by_view"][view] = {
                "uv": [round(float(c), 6) for c in uv],
                "pixel": [round(float(c), 3) for c in uv_to_pixel(uv, SIZE, SIZE)],
                "surface": surface.describe(point, island),
            }
        if entry["notes"]:
            record["notes"] = entry["notes"]
        return record

    anchor_json = {name: anchor_record(name, entry) for name, entry in anchors.items()}

    # ---- 視点ごとの区間・点・三角形
    view_segments = {}
    for view in ("front", "back"):
        other = "back" if view == "front" else "front"
        segments = []

        def segment(name, path_name, start, end, photo_method, part_names_):
            path = segment_paths[path_name]
            # 経路の向きをstart→endにそろえる。
            if anchors[start]["point"] == path[-1] or anchors[end]["point"] == path[0]:
                path = path[::-1]
            if anchors[start]["point"] != path[0] or anchors[end]["point"] != path[-1]:
                raise SystemExit(f"区間{name}の端点が固定点と一致しない")
            segments.append({"name": name, "path": path, "start": start, "end": end, "photo_method": photo_method, "parts": part_names_})

        for side in ("right", "left"):
            body, sleeve = f"{view}_body", f"sleeve_{side}_{view}"
            segment(f"shoulder_seam_{side}", f"shoulder_seam_{side}", f"neck_side_{side}", f"shoulder_{side}", "contour", [body])
            segment(f"armhole_{side}_upper", f"armhole_{side}_{view}_upper", f"shoulder_{side}", f"aux_armhole_mid_{side}_{view}", "armhole_curve", [body, sleeve])
            segment(f"armhole_{side}_lower", f"armhole_{side}_{view}_lower", f"aux_armhole_mid_{side}_{view}", f"armpit_{side}", "armhole_curve", [body, sleeve])
            segment(f"side_{side}", f"side_{side}", f"armpit_{side}", f"hem_side_{side}", "contour", [body])
            segment(f"hem_{side}", f"hem_{side}_{view}", f"hem_side_{side}", f"hem_center_{view}", "contour", [body])
            segment(f"sleeve_top_{side}", f"sleeve_top_{side}", f"shoulder_{side}", f"cuff_top_{side}", "contour", [sleeve])
            segment(f"cuff_{side}", f"cuff_{side}_{view}", f"cuff_top_{side}", f"cuff_bottom_{side}", "contour", [sleeve])
            segment(f"sleeve_under_{side}", f"sleeve_under_{side}", f"cuff_bottom_{side}", f"armpit_{side}", "contour", [sleeve])
            neck_method = "neckline_curve" if view == "front" else "contour"
            segment(f"neckline_{side}", f"neckline_{side}_{view}", f"neck_side_{side}", f"{view}_neck_center", neck_method, [body])
        view_segments[view] = segments

    views = {}
    point_tables = {}
    for view in ("front", "back"):
        island = view_island[view]
        points = {}
        segments_json = []
        for seg in view_segments[view]:
            path = seg["path"]
            p3 = np.array([surface.position(p) for p in path])
            puv = np.array([surface.uv(p, island) for p in path])
            s3, suv = smooth(p3), smooth(puv)
            cumulative = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(s3, axis=0), axis=1))])
            cumulative_uv = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(suv, axis=0), axis=1))])
            length = float(cumulative[-1])
            count = max(1, int(round(length / SAMPLE_SPACING_M)))
            samples = []
            for k in range(1, count + 1):
                fraction = k / (count + 1)
                target = fraction * length
                j = int(np.clip(np.searchsorted(cumulative, target) - 1, 0, len(path) - 2))
                span = cumulative[j + 1] - cumulative[j]
                s = 0.0 if span == 0 else (target - cumulative[j]) / span
                uv = (1 - s) * suv[j] + s * suv[j + 1]
                # 同じ点の、UV上の長さでの割合。UV画像から作った合成写真の検査に使う。
                fraction_uv = ((1 - s) * cumulative_uv[j] + s * cumulative_uv[j + 1]) / cumulative_uv[-1]
                name = f"{seg['name']}#{k}"
                points[name] = {"uv": uv, "segment": seg["name"], "fraction": fraction, "fraction_uv": fraction_uv, "kind": "sample"}
                samples.append(name)
            for anchor in (seg["start"], seg["end"]):
                points.setdefault(anchor, {"uv": np.array(anchor_json[anchor]["uv_by_view"][view]["uv"]), "kind": "anchor"})
            seg["samples"] = samples
            segments_json.append(
                {
                    "name": seg["name"],
                    "start": seg["start"],
                    "end": seg["end"],
                    "photo_method": seg["photo_method"],
                    "parts": seg["parts"],
                    "length_3d_m": round(length, 4),
                    "samples": [{"name": n, "fraction": round(points[n]["fraction"], 6), "fraction_uv": round(points[n]["fraction_uv"], 6)} for n in samples],
                    "uv_polyline": [[round(float(u), 6), round(float(v), 6)] for u, v in puv],
                }
            )
        point_tables[view] = points
        views[view] = {"segments": segments_json, "segment_objects": view_segments[view]}

    # 部位の多角形：区間を順につなぐ
    def chain_segments(view, order):
        segs = {s["name"]: s for s in view_segments[view]}
        names = []
        for seg_name, reverse in order:
            seg = segs[seg_name]
            sequence = [seg["start"]] + seg["samples"] + [seg["end"]]
            if reverse:
                sequence = sequence[::-1]
            if names and names[-1] == sequence[0]:
                sequence = sequence[1:]
            names.extend(sequence)
        if names[0] == names[-1]:
            names = names[:-1]
        return names

    part_polygons = {}
    for view in ("front", "back"):
        part_polygons[f"{view}_body"] = (view, chain_segments(view, [
            ("shoulder_seam_right", False), ("armhole_right_upper", False), ("armhole_right_lower", False), ("side_right", False), ("hem_right", False),
            ("hem_left", True), ("side_left", True), ("armhole_left_lower", True), ("armhole_left_upper", True), ("shoulder_seam_left", True),
            ("neckline_left", False), ("neckline_right", True),
        ]))
        for side in ("right", "left"):
            part_polygons[f"sleeve_{side}_{view}"] = (view, chain_segments(view, [
                ("sleeve_top_" + side, False), ("cuff_" + side, False), ("sleeve_under_" + side, False),
                (f"armhole_{side}_lower", True), (f"armhole_{side}_upper", True),
            ]))

    # ---- マスク
    uv_polygons = [uv_to_pixel(topology.uv[topology.face_loops[fi]], SIZE, SIZE) for fi in range(face_count)]
    face_id, count = rasterize_faces(uv_polygons, SIZE)
    all_mask = face_id > 0
    texels_per_face = np.bincount(face_id.ravel(), minlength=face_count + 1)[1:]
    part_index = {name: k + 1 for k, name in enumerate(part_names)}
    part_lookup = np.zeros(face_count + 1, np.uint8)
    for fi in range(face_count):
        part_lookup[fi + 1] = part_index[part_of_face[fi]]
    part_id = part_lookup[face_id]
    masks_dir = ROOT / "masks"
    masks_dir.mkdir(exist_ok=True)
    save_mask(all_mask, masks_dir / "all_uv.png")
    save_mask(dilate(all_mask, 8), masks_dir / "all_uv_pad8.png")
    for name in part_names:
        save_mask(part_id == part_index[name], masks_dir / f"part_{name}.png")
    for view, island in view_island.items():
        save_mask(np.isin(face_id - 1, np.flatnonzero(pitari == island)) & all_mask, masks_dir / f"island_{view}.png")
    Image.fromarray(part_id, "L").save(masks_dir / "part_id.png")
    Image.fromarray(face_id.astype(np.uint16)).save(masks_dir / "face_id_plus1.png")

    # ---- 検査
    uv_areas = np.array([signed_area(topology.uv[topology.face_loops[fi]]) for fi in range(face_count)])
    pixel_areas = np.abs(uv_areas) * SIZE * SIZE
    outward = topology.normals @ forward
    expected_sign = {front_island: 1.0, 1 - front_island: -1.0}
    facing_ok = np.array([outward[fi] * expected_sign[pitari[fi]] > 0 for fi in range(face_count)])
    island_orientation = {island_name[k]: {"positive": int(np.sum((pitari == k) & (uv_areas > 0))), "negative": int(np.sum((pitari == k) & (uv_areas < 0)))} for k in (0, 1)}
    nonconvex = []
    for fi in range(face_count):
        pts = topology.uv[topology.face_loops[fi]]
        crosses = [np.cross(pts[(k + 1) % 4] - pts[k], pts[(k + 2) % 4] - pts[(k + 1) % 4]) for k in range(4)]
        if not (all(c > 0 for c in crosses) or all(c < 0 for c in crosses)):
            nonconvex.append(fi)

    # 自己重複：外接矩形が重なる面の組だけ、正確な共通面積を求める。
    boxes = np.array([[p[:, 0].min(), p[:, 1].min(), p[:, 0].max(), p[:, 1].max()] for p in uv_polygons])
    cell = 16
    grid = defaultdict(list)
    for fi, (x0, y0, x1, y1) in enumerate(boxes):
        for gx in range(int(x0 // cell), int(x1 // cell) + 1):
            for gy in range(int(y0 // cell), int(y1 // cell) + 1):
                grid[(gx, gy)].append(fi)
    overlaps = {}
    for members in grid.values():
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                a, b = members[i], members[j]
                if (a, b) in overlaps or boxes[a][0] >= boxes[b][2] or boxes[b][0] >= boxes[a][2] or boxes[a][1] >= boxes[b][3] or boxes[b][1] >= boxes[a][3]:
                    continue
                overlaps[(a, b)] = overlap_area(uv_polygons[a], uv_polygons[b])
    self_overlaps = {k: v for k, v in overlaps.items() if v > 0.01}

    # 同じ材質を使う別オブジェクトとの重複
    sharer_reports = []
    for sharer in data["material_sharers"]:
        polygons = [uv_to_pixel(np.array(face), SIZE, SIZE) for face in sharer["faces"]]
        sharer_id, _ = rasterize_faces(polygons, SIZE)
        shared = (sharer_id > 0) & all_mask
        save_mask(shared, ROOT / "check" / f"overlap_with_{sharer['object']}.png")
        sharer_reports.append(
            {
                "object": sharer["object"],
                "materials": sharer["materials"],
                "uv_layer": sharer["uv_layer"],
                "faces": len(sharer["faces"]),
                "overlap_texels": int(shared.sum()),
                "overlap_ratio_of_target": round(float(shared.sum() / all_mask.sum()), 4),
                "faces_of_target_touched": int(len(np.unique(face_id[shared])) - (1 if (face_id[shared] == 0).any() else 0)),
                "verdict": "問題あり：同じ材質の同じ画像を表示するため、トップスの写真テクスチャがこのオブジェクトにも出る" if shared.any() else "重複なし",
                "mask": f"check/overlap_with_{sharer['object']}.png",
            }
        )

    # 部位の多角形とマスクの一致、三角形の検査
    view_parts = {"front": {}, "back": {}}
    triangle_masks = {"front": np.zeros((SIZE, SIZE), bool), "back": np.zeros((SIZE, SIZE), bool)}
    triangle_report = {}
    for part, (view, names) in part_polygons.items():
        coords_uv = np.array([point_tables[view][n]["uv"] for n in names])
        if signed_area(coords_uv) < 0:
            names, coords_uv = names[::-1], coords_uv[::-1]
        if not is_simple(coords_uv):
            raise SystemExit(f"{part}の多角形が自己交差している")
        boundary = coords_uv * SIZE
        interior, triangles = triangulate_part(boundary)
        interior_names = [f"{part}:in{k:03d}" for k in range(len(interior))]
        for name, q in zip(interior_names, interior):
            point_tables[view][name] = {"uv": q / SIZE, "kind": "interior", "part": part}
        all_names = names + interior_names
        coords_px = uv_to_pixel(np.vstack([coords_uv, interior / SIZE]), SIZE, SIZE)
        part_mask = part_id == part_index[part]
        covered = np.zeros((SIZE, SIZE), bool)
        worst = []
        for tri in triangles:
            result = polygon_pixel_mask(coords_px[list(tri)], SIZE)
            if result is None:
                continue
            window, inside = result
            total = int(inside.sum())
            outside = int((inside & ~part_mask[window]).sum())
            covered[window] |= inside
            worst.append(outside / total if total else 0.0)
        polygon_area = abs(signed_area(coords_px[: len(names)]))
        triangle_masks[view] |= covered
        triangle_report[part] = {
            "polygon_points": len(names),
            "interior_points": len(interior),
            "triangles": len(triangles),
            **deformation_test(boundary, interior, triangles),
            "part_texels": int(part_mask.sum()),
            "covered_by_triangles": round(float((covered & part_mask).sum() / part_mask.sum()), 4),
            "triangle_texels_outside_part": round(float((covered & ~part_mask).sum() / max(covered.sum(), 1)), 4),
            "max_outside_fraction_per_triangle": round(float(max(worst)), 4),
            "triangles_over_5pct_outside": int(sum(w > 0.05 for w in worst)),
            "polygon_area_vs_part_texels": round(polygon_area / part_mask.sum(), 4),
        }
        view_parts[view][part] = {
            "polygon": names,
            "interior_points": interior_names,
            "interior_rule": "写真側の内部点＝平均値座標の重み（UV側のpolygonから計算）×写真側のpolygonの点",
            "triangles": [[all_names[i] for i in tri] for tri in triangles],
            "orientation": "UV座標（vは上向き）で反時計回り。ピクセル座標（yは下向き）では時計回り",
        }
    for view, island in view_island.items():
        island_mask = np.isin(face_id - 1, np.flatnonzero(pitari == island)) & all_mask
        save_mask(triangle_masks[view] & island_mask, masks_dir / f"warp_reach_{view}.png")
        save_mask(island_mask & ~triangle_masks[view], masks_dir / f"needs_fill_{view}.png")
        triangle_report[f"{view}_needs_fill_texels"] = int((island_mask & ~triangle_masks[view]).sum())
        triangle_report[f"{view}_needs_fill_ratio"] = round(float((island_mask & ~triangle_masks[view]).sum() / island_mask.sum()), 4)

    # 境界のジグザグ：各点の、前後の点を結ぶ線からの距離（px）。滑らかな曲線ではほぼ0、階段状では四角形1辺の半分ほど。
    staircase = {}
    for view in ("front", "back"):
        for seg in view_segments[view]:
            puv = uv_to_pixel(np.array([surface.uv(p, view_island[view]) for p in seg["path"]]), SIZE, SIZE)
            if len(puv) < 3:
                staircase[f"{view}.{seg['name']}"] = 0.0
                continue
            a, b, p = puv[:-2], puv[2:], puv[1:-1]
            chord = b - a
            distance = np.abs(chord[:, 0] * (p - a)[:, 1] - chord[:, 1] * (p - a)[:, 0]) / np.maximum(np.linalg.norm(chord, axis=1), 1e-9)
            staircase[f"{view}.{seg['name']}"] = round(float(distance.max()), 2)

    # 3DからUVへの伸び。密度は全面の中央値との比で見る。
    density, anisotropy = face_stretch(topology)
    median_density = float(np.median(density))
    ratio = density / median_density
    stretch = {"median_density_px_per_cm": round(median_density / 100, 3)}
    for name in part_names:
        sel = part_of_face == name
        stretch[name] = {
            "density_ratio_p5_p50_p95": [round(float(np.percentile(ratio[sel], q)), 3) for q in (5, 50, 95)],
            "anisotropy_p50_p95_max": [round(float(np.percentile(anisotropy[sel], q)), 3) for q in (50, 95)] + [round(float(anisotropy[sel].max()), 3)],
            "faces_anisotropy_gt_2": int(np.sum(anisotropy[sel] > 2)),
            "faces_density_ratio_outside_0.5_2": int(np.sum((ratio[sel] < 0.5) | (ratio[sel] > 2))),
        }
    heat = np.zeros((face_count + 1, 3), np.uint8)
    heat[0] = (40, 40, 40)
    level = np.clip((anisotropy - 1) / 1.5, 0, 1)
    heat[1:] = np.stack([np.full(face_count, 255), (255 * (1 - level)).astype(int), (255 * (1 - level)).astype(int)], axis=1)
    Image.fromarray(heat[face_id], "RGB").save(ROOT / "check" / "stretch_anisotropy.png")
    heat[1:] = np.stack(
        [
            (255 * np.clip(ratio, 0, 2) / 2).astype(int),
            (255 * (1 - np.abs(np.clip(ratio, 0, 2) - 1))).astype(int),
            (255 * (2 - np.clip(ratio, 0, 2)) / 2).astype(int),
        ],
        axis=1,
    )
    Image.fromarray(heat[face_id], "RGB").save(ROOT / "check" / "stretch_density.png")

    checks = {
        "texture_size": [SIZE, SIZE],
        "faces": face_count,
        "faces_unassigned_to_part": len(unassigned),
        "part_face_counts": {name: int(np.sum(part_of_face == name)) for name in part_names},
        "part_faces_cover_all_faces": len(unassigned) == 0 and sum(int(np.sum(part_of_face == n)) for n in part_names) == face_count,
        "part_masks_union_equals_all_uv_mask": bool(np.array_equal(part_id > 0, all_mask)),
        "uv_out_of_0_1": int(np.sum((topology.uv < 0) | (topology.uv > 1))),
        "zero_area_faces_uv_lt_1e-10": int(np.sum(np.abs(uv_areas) < 1e-10)),
        "smallest_face_area_px": round(float(pixel_areas.min()), 3),
        "faces_without_any_texel_center": int(np.sum(texels_per_face == 0)),
        "nonconvex_uv_quads": len(nonconvex),
        "uv_orientation_by_island": island_orientation,
        "faces_whose_normal_disagrees_with_island_facing": int(np.sum(~facing_ok)),
        "self_overlap_pairs_area_gt_0.01px": len(self_overlaps),
        "self_overlap_total_px": round(float(sum(self_overlaps.values())), 3),
        "texels_covered_by_2plus_faces": int(np.sum(count >= 2)),
        "material_sharers": sharer_reports,
        "warp_triangles": triangle_report,
        "boundary_staircase_max_deviation_px": staircase,
        "uv_stretch": stretch,
        "side_wrap_faces_in_back_island": len(side_wrap),
    }

    # ---- DeepFashion2との対応
    df2_front = {
        "1": {"anchor": "back_neck_center", "use": "not_on_this_view", "note": "前面写真では首の開きから見える後ろ襟ぐり。後身頃の内側なので前面のUVへ貼らない。首の開きの領域を除外する境界に使う"},
        "2": {"anchor": "neck_side_right", "use": "warp"},
        "3": {"anchor": "front_neck_mid_right", "use": "shape_only", "note": "前襟ぐりの曲線の形を決める補助。UV側の位置は目安"},
        "4": {"anchor": "front_neck_center", "use": "warp"},
        "5": {"anchor": "front_neck_mid_left", "use": "shape_only", "note": "前襟ぐりの曲線の形を決める補助。UV側の位置は目安"},
        "6": {"anchor": "neck_side_left", "use": "warp"},
        "7": {"anchor": "shoulder_right", "use": "warp"},
        "8": {"anchor": "sleeve_top_mid_right", "use": "qa_only"},
        "9": {"anchor": "cuff_top_right", "use": "warp"},
        "10": {"anchor": "cuff_bottom_right", "use": "warp"},
        "11": {"anchor": "sleeve_under_mid_right", "use": "qa_only"},
        "12": {"anchor": "armpit_right", "use": "warp"},
        "13": {"anchor": "side_upper_right", "use": "qa_only"},
        "14": {"anchor": "side_mid_right", "use": "qa_only"},
        "15": {"anchor": "hem_side_right", "use": "warp"},
        "16": {"anchor": "hem_center_front", "use": "warp"},
        "17": {"anchor": "hem_side_left", "use": "warp"},
        "18": {"anchor": "side_mid_left", "use": "qa_only"},
        "19": {"anchor": "side_upper_left", "use": "qa_only"},
        "20": {"anchor": "armpit_left", "use": "warp"},
        "21": {"anchor": "sleeve_under_mid_left", "use": "qa_only"},
        "22": {"anchor": "cuff_bottom_left", "use": "warp"},
        "23": {"anchor": "cuff_top_left", "use": "warp"},
        "24": {"anchor": "sleeve_top_mid_left", "use": "qa_only"},
        "25": {"anchor": "shoulder_left", "use": "warp"},
    }
    for entry in df2_front.values():
        entry["status"] = "approximate" if anchors.get(entry["anchor"], {}).get("status") == "approximate" else "official_definition"
    # 背面は、学習済みモデルが画像の左側の点を7〜15と呼ぶと仮定した場合の対応。未検証。
    mirror = {2: 6, 3: 5, 7: 25, 8: 24, 9: 23, 10: 22, 11: 21, 12: 20, 13: 19, 14: 18, 15: 17}
    mirror.update({b: a for a, b in list(mirror.items())})
    df2_back = {}
    for number in range(1, 26):
        if number in (1, 3, 4, 5):
            df2_back[str(number)] = {
                "anchor": None,
                "use": "unmapped",
                "status": "unverified",
                "note": "背面写真で見える襟ぐりは後ろ襟ぐりだけ。モデルが1・3・4・5をどこへ置くか確認していないため対応させない",
            }
            continue
        if number == 16:
            df2_back["16"] = {"anchor": "hem_center_back", "use": "warp", "status": "unverified", "note": "中心の点なので左右の扱いに依存しないが、背面写真での推定は未検証"}
            continue
        front_anchor = df2_front[str(mirror[number])]["anchor"]
        df2_back[str(number)] = {
            "anchor": front_anchor,
            "use": df2_front[str(mirror[number])]["use"],
            "status": "unverified",
            "note": f"背面写真では画像の左が着用者の左。画像の左側の点を{number}と呼ぶ場合に限り{front_anchor}に対応する",
        }

    if args.category == "long_sleeve_top":
        # 袖の途中の追加点は輪郭から補間する。袖口・脇・裾は長そで固有の番号に対応させる。
        numbers = dict(zip(range(1, 26), [1, 2, 3, 4, 5, 6, 7, 9, 11, 12, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 28, 29, 31, 33]))
        df2_front = {str(numbers[int(k)]): v for k, v in df2_front.items()}
        df2_back = {str(numbers[int(k)]): v for k, v in df2_back.items()}
        for table in (df2_front, df2_back):
            for entry in table.values():
                if entry.get("note"):
                    entry["note"] = "前後・左右の扱いは半袖と同じ。長そでの番号へ対応済み"

    # ---- 出力JSON
    def point_json(view):
        result = {}
        for name, entry in point_tables[view].items():
            uv = entry["uv"]
            item = {"kind": entry["kind"], "uv": [round(float(c), 6) for c in uv], "pixel": [round(float(c), 3) for c in uv_to_pixel(uv, SIZE, SIZE)]}
            if entry["kind"] == "sample":
                item["segment"] = entry["segment"]
                item["fraction"] = round(entry["fraction"], 6)
            if entry["kind"] == "interior":
                item["part"] = entry["part"]
            result[name] = item
        return result

    blend_sha = hashlib.sha256(SOURCE_BLEND.read_bytes()).hexdigest() if SOURCE_BLEND.exists() else None
    topology_hash = hashlib.sha256(
        json.dumps([faces, np.round(topology.uv, 6).tolist()]).encode("utf-8")
    ).hexdigest()

    island_info = {}
    for view, island in view_island.items():
        pts = np.concatenate([topology.uv[topology.face_loops[fi]] for fi in np.flatnonzero(pitari == island)])
        island_info[view] = {
            "faces": int(np.sum(pitari == island)),
            "uv_bbox": [round(float(c), 6) for c in (*pts.min(0), *pts.max(0))],
            "layout": "前面から見た配置。画像の左＝着用者の右。襟が上" if view == "front" else "背面から見た配置。画像の左＝着用者の左。襟が上",
            "mask": f"masks/island_{view}.png",
        }

    parts_json = []
    for name, label, view, side in PARTS:
        members = np.flatnonzero(part_of_face == name)
        pts = np.concatenate([topology.uv[topology.face_loops[fi]] for fi in members])
        entry = {
            "name": name,
            "label_ja": label,
            "view": view,
            "wearer_side": side,
            "face_count": int(len(members)),
            "texels": int(np.sum(part_id == part_index[name])),
            "part_id_value": part_index[name],
            "uv_bbox": [round(float(c), 6) for c in (*pts.min(0), *pts.max(0))],
            "mask": f"masks/part_{name}.png",
            "faces": members.tolist(),
        }
        if name == "back_body":
            entry["side_wrap_faces"] = side_wrap
            entry["notes"] = [
                f"元のUVMapでは前身頃だった脇の帯{len(side_wrap)}面を含む。pitariのUVで背面の島にあり、法線も後ろ向きなので後身頃として扱う",
            ]
        if name.startswith("sleeve_"):
            entry["notes"] = ["袖と身頃の境界は元のUVMapで袖が別の島になっている線（袖付け）。pitariのUVでは身頃とつながっている"]
        parts_json.append(entry)

    template = {
        "schema": "pitari.uv-template/1",
        "template_id": TEMPLATE_ID,
        "template_version": TEMPLATE_VERSION,
        "status": "draft：テンプレートと3D上の確認まで。実写の前面・背面写真での検証は未実施",
        "generated_by": "artifacts/uv/pitari/scripts/build_template.py",
        "source": {
            "blend_file": str(SOURCE_BLEND.relative_to(PROJECT)).replace("\\", "/"),
            "blend_sha256": blend_sha,
            "working_copy": None if args.category == "long_sleeve_top" else "artifacts/uv/pitari/pitari_uv_work.blend",
            "blender_version": "4.3.2",
            "object": data["object"],
            "mesh": data["mesh"],
            "uv_map": UV_LAYER,
            "material": data["materials"][0],
            "material_shared_with": [s["object"] for s in data["material_sharers"]],
            "counts": {"vertices": len(V), "faces": face_count, "loops": len(topology.uv)},
            "topology_sha256": topology_hash,
            "shape_state": "シェイプキーのBasis。保存時点で全シェイプキーの値は0",
        },
        "coordinate_systems": {
            "model_3d": f"Blenderのオブジェクト座標（親のHumanも原点・回転なし）。単位m、Zが上。着用者は{'-Y' if forward[1] < 0 else '+Y'}を向き、着用者の左は{'+X' if left_sign > 0 else '-X'}。正中面はx={center_x:.4f}",
            "uv": "BlenderのUV。画像の左下の角が(0,0)、右上の角が(1,1)。uは右、vは上",
            "texture_pixel": "画像の左上の角が(0,0)のピクセル座標。xは右、yは下。画素(col,row)の中心は(col+0.5,row+0.5)",
            "uv_to_pixel": "x = u * width, y = (1 - v) * height",
            "pixel_to_uv": "u = x / width, v = 1 - y / height",
            "texel_center_uv": "u = (col + 0.5) / width, v = 1 - (row + 0.5) / height",
            "mask_rule": "画素の中心が面のUV多角形の内側か辺上にあれば、その画素は面に含まれる。辺上で複数の面に当たる画素は面番号の小さい面に入れる",
            "opencv_and_existing_points": "OpenCVと既存の推論の点は整数が画素中心とみなす。このテンプレートのピクセル座標へは+0.5する",
            "gltf": "glTFのTEXCOORD_0は(u, 1 - v)。glTFのUVは画像の左上原点なので、x = s * width, y = t * height。three.jsのGLTFLoaderはtexture.flipY = falseで読む",
            "blender_image_pixels": "bpyのImage.pixelsは下の行から並ぶ。PNGの行rowはbpyでは(height - 1 - row)行目",
            "photo": "写真の点は写真ごとのピクセル座標で、UV座標と混同しない。photo_input_specを参照",
            "implementation": "artifacts/uv/pitari/scripts/uv_pixels.py",
        },
        "texture": {"width": SIZE, "height": SIZE, "format": "PNG", "color_space": "sRGB", "base_color_must_not_contain": ["ランドマーク番号", "UVの線", "確認用の文字"]},
        "islands": island_info,
        "parts": parts_json,
        "part_id_image": {"path": "masks/part_id.png", "values": {str(v): k for k, v in part_index.items()} | {"0": "UV面なし"}},
        "face_id_image": {"path": "masks/face_id_plus1.png", "format": "16bit PNG。値は面番号+1、0は面なし"},
        "anchors": anchor_json,
        "views": {
            view: {
                "island": view,
                "photo_layout": (
                    "服の前面を上にして平置きし、襟を画像の上にして真上から撮る。画像の左＝着用者の右"
                    if view == "front"
                    else "服を左右に裏返して背面を上にし、襟を画像の上にして真上から撮る。画像の左＝着用者の左。上下に裏返した場合は180度回して襟を上にする"
                ),
                "df2_short_sleeve_top": df2_front if view == "front" else df2_back,
                "segments": views[view]["segments"],
                "points": point_json(view),
                "parts": view_parts[view],
                "masks": {"island": f"masks/island_{view}.png", "warp_reach": f"masks/warp_reach_{view}.png", "needs_fill": f"masks/needs_fill_{view}.png"},
            }
            for view in ("front", "back")
        },
        "photo_methods": {
            "contour": "写真の服の輪郭（切り抜きマスクの外周）上で、startとendの点の間をたどり、samplesのfractionの位置に点を置く。fractionは3Dモデル上の長さの割合で、平置きの実写は布の実寸に比例するためこちらを使う。fraction_uvはUV上の長さの割合で、UV画像から作った合成写真の検査用",
            "neckline_curve": "前面写真の前襟ぐりは服の外周ではない。DeepFashion2の2・3・4（右側）または4・5・6（左側）を通る滑らかな曲線上で割合の位置を取る。3・5の位置は目安なので、精度は低い",
            "armhole_curve": "袖付けは輪郭に現れない。この区間のuv_polyline（テンプレートの袖付けの曲線）を、端の2点が写真の点に重なるよう回転・拡大・平行移動して置き、割合の位置を取る。補助点がなければ、肩先から脇までの曲線全体を同じ変換で置いて中点を決める。縫い目が見えるなら補助点を手で指定する。推定扱い",
        },
        "auxiliary_points": {
            "aux_armhole_mid_*": {
                "meaning": "袖付けの線の中点。袖と身頃の境界を、肩先と脇の2点だけでなく3点で決める",
                "photo_acquisition": "既存のモデルは推定しない。縫い目が写っていれば手で指定する。なければテンプレートの袖付けの曲線を肩先と脇に合わせて置き、その中点で代用する（推定扱い）",
            }
        },
        "coverage_spec": {
            "all_uv_mask": "masks/all_uv.png",
            "padding_mask": "masks/all_uv_pad8.png（貼った色を外側へ広げる範囲。塗り残し判定には使わない）",
            "layers": {
                "observed": "写真の服の領域内の画素から色を取れたテクセル",
                "filled": "写真の色がなく、周囲から推定して補ったテクセル",
                "uncovered": "all_uv − observed − filled",
                "low_confidence": "observedのうち、armhole_curveやneckline_curveの点を含む三角形で貼った部分（位置の信頼度が低い）",
            },
            "rule": "各層は別々の8bitマスク（255=該当）で保存する。テクスチャの色が白・黒かどうかで判定しない",
        },
        "photo_input_spec": {
            "per_photo": {
                "imageId": "写真のID（measurement画像のUUIDなど）",
                "view": "front または back",
                "widthPx": "点の座標の基準になる画像の幅",
                "heightPx": "同じく高さ",
                "pixelConvention": "opencv_center（既存の推論の点）またはcorner（このテンプレート）",
                "transformFromSource": "元の画像からこの画像への3×3行列（回転・縮小・切り抜き）。変換しない場合は単位行列",
                "garmentMask": "同じ画像サイズの服の領域マスク。cutoutは別の切り抜き座標なので、そのままでは使えない",
                "points": "[{id: DeepFashion2の番号 または name: 補助点名, x, y, score, source: model|manual|derived}]",
            },
            "left_right_rule": "左右のペア（2↔6、7↔25など）は番号を信用せず、写真上のxで決め直す。前面写真では画像の左が着用者の右、背面写真では画像の左が着用者の左",
            "example_not_real_data": {
                "imageId": "00000000-0000-4000-8000-000000000000",
                "view": "front",
                "widthPx": 1200,
                "heightPx": 1600,
                "pixelConvention": "opencv_center",
                "transformFromSource": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                "points": [{"id": 7, "x": 300.0, "y": 420.0, "score": 0.8, "source": "model"}],
            },
        },
        "unobservable_and_needs_more_points": [
            "内側：メッシュは1枚の面で、裏側は表と同じUVを使う。材質は裏面を隠さない設定（use_backface_culling=False）なので、襟元や袖口から見える内側にも表の柄が出る。写真から内側の色は取らない",
            "襟：独立した襟や見返しの面はない。襟ぐりは穴の縁だけ。リブ襟の色は前身頃・後身頃の縁の数画素で表すしかない",
            "前面写真の首の開き：前襟ぐり（2-3-4-5-6）と後ろ襟ぐり（2-1-6）の間に見えるのは後身頃の内側。前身頃へ貼らない",
            "袖付け：写真の輪郭に出ないため、armhole_curveで推定する。実物の袖付けの曲がり方がモデルと違えばずれる。縫い目を手で指定するか、補助点を増やす必要がある",
            "脇：pitariの前後の切れ目は四角形の辺に沿った階段状。写真の滑らかな脇線と合わず、階段の歯の部分はneeds_fillになりやすい",
            "脇の下・袖下：平置きでしわや影が出やすく、写真の色が信頼しにくい",
            "背面：DeepFashion2の番号の左右と1・3・4・5の位置が未検証",
        ],
        "checks": checks,
    }
    template["category"] = args.category
    if args.category == "long_sleeve_top":
        template["df2_pairs"] = [[2, 6], [3, 5]] + [[n, 40 - n] for n in range(7, 20)]
        template["df2_spread_checks"] = [[7, 33], [11, 29], [12, 28], [16, 24], [19, 21]]
        template["df2_centers"] = [1, 4, 20]
        for spec in template["views"].values():
            spec["df2_table"] = spec.pop("df2_short_sleeve_top")
        template["photo_input_spec"]["left_right_rule"] = "左右のペアはdf2_pairsに従い写真上のxで決め直す。前面は画像の左が着用者の右、背面は着用者の左"
    (ROOT / "uv_template.json").write_text(json.dumps(template, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data/inspection_report.json").write_text(
        json.dumps(
            {
                "checks": checks,
                "self_overlap_pairs": [{"faces": list(k), "area_px": round(v, 3)} for k, v in sorted(self_overlaps.items(), key=lambda kv: -kv[1])],
                "nonconvex_faces": nonconvex,
                "faces_without_texel": np.flatnonzero(texels_per_face == 0).tolist(),
                "faces_facing_mismatch": np.flatnonzero(~facing_ok).tolist(),
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )

    make_check_images(topology, face_id, part_id, part_index, uv_polygons, anchor_json, view_parts, point_tables, df2_front, df2_back)
    print(json.dumps({k: v for k, v in checks.items() if k not in ("warp_triangles",)}, ensure_ascii=False, indent=1))
    print(json.dumps(checks["warp_triangles"], ensure_ascii=False, indent=1))


def make_check_images(topology, face_id, part_id, part_index, uv_polygons, anchor_json, view_parts, point_tables, df2_front, df2_back):
    check = ROOT / "check"
    check.mkdir(exist_ok=True)
    part_names = list(part_index)
    background = (40, 40, 40)

    # 1. 部位の色分け
    palette = np.zeros((len(part_names) + 1, 3), np.uint8)
    palette[0] = background
    for name, k in part_index.items():
        palette[k] = PART_COLORS[name]
    # 確認画像もBase Colorと同じく、島の外へ8px色を広げる。
    parts_image = pad_colors(palette[part_id], part_id > 0, 8)
    Image.fromarray(parts_image, "RGB").save(check / "check_parts.png")

    # 2. 前後・左右の文字入り
    light = np.zeros_like(palette)
    light[0] = background
    for name, k in part_index.items():
        light[k] = tuple(int(c * 0.45 + 255 * 0.55) for c in PART_COLORS[name])
    labels = Image.fromarray(pad_colors(light[part_id], part_id > 0, 8), "RGB")
    draw = ImageDraw.Draw(labels)
    texts = {
        "front_body": ["前 FRONT", "↑ 襟 NECK"],
        "back_body": ["後 BACK", "↑ 襟 NECK"],
        "sleeve_right_front": ["右袖 前", "R-F"],
        "sleeve_right_back": ["右袖 後", "R-B"],
        "sleeve_left_front": ["左袖 前", "L-F"],
        "sleeve_left_back": ["左袖 後", "L-B"],
    }
    for name, lines in texts.items():
        ys, xs = np.nonzero(part_id == part_index[name])
        cx, cy = xs.mean(), ys.mean()
        width = xs.max() - xs.min()
        size = int(max(28, min(150, width / 5.5)))
        f = font(FONT_JA, size)
        for k, line in enumerate(lines):
            draw.text((cx, cy + (k - (len(lines) - 1) / 2) * size * 1.15), line, font=f, fill=(0, 0, 0), anchor="mm")
    # 身頃の左右の端に「着用者の右／左」を置く
    for view in ("front", "back"):
        body = part_id == part_index[f"{view}_body"]
        ys, xs = np.nonzero(body)
        y_mid = int(np.percentile(ys, 70))
        row = np.flatnonzero(body[y_mid])
        f = font(FONT_JA, 64)
        image_left_side = "right" if view == "front" else "left"
        image_right_side = "left" if view == "front" else "right"
        for x, side, anchor in ((row.min() + 30, image_left_side, "lm"), (row.max() - 30, image_right_side, "rm")):
            letter = "R" if side == "right" else "L"
            draw.text((x, y_mid), f"{letter} {'右' if side == 'right' else '左'}", font=f, fill=(180, 0, 0), anchor=anchor)
    labels.save(check / "check_labels.png")

    # 3. ランドマーク番号付き（UVの線あり、確認専用）
    base = Image.fromarray(pad_colors((light[part_id].astype(np.float32) * 0.85 + 255 * 0.15).astype(np.uint8), part_id > 0, 8), "RGB")
    draw = ImageDraw.Draw(base)
    for points in uv_polygons:
        draw.polygon([tuple(p) for p in points], outline=(120, 120, 120))
    edges = boundary_of(part_id > 0)
    for name, k in part_index.items():
        edges |= boundary_of(part_id == k)
    arr = np.array(base)
    arr[edges] = (0, 0, 0)
    base = Image.fromarray(arr)
    draw = ImageDraw.Draw(base)
    number_font = font(FONT_EN, 30)
    small_font = font(FONT_JA, 22)
    colors = {"official_definition": (0, 120, 0), "approximate": (0, 90, 200), "unverified": (210, 90, 0)}
    for view, table in (("front", df2_front), ("back", df2_back)):
        for number, entry in table.items():
            anchor = entry["anchor"]
            if not anchor or view not in anchor_json[anchor]["uv_by_view"]:
                continue
            if view == "front" and entry["use"] == "not_on_this_view":
                continue
            x, y = anchor_json[anchor]["uv_by_view"][view]["pixel"]
            color = colors[entry["status"]]
            r = 9
            if entry["status"] == "approximate" or (view == "back" and anchors_status(anchor_json, anchor) == "approximate"):
                draw.ellipse((x - r, y - r, x + r, y + r), outline=color, width=4)
            else:
                draw.ellipse((x - r, y - r, x + r, y + r), fill=color)
            text = number + ("?" if view == "back" else "")
            draw.text((x + 12, y - 12), text, font=number_font, fill=color, stroke_width=3, stroke_fill=(255, 255, 255))
    for name, entry in anchor_json.items():
        if entry["status"] != "auxiliary" and name not in ("back_neck_center",):
            continue
        for view, info in entry["uv_by_view"].items():
            if name.startswith("aux_") and not name.endswith(view):
                continue
            x, y = info["pixel"]
            draw.rectangle((x - 8, y - 8, x + 8, y + 8), fill=(150, 0, 150))
            draw.text((x + 12, y + 4), "A" if name.startswith("aux_") else "BNC", font=number_font, fill=(150, 0, 150), stroke_width=3, stroke_fill=(255, 255, 255))
    legend = [
        "確認用。Base Colorに使わない",
        "緑●：前面のDeepFashion2番号（公式定義）",
        "青○：位置の定義がない目安の点（3,5,8,11,13,14,18,19,21,24）",
        "橙●・?：背面の番号。画像左を7〜15と呼ぶ仮定で未検証",
        "紫■A：補助点（袖付けの中点）　BNC：後ろ襟ぐりの中心",
        "左の島＝前面（画像左＝着用者の右）　右の島＝背面（画像左＝着用者の左）",
    ]
    legend_font = font(FONT_JA, 34)
    for k, line in enumerate(legend):
        draw.text((80, 1560 + k * 48), line, font=legend_font, fill=(255, 255, 255))
    base.save(check / "check_landmarks.png")

    # 4. 三角形の接続（確認専用）
    tri_image = Image.fromarray(light[part_id], "RGB")
    draw = ImageDraw.Draw(tri_image)
    for view in ("front", "back"):
        for part, info in view_parts[view].items():
            for tri in info["triangles"]:
                pts = [tuple(uv_to_pixel(point_tables[view][n]["uv"], SIZE, SIZE)) for n in tri]
                draw.polygon(pts, outline=(0, 0, 0))
            for n in info["polygon"] + info["interior_points"]:
                x, y = uv_to_pixel(point_tables[view][n]["uv"], SIZE, SIZE)
                kind = point_tables[view][n]["kind"]
                color = {"anchor": (200, 0, 0), "sample": (0, 0, 200), "interior": (90, 90, 90)}[kind]
                r = 3 if kind == "interior" else 4
                draw.ellipse((x - r, y - r, x + r, y + r), fill=color)
    draw.text((80, 1600), "確認用。変形用の三角形（部位ごと）。赤＝固定点、青＝輪郭上の割合の点、灰＝内部点（平均値座標）", font=font(FONT_JA, 34), fill=(255, 255, 255))
    tri_image.save(check / "check_warp_triangles.png")

    # 5. カラーグリッド（文字は左右反転が分かるもの）
    cells = 16
    step = SIZE // cells
    grid = Image.new("RGB", (SIZE, SIZE))
    draw = ImageDraw.Draw(grid)
    grid_font = font(FONT_EN, 40)
    for row in range(cells):
        for col in range(cells):
            hue = col / cells
            value = 0.55 + 0.45 * (row % 2)
            r, g, b = hsv_to_rgb(hue, 0.65 if row % 4 < 2 else 0.35, value)
            draw.rectangle((col * step, row * step, (col + 1) * step - 1, (row + 1) * step - 1), fill=(r, g, b), outline=(0, 0, 0), width=2)
            draw.text((col * step + step / 2, row * step + step / 2), f"{chr(65 + row)}{col + 1}", font=grid_font, fill=(0, 0, 0), anchor="mm")
    grid.save(check / "check_grid.png")

    # 6. 市松模様（部位の外は灰色）
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    checker = (((xx // 32) + (yy // 32)) % 2).astype(np.uint8)
    checker_rgb = np.where(checker[..., None] == 1, np.array([235, 235, 235], np.uint8), np.array([60, 60, 60], np.uint8))
    Image.fromarray(checker_rgb, "RGB").save(check / "check_checker.png")


def anchors_status(anchor_json, name):
    return anchor_json[name]["status"]


def hsv_to_rgb(h, s, v):
    i = int(h * 6) % 6
    f = h * 6 - int(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
    return int(r * 255), int(g * 255), int(b * 255)


if __name__ == "__main__":
    main()
