"""受領したシャツのpitari UVから、写真の前面・背面を貼るためのテンプレートを作る。形はTシャツのuv_template.jsonと同じ。

使い方（リポジトリ直下）：
  ./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/build_shirt_template.py
入力はexport_shirt_mesh.pyの書き出し（shirt/data/mesh_export.json）と、受領したinputs/shirt/shirt_landmarks.json。
出力はshirt/uv_template.json・masks/・check/。

シャツのpitari UVは、前の面を正面から、後ろの面を背面から（着用者の左が画像の左）まっすぐ投影したもの
（assets/blender/pitari_shirt.py）。平置きの写真もほぼ真上から見た形なので、UVの島の外周を写真の服の輪郭に対応させる。
輪郭のたどり方は写真側（photo_to_texture.py）と同じ関数を使う。
"""

import colorsys
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
PROJECT = ROOT.parents[2]
OUT = ROOT / "shirt"
# テクスチャを貼るアプリのglb。このUVを正とする（ADR 0037）。
APP_GLB = "apps/web/public/models/shirt_male.glb"
sys.path.insert(0, str(SCRIPTS))
from photo_to_texture import contour_between, outer_contour, sample  # noqa: E402
from uv_pixels import pixel_to_uv, uv_to_pixel  # noqa: E402
from verify_trousers_assets import glb_arrays  # noqa: E402
from warp_support import delaunay, distance_to_boundary, point_in_polygon, signed_area  # noqa: E402

SIZE = 2048
# 輪郭に沿った点と内部点の間隔（テクスチャのピクセル）。
SAMPLE_SPACING_PX = 40
INTERIOR_SPACING_PX = 40
SIDES = ("right", "left")
PART_VALUES = {"front_body": 1, "back_body": 2, "sleeve_right_front": 3, "sleeve_right_back": 4, "sleeve_left_front": 5, "sleeve_left_back": 6}
# DeepFashion2のlong sleeve topの番号（ADR 0033）。組の先の番号が画像の左。
DF2_PAIRS = [[2, 6], [3, 5], [7, 33], [8, 32], [9, 31], [10, 30], [11, 29], [12, 28], [13, 27], [14, 26], [15, 25], [16, 24], [17, 23], [18, 22], [19, 21]]
DF2_CENTERS = [1, 4, 20]
DF2_SPREAD_CHECKS = [[7, 33], [11, 29], [12, 28], [16, 24], [19, 21]]
# 受領したshirtの面配列とUV配列のSHA-256。求め方はbuild_trousers_template.pyと同じで、mesh_info.jsonの値とは違う。
SOURCE_SHA256 = {
    "topology": "489aa0a5d98a796961ef5473ad9aa06695c0e2ba061cc4279780f194c117662a",
    "uvmap": "f3092f7ee7211d289783d1b650dae5468f80cb5935a458cf7a6954c7ab63f86b",
}


def glb_uv_sha256(path):
    """glbのUV（TEXCOORD_0）のSHA-256。型紙に記録し、glbのUVが変わったら気づけるようにする。"""
    document, read = glb_arrays(path)
    primitive = document["meshes"][0]["primitives"][0]
    return hashlib.sha256(read(primitive["attributes"]["TEXCOORD_0"]).astype("<f4").tobytes()).hexdigest()


def df2_table(view):
    # 前面の写真では画像の左が着用者の右、背面の写真では着用者の左。
    near, far = ("right", "left") if view == "front" else ("left", "right")
    numbers = {"2": "neck_side", "7": "shoulder", "11": "cuff_top", "12": "cuff_bottom", "16": "armpit", "19": "hem_side"}
    mirrored = {"6": "neck_side", "33": "shoulder", "29": "cuff_top", "28": "cuff_bottom", "24": "armpit", "21": "hem_side"}
    table = {number: {"anchor": f"{name}_{near}", "use": "warp"} for number, name in numbers.items()}
    table |= {number: {"anchor": f"{name}_{far}", "use": "warp"} for number, name in mirrored.items()}
    table["20"] = {"anchor": f"hem_center_{view}", "use": "warp"}
    if view == "front":
        table["4"] = {"anchor": "front_neck_center", "use": "warp", "note": "襟元のV字の一番下"}
    return table


def load():
    data = json.loads((OUT / "data/mesh_export.json").read_text(encoding="utf-8"))
    faces = [face["vertices"] for face in data["faces"]]
    # 別のメッシュから作ると、アプリのGLBのUVと合わないテンプレートになる
    for name, value in (("topology", faces), ("uvmap", data["uv"]["pitari"])):
        digest = hashlib.sha256(json.dumps(value, separators=(",", ":")).encode()).hexdigest()
        if digest != SOURCE_SHA256[name]:
            raise SystemExit(f"mesh_export.jsonの{name}が受領したシャツと違います。メッシュを変えた場合は、SOURCE_SHA256とテンプレートの版を更新してください")
    landmarks = json.loads((ROOT / "inputs/shirt/shirt_landmarks.json").read_text(encoding="utf-8"))
    return data, landmarks, np.array(data["vertices"]), np.array(data["uv"]["pitari"]), faces, [face["loops"] for face in data["faces"]]


def projections(vertices, uv, faces, face_loops, view_of_face):
    """島ごとに、3Dの(x, z)からUVへのまっすぐな投影を当てはめる。島に入っていない頂点もUVへ写せる。"""
    result = {}
    for view in ("front", "back"):
        pairs = [(v, loop) for f, (face, loops) in enumerate(zip(faces, face_loops)) if view_of_face[f] == view for v, loop in zip(face, loops)]
        xz = np.array([vertices[v][[0, 2]] for v, _ in pairs])
        target = np.array([uv[loop] for _, loop in pairs])
        fits = [np.linalg.lstsq(np.column_stack([xz[:, k], np.ones(len(xz))]), target[:, k], rcond=None)[0] for k in (0, 1)]
        error = max(float(np.abs(xz[:, k] * fits[k][0] + fits[k][1] - target[:, k]).max()) for k in (0, 1))
        if error > 1e-4:
            raise SystemExit(f"{view}のUVが3Dからのまっすぐな投影になっていません（誤差{error:.5f}）")
        result[view] = lambda point, fits=fits: uv_to_pixel([point[0] * fits[0][0] + fits[0][1], point[2] * fits[1][0] + fits[1][1]], SIZE, SIZE)
    return result


def rasterize(polygons_by_value, size=SIZE):
    image = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(image)
    for value, polygons in polygons_by_value.items():
        for polygon in polygons:
            draw.polygon([tuple(p) for p in polygon], fill=value)
    return np.array(image)


def seam_curve(view, side, kinds, view_of_face, faces, vertices, project, start, end):
    """袖と身頃の境目（袖付け）を、肩先から脇へ並べた曲線。"""
    edge_faces = defaultdict(list)
    for f, face in enumerate(faces):
        for k in range(len(face)):
            edge_faces[tuple(sorted((face[k], face[(k + 1) % len(face)])))].append(f)
    sleeve = f"sleeve_{side}"
    seam = {v for edge, fs in edge_faces.items() if len(fs) == 2 and all(view_of_face[f] == view for f in fs) and sorted(kinds[f] for f in fs) == sorted([sleeve, "body"]) for v in edge}
    if not seam:
        raise SystemExit(f"{view}の{side}の袖付けが見つかりません")
    direction = end - start
    points = [project(vertices[v]) for v in seam]
    t = [float((p - start) @ direction / (direction @ direction)) for p in points]
    inner = [p for p, s in sorted(zip(points, t), key=lambda item: item[1]) if 0 < s < 1]
    return np.vstack([start, *inner, end])


def build_view(view, contour, project, landmarks, vertices, kinds, view_of_face, faces):
    """固定点・区間・部位を、テクスチャのピクセル座標で作る。"""

    def on_contour(xy):
        return contour[int(np.argmin(((contour - xy) ** 2).sum(axis=1)))]

    anchors = {}
    for side in SIDES:
        outward = 1.0 if side == "left" else -1.0
        info = landmarks["sides"][side]
        anchors[f"shoulder_{side}"] = on_contour(project(vertices[info["shoulder_tip"]]))
        anchors[f"armpit_{side}"] = on_contour(project(vertices[info["armpit"]]))
        anchors[f"cuff_top_{side}"] = on_contour(project(vertices[max(info["cuff"], key=lambda v: vertices[v][2])]))
        anchors[f"cuff_bottom_{side}"] = on_contour(project(vertices[min(info["cuff"], key=lambda v: vertices[v][2])]))
        anchors[f"hem_side_{side}"] = on_contour(project(vertices[max(landmarks["hem"], key=lambda v: outward * vertices[v][0])]))
        # 襟の付け根（身頃と襟の縫い目）の外側の端。
        anchors[f"neck_side_{side}"] = on_contour(project(vertices[max(landmarks["neck"], key=lambda v: outward * vertices[v][0])]))

    def between(start, end, *also):
        exclude = {start, end, *also}
        blocked = {int(np.argmin(((contour - xy) ** 2).sum(axis=1))) for name, xy in anchors.items() if name not in exclude}
        path, clean = contour_between(contour, anchors[start], anchors[end], blocked)
        if not clean:
            raise SystemExit(f"{view}：{start}から{end}への輪郭がほかの固定点を通ります")
        return path

    # 写真側（photo_to_texture.photo_points）と同じく、裾と後ろ襟の中心は両端の間の輪郭の中点にする。
    anchors[f"hem_center_{view}"] = sample(between("hem_side_right", "hem_side_left"), [0.5])[0]
    neck_end = "front_neck_center" if view == "front" else "back_neck_center"
    top = between("neck_side_right", "neck_side_left")
    # 前は襟元がV字に開いているので、その一番下。
    anchors[neck_end] = top[np.argmax(top[:, 1])] if view == "front" else sample(top, [0.5])[0]

    segments = []
    for side in SIDES:
        sleeve_part = f"sleeve_{side}_{view}"
        neckline = between(f"neck_side_{side}", neck_end) if view == "back" else np.array([anchors[f"neck_side_{side}"], anchors[neck_end]])
        for name, start, end, method, parts, polyline in [
            ("shoulder_seam", f"neck_side_{side}", f"shoulder_{side}", "contour", [f"{view}_body"], None),
            ("armhole", f"shoulder_{side}", f"armpit_{side}", "seam_curve", [f"{view}_body", sleeve_part], "seam"),
            ("sleeve_top", f"shoulder_{side}", f"cuff_top_{side}", "contour", [sleeve_part], None),
            ("cuff", f"cuff_top_{side}", f"cuff_bottom_{side}", "contour", [sleeve_part], None),
            ("sleeve_under", f"cuff_bottom_{side}", f"armpit_{side}", "contour", [sleeve_part], None),
            ("side", f"armpit_{side}", f"hem_side_{side}", "contour", [f"{view}_body"], None),
            ("hem", f"hem_side_{side}", f"hem_center_{view}", "contour", [f"{view}_body"], None),
            # 前の襟元は写真では襟の内側が見えて輪郭に出ないので、両端を直線で結ぶ。V字より上の襟の先は近くの色で補う。
            ("neckline", f"neck_side_{side}", neck_end, "contour" if view == "back" else "straight", [f"{view}_body"], neckline),
        ]:
            if polyline is None:
                polyline = between(start, end)
            elif isinstance(polyline, str):
                polyline = seam_curve(view, side, kinds, view_of_face, faces, vertices, project, anchors[start], anchors[end])
            segments.append({"name": f"{name}_{side}", "start": start, "end": end, "photo_method": method, "parts": parts, "polyline": polyline})
    return anchors, segments


def walk(by_name, steps):
    """区間を順にたどった多角形の点の名前。stepsは(区間の名前, 向き)の列で、前の区間の終わりから次が始まる。"""
    names = []
    for name, forward in steps:
        segment = by_name[name]
        samples = [s["name"] for s in segment["samples"]]
        names += [segment["start"]] + samples if forward else [segment["end"]] + samples[::-1]
    return names


def finish_view(view, anchors, segments):
    points = {name: {"kind": "anchor", "pixel": xy} for name, xy in anchors.items()}
    for segment in segments:
        polyline = segment.pop("polyline")
        length = float(np.sum(np.linalg.norm(np.diff(polyline, axis=0), axis=1)))
        count = max(1, round(length / SAMPLE_SPACING_PX) - 1)
        fractions = [k / (count + 1) for k in range(1, count + 1)]
        segment["samples"] = []
        for k, (fraction, xy) in enumerate(zip(fractions, sample(polyline, fractions)), start=1):
            name = f"{segment['name']}#{k}"
            points[name] = {"kind": "sample", "pixel": xy, "segment": segment["name"], "fraction": round(fraction, 6)}
            # 投影なので、UV上の長さの割合と3Dを見た形の長さの割合は同じ。
            segment["samples"].append({"name": name, "fraction": round(fraction, 6), "fraction_uv": round(fraction, 6)})
        segment["length_px"] = round(length, 1)
        segment["uv_polyline"] = [[round(float(u), 6), round(float(v), 6)] for u, v in pixel_to_uv(polyline, SIZE, SIZE)]
    by_name = {s["name"]: s for s in segments}
    polygons = {
        f"{view}_body": walk(by_name, [("shoulder_seam_right", True), ("armhole_right", True), ("side_right", True), ("hem_right", True), ("hem_left", False), ("side_left", False), ("armhole_left", False), ("shoulder_seam_left", False), ("neckline_left", True), ("neckline_right", False)]),
    }
    for side in SIDES:
        polygons[f"sleeve_{side}_{view}"] = walk(by_name, [(f"sleeve_top_{side}", True), (f"cuff_{side}", True), (f"sleeve_under_{side}", True), (f"armhole_{side}", False)])
    for part, names in polygons.items():
        if len(set(names)) != len(names):
            raise SystemExit(f"{view}：{part}の多角形の点が重なっています")

    parts = {}
    for part, names in polygons.items():
        polygon = np.array([points[n]["pixel"] for n in names])
        # ピクセル座標（yが下向き）で時計回り＝UV（vが上向き）で反時計回りにそろえる。
        if signed_area(polygon) > 0:
            names, polygon = names[::-1], polygon[::-1]
        xs, ys = np.meshgrid(
            np.arange(polygon[:, 0].min(), polygon[:, 0].max(), INTERIOR_SPACING_PX),
            np.arange(polygon[:, 1].min(), polygon[:, 1].max(), INTERIOR_SPACING_PX),
        )
        grid = np.column_stack([xs.ravel(), ys.ravel()])
        keep = point_in_polygon(polygon, grid) & (distance_to_boundary(polygon, grid) > 0.45 * INTERIOR_SPACING_PX)
        interior = []
        for k, xy in enumerate(grid[keep]):
            name = f"{part}:in{k:03d}"
            points[name] = {"kind": "interior", "pixel": xy}
            interior.append(name)
        everything = names + interior
        coordinates = np.array([points[n]["pixel"] for n in everything])
        triangles = []
        for triangle in delaunay(coordinates):
            corners = coordinates[list(triangle)]
            checks = np.vstack([corners.mean(axis=0), (corners + np.roll(corners, -1, axis=0)) / 2])
            inside = point_in_polygon(polygon, checks) | (distance_to_boundary(polygon, checks) < 0.5)
            longest = max(np.linalg.norm(corners - np.roll(corners, -1, axis=0), axis=1))
            # 縁に並んだ3点でできる細い三角形は、写真側の輪郭のわずかな揺れで裏返るので使わない。
            if inside.all() and abs(signed_area(corners)) > 0.02 * longest**2:
                triangles.append([everything[i] for i in triangle])
        parts[part] = {
            "polygon": names,
            "interior_points": interior,
            "interior_method": "mean_value_embedding",
            "interior_rule": "写真側の内部点は、UV側の三角形の辺に沿った平均値座標の重みで、写真側のpolygonの点から解く（warp_support.mean_value_embedding）",
            "triangles": triangles,
            "orientation": "polygonはピクセル座標（yは下向き）で時計回り",
        }
    for point in points.values():
        point["pixel"] = [round(float(v), 3) for v in point["pixel"]]
        point["uv"] = [round(float(v), 6) for v in pixel_to_uv(point["pixel"], SIZE, SIZE)]
    return {"df2_table": df2_table(view), "segments": segments, "points": points, "parts": parts}


def check_grid(all_uv):
    """合成写真の自己テスト（selftest_synthetic.py）で写真の代わりに使う色の格子。"""
    cells = 32
    step = SIZE // cells
    rows, cols = np.mgrid[0:SIZE, 0:SIZE] // step
    colors = np.array([[colorsys.hsv_to_rgb(c / cells, 0.65 if r % 4 < 2 else 0.35, 0.6 + 0.4 * (r % 2)) for c in range(cells)] for r in range(cells)])
    grid = (colors[rows, cols] * 255).astype(np.uint8)
    lines = (np.mgrid[0:SIZE, 0:SIZE] % step < 3).any(axis=0)
    grid[lines] = 0
    grid[~all_uv] = 255
    return grid


def main():
    data, landmarks, vertices, uv, faces, face_loops = load()
    view_of_face = ["front" if uv[loops, 1].mean() > 0.5 else "back" for loops in face_loops]
    sleeves = {side: set(landmarks["sleeve_verts"][side]) for side in SIDES}
    kinds = [next((f"sleeve_{side}" for side in SIDES if set(face) <= sleeves[side]), "body") for face in faces]
    project = projections(vertices, uv, faces, face_loops, view_of_face)
    face_pixels = [uv_to_pixel(uv[loops], SIZE, SIZE) for loops in face_loops]

    masks = OUT / "masks"
    masks.mkdir(parents=True, exist_ok=True)
    islands = {view: rasterize({255: [p for p, v in zip(face_pixels, view_of_face) if v == view]}) > 0 for view in ("front", "back")}
    all_uv = islands["front"] | islands["back"]
    part_id = rasterize({value: [p for p, v, k in zip(face_pixels, view_of_face, kinds) if f"{v}_body" == part or f"{k}_{v}" == part] for part, value in PART_VALUES.items()})
    Image.fromarray(np.where(all_uv, 255, 0).astype(np.uint8)).save(masks / "all_uv.png")
    for view, mask in islands.items():
        Image.fromarray(np.where(mask, 255, 0).astype(np.uint8)).save(masks / f"island_{view}.png")
    Image.fromarray(part_id).save(masks / "part_id.png")

    views, anchors_by_view = {}, {}
    for view in ("front", "back"):
        contour = outer_contour(np.where(islands[view], 255, 0).astype(np.uint8))
        anchors, segments = build_view(view, contour, project[view], landmarks, vertices, kinds, view_of_face, faces)
        views[view] = finish_view(view, anchors, segments)
        anchors_by_view[view] = {name: views[view]["points"][name] for name in anchors}

    # 三角形がUVの面のどれだけを覆うか。覆わない所（前の襟の先など）は、写真の色ではなく近くの色で補われる。
    covered = rasterize({255: [[views[v]["points"][n]["pixel"] for n in t] for v in views for p in views[v]["parts"].values() for t in p["triangles"]]}) > 0
    template = {
        "schema": "pitari-uv-template",
        "template_id": "pitari-shirt",
        "template_version": "1",
        "category": "shirt",
        "status": "テンプレートの作成まで。合成写真で確かめた。実写の点の位置（特に襟元の2・4・6番）は未検証",
        "generated_by": "artifacts/uv/pitari/scripts/build_shirt_template.py",
        "source": {"blend_file": "artifacts/uv/pitari/inputs/shirt/pitari_shirt.blend", "object": data["object"], "mesh": data["mesh"], "uv_map": "pitari", "materials": data["materials"], "topology_sha256": SOURCE_SHA256["topology"], "uvmap_sha256": SOURCE_SHA256["uvmap"], "app_glb": {"path": APP_GLB, "uv_sha256": glb_uv_sha256(PROJECT / APP_GLB)}},
        "coordinate_systems": "uv：左下が(0,0)、vは上向き。pixel：テクスチャの左上が(0,0)、yは下向き（uv_pixels.py）",
        "texture": {"width": SIZE, "height": SIZE, "format": "PNG", "color_space": "sRGB"},
        "islands": {view: {"faces": view_of_face.count(view), "mask": f"masks/island_{view}.png"} for view in ("front", "back")},
        "part_id_image": {"path": "masks/part_id.png", "values": {str(v): p for p, v in PART_VALUES.items()} | {"0": "UV面なし"}},
        "coverage_spec": {"all_uv_mask": "masks/all_uv.png"},
        "anchors": {name: {"uv_by_view": {view: {"uv": anchors_by_view[view][name]["uv"], "pixel": anchors_by_view[view][name]["pixel"]} for view in anchors_by_view if name in anchors_by_view[view]}} for name in {n for a in anchors_by_view.values() for n in a}},
        "df2_pairs": DF2_PAIRS,
        "df2_centers": DF2_CENTERS,
        "df2_spread_checks": DF2_SPREAD_CHECKS,
        "views": {
            view: {
                **spec,
                "photo_layout": "シャツの前を上にしてボタンを留めて平置きし、襟を画像の上にして真上から撮る。画像の左が着用者の右"
                if view == "front"
                else "シャツを裏返して後ろを上にし、襟を画像の上にして真上から撮る。画像の左が着用者の左",
            }
            for view, spec in views.items()
        },
        "checks": {
            "triangles_cover_uv": round(float((covered & all_uv).sum() / all_uv.sum()), 4),
            "parts_cover_uv": bool(((part_id > 0) == all_uv).all()),
        },
    }
    (OUT / "uv_template.json").write_text(json.dumps(template, ensure_ascii=False, indent=1), encoding="utf-8")

    check = OUT / "check"
    check.mkdir(exist_ok=True)
    Image.fromarray(check_grid(all_uv)).save(check / "check_grid.png")
    colors = {0: (255, 255, 255), 1: (150, 210, 150), 2: (120, 180, 120), 3: (120, 160, 240), 4: (90, 130, 210), 5: (240, 160, 120), 6: (210, 130, 90)}
    picture = Image.fromarray(np.array([colors[v] for v in range(7)], np.uint8)[part_id])
    draw = ImageDraw.Draw(picture)
    for view in views.values():
        for spec in view["parts"].values():
            for triangle in spec["triangles"]:
                draw.polygon([tuple(view["points"][n]["pixel"]) for n in triangle], outline=(255, 255, 255))
        for name, point in view["points"].items():
            if point["kind"] == "anchor":
                x, y = point["pixel"]
                draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(200, 0, 0))
                draw.text((x + 12, y - 12), name, fill=(0, 0, 0))
    picture.save(check / "template_parts.png")
    summary = {view: {part: {"polygon": len(s["polygon"]), "interior": len(s["interior_points"]), "triangles": len(s["triangles"])} for part, s in spec["parts"].items()} for view, spec in views.items()}
    print(json.dumps({"parts": summary, "checks": template["checks"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
