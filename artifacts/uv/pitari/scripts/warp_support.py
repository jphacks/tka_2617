"""三角形単位の画像変形で、UV側と写真側が同じ接続関係を使うための計算。

内部点は、部位の輪郭の点から平均値座標（mean value coordinates）で決める派生点。
UV側で求めた重みを写真側の輪郭の点に掛ければ、写真側の内部点になる。
重みはテンプレートのUV座標から毎回同じ値に計算できるため、JSONには保存しない。
"""

from collections import Counter

import numpy as np


def mean_value_weights(polygon, points):
    """単純多角形の内部の点について、各頂点の平均値座標を返す。形は(点の数, 頂点の数)。

    参考：Floater, Mean value coordinates, CAGD 2003。凹んだ多角形でも内部の点には定義できる。
    """
    polygon = np.asarray(polygon, dtype=float)
    points = np.atleast_2d(np.asarray(points, dtype=float))
    s = polygon[None, :, :] - points[:, None, :]
    r = np.linalg.norm(s, axis=2)
    s_next = np.roll(s, -1, axis=1)
    cross = s[..., 0] * s_next[..., 1] - s[..., 1] * s_next[..., 0]
    dot = (s * s_next).sum(axis=2)
    angle = np.arctan2(cross, dot)
    tangent = np.tan(angle / 2)
    weights = (np.roll(tangent, 1, axis=1) + tangent) / r
    return weights / weights.sum(axis=1, keepdims=True)


def point_in_polygon(polygon, points):
    polygon = np.asarray(polygon, dtype=float)
    points = np.atleast_2d(np.asarray(points, dtype=float))
    x, y = points[:, 0:1], points[:, 1:2]
    x0, y0 = polygon[:, 0][None, :], polygon[:, 1][None, :]
    x1, y1 = np.roll(polygon[:, 0], -1)[None, :], np.roll(polygon[:, 1], -1)[None, :]
    crosses = ((y0 > y) != (y1 > y)) & (x < (x1 - x0) * (y - y0) / np.where(y1 == y0, 1e-30, y1 - y0) + x0)
    return crosses.sum(axis=1) % 2 == 1


def distance_to_boundary(polygon, points):
    polygon = np.asarray(polygon, dtype=float)
    points = np.atleast_2d(np.asarray(points, dtype=float))
    a = polygon[None, :, :]
    b = np.roll(polygon, -1, axis=0)[None, :, :]
    p = points[:, None, :]
    ab = b - a
    t = np.clip(((p - a) * ab).sum(axis=2) / (ab * ab).sum(axis=2), 0, 1)
    closest = a + t[..., None] * ab
    return np.linalg.norm(p - closest, axis=2).min(axis=1)


def delaunay(points):
    """Bowyer–Watson法のDelaunay三角形分割。返す三角形は反時計回り（入力座標の向きで）。"""
    points = np.asarray(points, dtype=float)
    count = len(points)
    low, high = points.min(axis=0), points.max(axis=0)
    span = max(high - low) * 20
    center = (low + high) / 2
    work = np.vstack([points, [center + [-span, -span], center + [span, -span], center + [0, span]]])
    triangles = {(count, count + 1, count + 2)}
    circles = {}

    def circle(triangle):
        if triangle not in circles:
            (ax, ay), (bx, by), (cx, cy) = work[list(triangle)]
            d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
            ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
            uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
            circles[triangle] = (ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2)
        return circles[triangle]

    for index in range(count):
        px, py = work[index]
        bad = [t for t in triangles if (lambda c: (px - c[0]) ** 2 + (py - c[1]) ** 2 < c[2])(circle(t))]
        edges = Counter()
        for a, b, c in bad:
            for edge in ((a, b), (b, c), (c, a)):
                edges[tuple(sorted(edge))] += 1
        triangles.difference_update(bad)
        for (a, b), seen in edges.items():
            if seen == 1:
                triangles.add((a, b, index))
    result = []
    for triangle in triangles:
        if max(triangle) >= count:
            continue
        a, b, c = triangle
        pa, pb, pc = points[a], points[b], points[c]
        if (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]) < 0:
            b, c = c, b
        result.append((a, b, c))
    return sorted(result)


def triangle_signed_areas(points, triangles):
    points = np.asarray(points, dtype=float)
    t = np.asarray(triangles)
    a, b, c = points[t[:, 0]], points[t[:, 1]], points[t[:, 2]]
    return 0.5 * ((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]))


def triangle_mask(points, xs, ys):
    """画素中心(xs, ys)が三角形の内部か辺上にあるか。"""
    (x0, y0), (x1, y1), (x2, y2) = points
    area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if abs(area) < 1e-12:
        return np.zeros(xs.shape, bool)
    sign = 1.0 if area > 0 else -1.0
    e0 = sign * ((x1 - x0) * (ys - y0) - (y1 - y0) * (xs - x0))
    e1 = sign * ((x2 - x1) * (ys - y1) - (y2 - y1) * (xs - x1))
    e2 = sign * ((x0 - x2) * (ys - y2) - (y0 - y2) * (xs - x2))
    eps = -1e-9
    return (e0 >= eps) & (e1 >= eps) & (e2 >= eps)


def signed_area(points):
    x, y = points[:, 0], points[:, 1]
    return 0.5 * (np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def mean_value_embedding(source, triangles, boundary_count, boundary_target):
    """三角形の辺に沿った平均値座標の重みで、内部の点の写り先を解く（Floater 2003の平均値パラメータ化）。

    sourceの先頭boundary_count個が輪郭の点、残りが内部の点。写り先の輪郭が凸なら三角形は裏返らない。
    輪郭全体からの重み（mean_value_weights）より局所的なので、ズボンの股のように形が大きく変わる所でも折れ返りにくい。
    """
    source = np.asarray(source, dtype=float)
    count = len(source)
    weights = np.zeros((count, count))
    for triangle in triangles:
        for k in range(3):
            i, j, l = triangle[k], triangle[(k + 1) % 3], triangle[(k + 2) % 3]
            a, b = source[j] - source[i], source[l] - source[i]
            length_a, length_b = np.linalg.norm(a), np.linalg.norm(b)
            half = np.tan(np.arccos(np.clip(a @ b / (length_a * length_b), -1.0, 1.0)) / 2)
            weights[i, j] += half / length_a
            weights[i, l] += half / length_b
    inner = slice(boundary_count, count)
    system = np.diag(weights[inner].sum(axis=1)) - weights[inner, inner]
    return np.linalg.solve(system, weights[inner, :boundary_count] @ np.asarray(boundary_target, dtype=float))
