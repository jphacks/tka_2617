"""pitari_trousers.blendのズボンのUVから、写真の前面・背面を貼るためのテンプレートを作る。形はTシャツのuv_template.jsonと同じ。

使い方（リポジトリ直下）：
  ./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/build_trousers_template.py
入力はexport_trousers_mesh.pyの書き出し（trousers/data/mesh_export.json）。出力はtrousers/uv_template.json・masks/・check/。

前提と近似：
- UVは脚ごとの2つの島で、前後中心の縫い目と股の縫い目で切り開かれている。
- 前面の写真は脚の前半分、背面の写真は後ろ半分へ貼る。前後の境目は、外側は平置きで折れる線（3Dで最も外に出ている所）、
  内側は股の縫い目とする。股の縫い目は脚の内側よりやや前にあるため、内側の細い帯には背面の写真が入る。
"""

import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

SCRIPTS = Path(__file__).resolve().parent
OUT = SCRIPTS.parent / "trousers"
sys.path.insert(0, str(SCRIPTS))
from uv_pixels import uv_to_pixel  # noqa: E402
from warp_support import delaunay, distance_to_boundary, point_in_polygon, signed_area  # noqa: E402

SIZE = 2048
# 輪郭に沿った点の間隔（3Dの長さ）。写真側でも同じ割合の位置に点を置く。
SAMPLE_SPACING_M = 0.03
INTERIOR_SPACING_PX = 40
FOLD_SLICES = 40
PARTS = ["front_right", "front_left", "back_right", "back_left"]

# DeepFashion2のズボンの番号。左右の組は、写真で左に出る番号を先に書く（実写の推論で確かめた）。
DF2_PAIRS = [[1, 3], [4, 14], [5, 13], [6, 12], [7, 11], [8, 10]]
DF2_CENTERS = [2, 9]

# 受領したjeansの面配列とUV配列のSHA-256。求め方はexport_trousers_mesh.pyと同じで、mesh_info.jsonの値とは違う。
SOURCE_SHA256 = {
    "topology": "9aabb905e06856d3f826984ab5fe8581778eb078a4789b62f888a8d2463ac4c1",
    "uvmap": "db11a0796d873c21d8ad26143c27e49e4981be9689de5db8c3394e7c908e6d0a",
}


def df2_table(view):
    # 前面の写真では画像の左が着用者の右脚、背面の写真（左右に裏返して置く）では左脚。
    near, far = ("right", "left") if view == "front" else ("left", "right")
    table = {
        "1": {"anchors": [f"waist_outer_{near}"], "use": "warp"},
        "3": {"anchors": [f"waist_outer_{far}"], "use": "warp"},
        "2": {"anchors": ["waist_center_right", "waist_center_left"], "use": "warp", "note": "前（後ろ）中心の縫い目の上端。左右の島に1つずつある"},
        "9": {"anchors": ["crotch_right", "crotch_left"], "use": "warp", "note": "股。左右の島に1つずつある"},
        "6": {"anchors": [f"hem_outer_{near}"], "use": "warp"},
        "12": {"anchors": [f"hem_outer_{far}"], "use": "warp"},
        "7": {"anchors": [f"hem_inner_{near}"], "use": "warp"},
        "11": {"anchors": [f"hem_inner_{far}"], "use": "warp"},
    }
    for number in ("4", "5", "8", "10", "13", "14"):
        table[number] = {"anchors": [], "use": "contour_only", "note": "腰・膝の点。位置の定義が曖昧なので輪郭の割合で代わりに決める"}
    return table


def load():
    data = json.loads((OUT / "data/mesh_export.json").read_text(encoding="utf-8"))
    # 別のメッシュから作ると、アプリのGLBのUVと合わないテンプレートになる
    for name, key in (("topology", "faces"), ("uvmap", "uv")):
        digest = hashlib.sha256(json.dumps(data[key], separators=(",", ":")).encode()).hexdigest()
        if digest != SOURCE_SHA256[name]:
            raise SystemExit(f"mesh_export.jsonの{key}が受領したズボンと違います。メッシュを変えた場合は、SOURCE_SHA256とテンプレートの版を更新してください")
    return data, np.array(data["vertices"]), np.array(data["uv"]), data["faces"], data["face_loops"]


def classify(vertices, uv, faces, face_loops):
    """UVの島と、辺の種類（open＝開いた縁、center＝島の境目、inseam＝島の中の切れ目）。"""
    edge_faces = defaultdict(list)
    for index, (face, loops) in enumerate(zip(faces, face_loops)):
        for k in range(len(face)):
            a, b = face[k], face[(k + 1) % len(face)]
            edge_faces[tuple(sorted((a, b)))].append((index, {a: uv[loops[k]], b: uv[loops[(k + 1) % len(face)]]}))
    parent = list(range(len(faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for items in edge_faces.values():
        if len(items) == 2 and all(np.allclose(items[0][1][v], items[1][1][v], atol=1e-5) for v in items[0][1]):
            parent[find(items[0][0])] = find(items[1][0])
    island_of = [find(i) for i in range(len(faces))]
    kinds = {}
    for edge, items in edge_faces.items():
        if len(items) == 1:
            kinds[edge] = "open"
        elif island_of[items[0][0]] != island_of[items[1][0]]:
            kinds[edge] = "center"
        elif not all(np.allclose(items[0][1][v], items[1][1][v], atol=1e-5) for v in edge):
            kinds[edge] = "inseam"
    islands = defaultdict(list)
    for index, root in enumerate(island_of):
        islands[root].append(index)
    if len(islands) != 2:
        raise SystemExit(f"左右2つのUVの島が必要です（実際は{len(islands)}個）")
    by_side = {}
    for members in islands.values():
        x = np.mean([vertices[v][0] for f in members for v in faces[f]])
        # 着用者は−Yを向き、着用者の左は+X。
        side = "left" if x > 0 else "right"
        if side in by_side:
            raise SystemExit(f"{side}側にUVの島が重複しています")
        by_side[side] = members
    return by_side, kinds


def boundary_loop(members, faces, face_loops, uv):
    """島の外周を、面の向きに沿ってたどった(頂点, uv)の列。"""
    def key(vertex, loop):
        return (vertex, round(float(uv[loop][0]), 6), round(float(uv[loop][1]), 6))

    directed, counts = {}, Counter()
    for f in members:
        face, loops = faces[f], face_loops[f]
        for k in range(len(face)):
            a, b = key(face[k], loops[k]), key(face[(k + 1) % len(face)], loops[(k + 1) % len(face)])
            directed[a] = directed.get(a, []) + [b]
            counts[frozenset((a, b))] += 1
    following = {a: b for a, targets in directed.items() for b in targets if counts[frozenset((a, b))] == 1}
    start = next(iter(following))
    loop = [start]
    while following[loop[-1]] != start:
        loop.append(following[loop[-1]])
    return loop


def polyline_point(points3d, points_uv, fraction):
    """3Dの長さの割合fractionの位置のuvと、uv上の長さの割合を返す。"""
    d3 = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(points3d, axis=0), axis=1))])
    duv = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(points_uv, axis=0), axis=1))])
    target = fraction * d3[-1]
    i = min(int(np.searchsorted(d3, target, side="right")) - 1, len(d3) - 2)
    t = 0.0 if d3[i + 1] == d3[i] else (target - d3[i]) / (d3[i + 1] - d3[i])
    point = points_uv[i] + t * (points_uv[i + 1] - points_uv[i])
    return point, float((duv[i] + t * (duv[i + 1] - duv[i])) / duv[-1])


def fold_line(members, faces, face_loops, vertices, uv, side, bottom, top):
    """平置きで外側が折れる線。高さごとに切った断面で最も外に出ている点を、裾から腰へつなぐ。"""
    outward = 1.0 if side == "left" else -1.0
    triangles = []
    for f in members:
        face, loops = faces[f], face_loops[f]
        for a, b, c in ((0, 1, 2), (0, 2, 3))[: len(face) - 2]:
            triangles.append([(vertices[face[i]], uv[loops[i]]) for i in (a, b, c)])
    path3d, path_uv = [vertices[bottom[0]]], [np.array(bottom[1:])]
    for height in np.linspace(vertices[bottom[0]][2], vertices[top[0]][2], FOLD_SLICES + 2)[1:-1]:
        best = None
        for triangle in triangles:
            for (p, pu), (q, qu) in ((triangle[0], triangle[1]), (triangle[1], triangle[2]), (triangle[2], triangle[0])):
                if (p[2] - height) * (q[2] - height) < 0:
                    t = (height - p[2]) / (q[2] - p[2])
                    point = p + t * (q - p)
                    if best is None or outward * point[0] > outward * best[0][0]:
                        best = (point, pu + t * (qu - pu))
        if best is None:
            raise SystemExit(f"{side}の高さ{height:.3f}で、脚の断面が見つかりません")
        path3d.append(best[0])
        path_uv.append(best[1])
    path3d.append(vertices[top[0]])
    path_uv.append(np.array(top[1:]))
    return np.array(path3d), np.array(path_uv)


def leg_paths(loop, kinds, vertices, side, members, faces, face_loops, uv):
    """島の外周を、ウエスト・中心・股・裾・外側の折れ線に分ける。"""
    def kind(a, b):
        return kinds.get(tuple(sorted((a[0], b[0]))))

    vertex_kinds = defaultdict(set)
    for a, b in zip(loop, loop[1:] + loop[:1]):
        vertex_kinds[a[0]].add(kind(a, b))
        vertex_kinds[b[0]].add(kind(a, b))
    waist_center = [k for k in loop if {"open", "center"} <= vertex_kinds[k[0]]]
    front_center = min(waist_center, key=lambda k: vertices[k[0]][1])
    back_center = max(waist_center, key=lambda k: vertices[k[0]][1])
    index = loop.index(front_center)
    loop = loop[index:] + loop[:index]
    if kind(loop[0], loop[1]) != "center":
        loop = loop[:1] + loop[1:][::-1]
    crotch = [i for i, k in enumerate(loop) if {"center", "inseam"} <= vertex_kinds[k[0]]]
    hem_inner = [i for i, k in enumerate(loop) if {"open", "inseam"} <= vertex_kinds[k[0]]]
    crotch_z = vertices[loop[crotch[0]][0]][2]
    outward = 1.0 if side == "left" else -1.0
    open_vertices = [i for i, k in enumerate(loop) if "open" in vertex_kinds[k[0]]]
    hem = [i for i in open_vertices if vertices[loop[i][0]][2] < crotch_z]
    waist = [i for i in open_vertices if vertices[loop[i][0]][2] > crotch_z]
    fold_bottom = max(hem, key=lambda i: outward * vertices[loop[i][0]][0])
    fold_top = max(waist, key=lambda i: outward * vertices[loop[i][0]][0])
    back = loop.index(back_center)
    order = [0, crotch[0], hem_inner[0], fold_bottom, hem_inner[1], crotch[1], back, fold_top, len(loop)]
    if order != sorted(order):
        raise SystemExit(f"{side}：外周の並びが想定と違います {order}")

    def span(i, j):
        keys = (loop + loop[:1])[i : j + 1]
        return np.array([vertices[k[0]] for k in keys]), np.array([k[1:] for k in keys])

    fold = fold_line(members, faces, face_loops, vertices, uv, side, loop[fold_bottom], loop[fold_top])
    return {
        "front": {
            "waist": span(fold_top, len(loop)),
            "center": span(0, crotch[0]),
            "inseam": span(crotch[0], hem_inner[0]),
            "hem": span(hem_inner[0], fold_bottom),
            "outer": fold,
        },
        "back": {
            "waist": tuple(a[::-1] for a in span(back, fold_top)),
            "center": tuple(a[::-1] for a in span(crotch[1], back)),
            "inseam": tuple(a[::-1] for a in span(hem_inner[1], crotch[1])),
            "hem": tuple(a[::-1] for a in span(fold_bottom, hem_inner[1])),
            "outer": fold,
        },
    }


def build_view(view, paths_by_side):
    points, segments, parts = {}, [], {}
    for side, paths in paths_by_side.items():
        part = f"{view}_{side}"
        anchor_names = {
            "waist": (f"waist_outer_{side}", f"waist_center_{side}"),
            "center": (f"waist_center_{side}", f"crotch_{side}"),
            "inseam": (f"crotch_{side}", f"hem_inner_{side}"),
            "hem": (f"hem_inner_{side}", f"hem_outer_{side}"),
            "outer": (f"hem_outer_{side}", f"waist_outer_{side}"),
        }
        polygon = []
        for name in ("waist", "center", "inseam", "hem", "outer"):
            points3d, points_uv = paths[name]
            start, end = anchor_names[name]
            for anchor, uv in ((start, points_uv[0]), (end, points_uv[-1])):
                points[anchor] = {"kind": "anchor", "uv": [round(float(v), 6) for v in uv]}
            length = float(np.sum(np.linalg.norm(np.diff(points3d, axis=0), axis=1)))
            count = max(1, round(length / SAMPLE_SPACING_M) - 1)
            segment = f"{name}_{side}"
            samples = []
            for k in range(1, count + 1):
                fraction = k / (count + 1)
                uv, fraction_uv = polyline_point(points3d, points_uv, fraction)
                sample = f"{segment}#{k}"
                points[sample] = {"kind": "sample", "uv": [round(float(v), 6) for v in uv], "segment": segment, "fraction": round(fraction, 6)}
                samples.append({"name": sample, "fraction": round(fraction, 6), "fraction_uv": round(fraction_uv, 6)})
            segments.append(
                {
                    "name": segment,
                    "start": start,
                    "end": end,
                    # 前（後ろ）中心の縫い目は写真では服の内側にあり輪郭に出ないので、両端を直線で結ぶ。
                    "photo_method": "straight" if name == "center" else "contour",
                    "parts": [part],
                    "length_3d_m": round(length, 4),
                    "samples": samples,
                    "uv_polyline": [[round(float(u), 6), round(float(v), 6)] for u, v in points_uv],
                }
            )
            polygon += [start] + [s["name"] for s in samples]
        parts[part] = {"polygon": polygon}
    for name, point in points.items():
        point["pixel"] = [round(float(v), 3) for v in uv_to_pixel(point["uv"], SIZE, SIZE)]
    for part, spec in parts.items():
        polygon = np.array([points[n]["pixel"] for n in spec["polygon"]])
        # ピクセル座標（yが下向き）で時計回り＝UV（vが上向き）で反時計回りにそろえる。
        if signed_area(polygon) > 0:
            spec["polygon"] = spec["polygon"][::-1]
            polygon = polygon[::-1]
        xs, ys = np.meshgrid(
            np.arange(polygon[:, 0].min(), polygon[:, 0].max(), INTERIOR_SPACING_PX),
            np.arange(polygon[:, 1].min(), polygon[:, 1].max(), INTERIOR_SPACING_PX),
        )
        grid = np.column_stack([xs.ravel(), ys.ravel()])
        keep = point_in_polygon(polygon, grid) & (distance_to_boundary(polygon, grid) > 0.45 * INTERIOR_SPACING_PX)
        interior = []
        for k, xy in enumerate(grid[keep]):
            name = f"{part}:in{k:03d}"
            points[name] = {"kind": "interior", "pixel": [round(float(v), 3) for v in xy], "uv": [round(float(xy[0] / SIZE), 6), round(float(1 - xy[1] / SIZE), 6)]}
            interior.append(name)
        names = spec["polygon"] + interior
        coordinates = np.array([points[n]["pixel"] for n in names])
        triangles = []
        for triangle in delaunay(coordinates):
            corners = coordinates[list(triangle)]
            checks = np.vstack([corners.mean(axis=0), (corners + np.roll(corners, -1, axis=0)) / 2])
            inside = point_in_polygon(polygon, checks) | (distance_to_boundary(polygon, checks) < 0.5)
            longest = max(np.linalg.norm(corners - np.roll(corners, -1, axis=0), axis=1))
            # 縁に並んだ3点でできる細い三角形は、写真側の輪郭のわずかな揺れで裏返るので使わない。
            if inside.all() and abs(signed_area(corners)) > 0.02 * longest**2:
                triangles.append([names[i] for i in triangle])
        spec.update(
            {
                "interior_points": interior,
                "interior_method": "mean_value_embedding",
                "interior_rule": "写真側の内部点は、UV側の三角形の辺に沿った平均値座標の重みで、写真側のpolygonの点から解く（warp_support.mean_value_embedding）",
                "triangles": triangles,
                "orientation": "polygonはピクセル座標（yは下向き）で時計回り",
            }
        )
    return {"df2_table": df2_table(view), "segments": segments, "points": points, "parts": parts}


def rasterize(polygons, value, size=SIZE):
    image = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(image)
    for polygon in polygons:
        draw.polygon([tuple(p) for p in polygon], fill=value)
    return np.array(image)


def main():
    data, vertices, uv, faces, face_loops = load()
    by_side, kinds = classify(vertices, uv, faces, face_loops)
    paths_by_view = {"front": {}, "back": {}}
    island_masks = {}
    for side, members in sorted(by_side.items()):
        loop = boundary_loop(members, faces, face_loops, uv)
        for view, paths in leg_paths(loop, kinds, vertices, side, members, faces, face_loops, uv).items():
            paths_by_view[view][side] = paths
        island_masks[side] = rasterize([uv_to_pixel(uv[face_loops[f]], SIZE, SIZE) for f in members], 255) > 0
    views = {view: build_view(view, paths) for view, paths in paths_by_view.items()}

    masks = OUT / "masks"
    masks.mkdir(parents=True, exist_ok=True)
    all_uv = island_masks["left"] | island_masks["right"]
    part_id = np.zeros((SIZE, SIZE), np.uint8)
    for value, part in enumerate(PARTS, start=1):
        view, side = part.split("_")
        spec = views[view]["parts"][part]
        polygon = np.array([views[view]["points"][n]["pixel"] for n in spec["polygon"]])
        part_id[(rasterize([polygon], 255) > 0) & island_masks[side] & (part_id == 0)] = value
    # 折れ線と縁の間の、どの部位の多角形にも入らない細いすき間は、近い部位に含める。
    gap = all_uv & (part_id == 0)
    if gap.any():
        _, labels = cv2.distanceTransformWithLabels(np.where(part_id > 0, 0, 1).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        seeds = np.flatnonzero((part_id > 0).ravel())
        flat = part_id.ravel()
        flat[np.flatnonzero(gap.ravel())] = flat[seeds[labels[gap] - 1]]
    Image.fromarray(np.where(all_uv, 255, 0).astype(np.uint8)).save(masks / "all_uv.png")
    for side, mask in island_masks.items():
        Image.fromarray(np.where(mask, 255, 0).astype(np.uint8)).save(masks / f"island_leg_{side}.png")
    Image.fromarray(part_id).save(masks / "part_id.png")

    template = {
        "schema": "pitari-uv-template",
        "template_id": "pitari_trousers",
        "template_version": "2",
        "category": "trousers",
        "status": "テンプレートの作成まで。前後・左右の対応は実写1組でだけ確かめた",
        "generated_by": "artifacts/uv/pitari/scripts/build_trousers_template.py",
        "source": {key: data[key] for key in ("blend_file", "blender_version", "object", "mesh", "uv_map", "materials", "topology_sha256", "uvmap_sha256")},
        "coordinate_systems": "uv：左下が(0,0)、vは上向き。pixel：テクスチャの左上が(0,0)、yは下向き（uv_pixels.py）",
        "texture": {"width": SIZE, "height": SIZE, "format": "PNG", "color_space": "sRGB"},
        "islands": {f"leg_{side}": {"faces": len(by_side[side]), "mask": f"masks/island_leg_{side}.png"} for side in ("right", "left")},
        "part_id_image": {"path": "masks/part_id.png", "values": {str(v): p for v, p in enumerate(PARTS, start=1)} | {"0": "UV面なし"}},
        "coverage_spec": {"all_uv_mask": "masks/all_uv.png"},
        "df2_pairs": DF2_PAIRS,
        "df2_centers": DF2_CENTERS,
        "df2_spread_checks": [[1, 3], [6, 12]],
        "mask_smoothing_ratio": 0.015,
        "views": {
            view: {
                **spec,
                "photo_layout": "ズボンの前を上にして平置きし、ウエストを画像の上にして真上から撮る。画像の左が着用者の右脚"
                if view == "front"
                else "ズボンを左右に裏返して後ろを上にし、ウエストを画像の上にして真上から撮る。画像の左が着用者の左脚",
            }
            for view, spec in views.items()
        },
    }
    (OUT / "uv_template.json").write_text(json.dumps(template, ensure_ascii=False, indent=1), encoding="utf-8")

    check = OUT / "check"
    check.mkdir(exist_ok=True)
    colors = {0: (255, 255, 255), 1: (230, 120, 110), 2: (240, 180, 90), 3: (110, 150, 230), 4: (90, 190, 170)}
    image = np.zeros((SIZE, SIZE, 3), np.uint8)
    for value, color in colors.items():
        image[part_id == value] = color
    picture = Image.fromarray(image)
    draw = ImageDraw.Draw(picture)
    for view in views.values():
        for spec in view["parts"].values():
            for triangle in spec["triangles"]:
                draw.polygon([tuple(view["points"][n]["pixel"]) for n in triangle], outline=(255, 255, 255))
            for name in spec["polygon"]:
                x, y = view["points"][name]["pixel"]
                radius = 9 if view["points"][name]["kind"] == "anchor" else 4
                draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(30, 30, 30))
    picture.save(check / "template_parts.png")
    summary = {view: {part: {"polygon": len(s["polygon"]), "interior": len(s["interior_points"]), "triangles": len(s["triangles"])} for part, s in spec["parts"].items()} for view, spec in views.items()}
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
