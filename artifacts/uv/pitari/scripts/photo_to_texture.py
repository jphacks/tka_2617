"""服の前面・背面の写真を、UVテンプレートでpitariの半袖トップスのテクスチャへ変換する（試行用）。

使い方（リポジトリ直下のPowerShell）：
  ./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/photo_to_texture.py --front 前面.jpg --back 背面.jpg --out artifacts/uv/pitari/trials/try1

1回目は既存の推論（apps/inferenceのGrounding DINOとHRNet）で、服の範囲・ランドマーク・服の領域を求める。
点がずれていたら、出力のpoints_front.jsonの座標を直して --front-points で渡す。
服の領域がずれていたら、mask_front.pngを塗り直して --front-mask で渡す。背面も同じ。
"""

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
PROJECT = ROOT.parents[2]
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(PROJECT / "apps/inference"))
from uv_pixels import opencv_to_pixel, pixel_to_opencv, uv_to_pixel  # noqa: E402
from warp_support import mean_value_weights, signed_area, triangle_mask  # noqa: E402

# 撮影画面と同じく、向きを確定してから長辺1600px以下に縮小する。
LONG_SIDE = 1600
# 服の縁で背景の色を拾わないよう、服の領域を少し内側へ縮めてから使う。
# 2pxでは実写の脇の下で背景の白が残ったため4pxにした。
MASK_ERODE_PX = 4
# 写真から取れなかったテクセルを、近くの色で補う最大距離（テクスチャのpx）。
FILL_LIMIT_PX = 64
PAD_PX = 8
# 輪郭の点から離れすぎたランドマークは、点か服の領域の誤りを疑う。
FAR_FROM_CONTOUR_PX = 30
PAIRS = [(2, 6), (3, 5), (7, 25), (8, 24), (9, 23), (10, 22), (11, 21), (12, 20), (13, 19), (14, 18), (15, 17)]
FONT = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"


def load_photo(path):
    with Image.open(path) as original:
        orientation = original.getexif().get(274, 1)
        upright = ImageOps.exif_transpose(original).convert("RGB")
    scale = min(1.0, LONG_SIDE / max(upright.size))
    upright_size = list(upright.size)
    if scale < 1:
        upright = upright.resize((round(upright.width * scale), round(upright.height * scale)), Image.LANCZOS)
    info = {
        "file": Path(path).name,
        "exifOrientation": orientation,
        "uprightSize": upright_size,
        # EXIFの向きを適用した元画像から、この画像への変換。
        "transformFromSource": [[scale, 0, 0], [0, scale, 0], [0, 0, 1]],
    }
    return cv2.cvtColor(np.array(upright), cv2.COLOR_RGB2BGR), info


def garment_mask(image, bbox, paper_corners):
    """apps/inference/pitari/cutout.pyと同じGrabCutで、写真と同じ大きさの服の領域を返す（切り詰めない）。"""
    height, width = image.shape[:2]
    scale = min(1.0, 900 / max(height, width))
    small = cv2.resize(image, (round(width * scale), round(height * scale)))
    h, w = small.shape[:2]
    x1, y1, x2, y2 = np.rint(np.array(bbox) * scale).astype(int)
    x1, y1, x2, y2 = max(1, x1), max(1, y1), min(w - 2, x2), min(h - 2, y2)
    mask = np.full((h, w), cv2.GC_BGD, dtype=np.uint8)
    mask[y1 : y2 + 1, x1 : x2 + 1] = cv2.GC_PR_FGD
    if len(paper_corners) == 4:
        cv2.fillConvexPoly(mask, np.rint(np.array(paper_corners) * scale).astype(np.int32), cv2.GC_BGD)
    cv2.grabCut(small, mask, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    alpha = np.isin(mask, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(alpha)
    if count < 2:
        raise SystemExit("服と背景を分離できませんでした。--front-bboxで服の範囲を指定してください")
    alpha = (labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8) * 255
    return cv2.resize(alpha, (width, height), interpolation=cv2.INTER_NEAREST)


class Inference:
    """既存の推論を、HTTPを通さず同じ関数で呼ぶ。初回だけモデルを読み込む。"""

    def __init__(self):
        self.models = None

    def run(self, image, bbox):
        from pitari.geometry import paper_candidate
        from pitari.models import MODEL_VERSION, Models

        if self.models is None:
            print("推論モデルを読み込んでいます（初回は数十秒かかります）")
            self.models = Models()
        corners = paper_candidate(image)
        if bbox is None:
            _, bbox = self.models.detect(image, "short_sleeve_top")
        points = self.models.landmarks(image, "short_sleeve_top", bbox)
        return {"bbox": [float(v) for v in bbox], "paperCorners": [[float(x), float(y)] for x, y in corners], "points": points, "modelVersion": MODEL_VERSION}


def resolve_anchors(view, points, template, notes, garment_width):
    """DeepFashion2の番号から固定点を決める。左右のペアは番号でなく写真上のxで決め直す。"""
    table = template["views"][view]["df2_short_sleeve_top"]
    by_id = {int(p["id"]): opencv_to_pixel([p["x"], p["y"]]) for p in points}
    anchors = {}
    # 肩先・袖口・脇・裾の角の左右が近すぎるときは、両方を同じ袖などに置いた推定の失敗を疑う。
    for low, high in ((7, 25), (9, 23), (10, 22), (12, 20), (15, 17)):
        if low in by_id and high in by_id and abs(by_id[low][0] - by_id[high][0]) < 0.25 * garment_width:
            notes.append(f"警告：{low}番と{high}番が左右で近すぎる（推定の失敗の可能性が高い）。debug_photo_{view}.jpgを見て点を直す")

    def put(number, xy):
        entry = table[str(number)]
        if entry["anchor"] and entry["use"] != "not_on_this_view":
            anchors[entry["anchor"]] = np.asarray(xy, dtype=float)

    for low, high in PAIRS:
        if low in by_id and high in by_id:
            a, b = by_id[low], by_id[high]
            if a[0] > b[0]:
                notes.append(f"{low}番と{high}番が画像の左右逆だったため入れ替えた")
                a, b = b, a
            # 公式の図では小さい番号が画像の左。
            put(low, a)
            put(high, b)
        elif low in by_id or high in by_id:
            number = low if low in by_id else high
            notes.append(f"{number}番の相方がないため、左右を確かめずに使った")
            put(number, by_id[number])
    for number in (1, 4, 16):
        if number in by_id:
            put(number, by_id[number])
    return anchors


def fill_holes(mask):
    """服の領域の内側の穴を埋める。背景と同じ色の柄（白い文字など）が穴として抜けるため。一番大きな領域だけ残す。"""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(mask)
    cv2.drawContours(filled, [max(contours, key=cv2.contourArea)], -1, 255, thickness=cv2.FILLED)
    return filled


def outer_contour(mask):
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    contour = max(contours, key=cv2.contourArea)[:, 0, :].astype(float)
    # 拡大した切り抜きの段差をならす（輪に沿った移動平均）。
    kernel = 7
    padded = np.concatenate([contour[-kernel:], contour, contour[:kernel]])
    smooth = np.stack([np.convolve(padded[:, k], np.ones(kernel) / kernel, mode="same") for k in (0, 1)], axis=1)
    return opencv_to_pixel(smooth[kernel:-kernel])


def nearest(contour, xy):
    return int(np.argmin(((contour - xy) ** 2).sum(axis=1)))


def contour_between(contour, start, end, blocked):
    """輪郭上でstartからendへ向かう経路。ほかの固定点を通らない向きを選ぶ。"""
    n = len(contour)
    i, j = nearest(contour, start), nearest(contour, end)
    forward = [(i + k) % n for k in range((j - i) % n + 1)]
    backward = [(i - k) % n for k in range((i - j) % n + 1)]
    clean = [path for path in (forward, backward) if not blocked.intersection(path[1:-1])]
    path = min(clean or [forward, backward], key=len)
    return np.vstack([start, contour[path[1:-1]], end]), bool(clean)


def sample(polyline, fractions):
    distance = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(polyline, axis=0), axis=1))])
    if distance[-1] == 0:
        return np.repeat(polyline[:1], len(fractions), axis=0)
    t = np.asarray(fractions) * distance[-1]
    return np.stack([np.interp(t, distance, polyline[:, 0]), np.interp(t, distance, polyline[:, 1])], axis=1)


def place_like(curve, start, end):
    """曲線を、両端がstartとendに重なるよう回転・拡大・平行移動する（反転しない）。"""
    z = curve[:, 0] + 1j * curve[:, 1]
    a0, a1 = z[0], z[-1]
    b0, b1 = complex(*start), complex(*end)
    w = (b1 - b0) / (a1 - a0) * (z - a0) + b0
    return np.stack([w.real, w.imag], axis=1)


def neckline(start, middle, end):
    """3点を通る2次ベジエ曲線。中間の点がなければ直線。"""
    if middle is None:
        return np.array([start, end])
    control = 2 * middle - (start + end) / 2
    t = np.linspace(0, 1, 41)[:, None]
    return (1 - t) ** 2 * start + 2 * (1 - t) * t * control + t**2 * end


def photo_points(view, anchors, contour, template, notes, fraction_key):
    """テンプレートの点の名前ごとに、写真上の位置を求める。推定で置いた点の名前も返す。"""
    spec = template["views"][view]
    segments = spec["segments"]
    contour_anchors = {name for s in segments if s["photo_method"] == "contour" for name in (s["start"], s["end"])}

    def blocked(*exclude):
        return {nearest(contour, anchors[n]) for n in contour_anchors if n in anchors and n not in exclude}

    # 写真から直接は出ない点を、輪郭や他の点から決める。
    if f"hem_center_{view}" not in anchors and {"hem_side_right", "hem_side_left"} <= set(anchors):
        path, _ = contour_between(contour, anchors["hem_side_right"], anchors["hem_side_left"], blocked("hem_side_right", "hem_side_left"))
        anchors[f"hem_center_{view}"] = sample(path, [0.5])[0]
        notes.append("裾の中心（16番）がないため、裾の輪郭の中点で代用した")
    if view == "back" and {"neck_side_right", "neck_side_left"} <= set(anchors):
        path, _ = contour_between(contour, anchors["neck_side_right"], anchors["neck_side_left"], blocked("neck_side_right", "neck_side_left", "back_neck_center"))
        anchors["back_neck_center"] = sample(path, [0.5])[0]
    estimated = set()
    by_name = {s["name"]: s for s in segments}
    size = template["texture"]["width"]

    def uv_curve(*names):
        polylines = [np.array(by_name[n]["uv_polyline"]) for n in names]
        return uv_to_pixel(np.vstack([polylines[0]] + [p[1:] for p in polylines[1:]]), size, size)

    for side in ("right", "left"):
        name = f"aux_armhole_mid_{side}_{view}"
        if name not in anchors and {f"shoulder_{side}", f"armpit_{side}"} <= set(anchors):
            # 袖付けの曲線全体を肩先と脇に合わせて置く。中点は上半分の曲線の終点。
            curve = uv_curve(f"armhole_{side}_upper", f"armhole_{side}_lower")
            middle = len(by_name[f"armhole_{side}_upper"]["uv_polyline"]) - 1
            anchors[name] = place_like(curve, anchors[f"shoulder_{side}"], anchors[f"armpit_{side}"])[middle]
        estimated.add(name)

    required = {name for s in segments for name in (s["start"], s["end"])}
    missing = sorted(required - set(anchors))
    if missing:
        numbers = sorted({int(k) for k, v in spec["df2_short_sleeve_top"].items() if v["anchor"] in missing})
        raise SystemExit(f"{view}：点が足りません。points_{view}.jsonに次の番号を追加してください：{numbers}（{missing}）")
    for name in required & contour_anchors:
        distance = np.linalg.norm(contour[nearest(contour, anchors[name])] - anchors[name])
        if distance > FAR_FROM_CONTOUR_PX:
            notes.append(f"{name}が服の輪郭から{distance:.0f}px離れている。点か服の領域を確認する")

    points = dict(anchors)
    for segment in segments:
        start, end = anchors[segment["start"]], anchors[segment["end"]]
        method = segment["photo_method"]
        if method == "contour":
            polyline, clean = contour_between(contour, start, end, blocked(segment["start"], segment["end"]))
            if not clean:
                notes.append(f"{segment['name']}：輪郭の向きを決められず、短い方を使った")
        elif method == "neckline_curve":
            side = "right" if segment["name"].endswith("right") else "left"
            polyline = neckline(start, anchors.get(f"front_neck_mid_{side}"), end)
            if f"front_neck_mid_{side}" not in anchors:
                notes.append(f"{segment['name']}：3・5番がないため直線で代用した")
        else:
            polyline = place_like(uv_curve(segment["name"]), start, end)
        names = [s["name"] for s in segment["samples"]]
        for name, xy in zip(names, sample(polyline, [s[fraction_key] for s in segment["samples"]])):
            points[name] = xy
        if method != "contour":
            estimated.update(names)

    # 内部点：UV側の輪郭で求めた平均値座標の重みを、写真側の輪郭の点に掛ける。
    template_points = spec["points"]
    for part in spec["parts"].values():
        uv_polygon = np.array([template_points[n]["uv"] for n in part["polygon"]])
        uv_interior = np.array([template_points[n]["uv"] for n in part["interior_points"]])
        weights = mean_value_weights(uv_polygon, uv_interior)
        photo_polygon = np.array([points[n] for n in part["polygon"]])
        for name, xy in zip(part["interior_points"], weights @ photo_polygon):
            points[name] = xy
    return points, estimated


def warp_view(view, photo, garment, points, estimated, template, part_id, part_values):
    """テンプレートの三角形ごとにアフィン変換し、写真の色をテクスチャへ写す。"""
    size = part_id.shape[0]
    map_x = np.full((size, size), -1.0, np.float32)
    map_y = np.full((size, size), -1.0, np.float32)
    written = np.zeros((size, size), bool)
    low = np.zeros((size, size), bool)
    spec = template["views"][view]
    flipped = []
    for part, part_spec in spec["parts"].items():
        part_mask = part_id == part_values[part]
        for triangle in part_spec["triangles"]:
            source = np.array([spec["points"][n]["pixel"] for n in triangle])
            target = np.array([points[n] for n in triangle])
            # テクスチャも写真もyが下向きなので、同じ三角形は同じ向きになる。
            if signed_area(source) * signed_area(target) <= 0:
                flipped.append(triangle)
                continue
            x0, y0 = np.floor(source.min(axis=0)).astype(int)
            x1, y1 = np.ceil(source.max(axis=0)).astype(int)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, size - 1), min(y1, size - 1)
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            window = (slice(y0, y1 + 1), slice(x0, x1 + 1))
            inside = triangle_mask(source, xs, ys) & part_mask[window] & ~written[window]
            if not inside.any():
                continue
            affine = np.linalg.solve(np.column_stack([source, np.ones(3)]), target)
            mapped = pixel_to_opencv(np.column_stack([xs[inside], ys[inside], np.ones(inside.sum())]) @ affine)
            map_x[window][inside] = mapped[:, 0]
            map_y[window][inside] = mapped[:, 1]
            written[window] |= inside
            if estimated.intersection(triangle):
                low[window] |= inside
    eroded = cv2.erode(garment, np.ones((2 * MASK_ERODE_PX + 1,) * 2, np.uint8))
    colors = cv2.remap(photo, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    inside_garment = cv2.remap(eroded, map_x, map_y, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0) > 0
    observed = written & inside_garment
    return colors, observed, low & observed, flipped


def nearest_fill(rgb, seeds, targets, limit):
    """targetsの各テクセルへ、limit以内で最も近いseedsの色を写す。写したテクセルを返す。"""
    if not seeds.any():
        return np.zeros(seeds.shape, bool)
    distance, labels = cv2.distanceTransformWithLabels(np.where(seeds, 0, 1).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    # ラベルは、seedsの画素をラスター順に数えた番号（1始まり）。
    seed_index = np.flatnonzero(seeds.ravel())
    chosen = targets & (distance <= limit)
    flat = rgb.reshape(-1, 3)
    flat[np.flatnonzero(chosen.ravel())] = flat[seed_index[labels[chosen] - 1]]
    return chosen


def save_mask(mask, path):
    Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L").save(path)


def draw_debug(view, photo, garment, raw_points, anchors, points, estimated, template, path):
    image = Image.fromarray(cv2.cvtColor(photo, cv2.COLOR_BGR2RGB)).convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    contours, _ = cv2.findContours(garment, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for contour in contours:
        draw.line([tuple(p) for p in contour[:, 0, :].tolist()] + [tuple(contour[0, 0].tolist())], fill=(0, 220, 0, 255), width=2)
    spec = template["views"][view]
    for part in spec["parts"].values():
        for triangle in part["triangles"]:
            xy = [tuple(points[n]) for n in triangle]
            draw.polygon(xy, outline=(255, 255, 255, 110))
        for name in part["polygon"]:
            x, y = points[name]
            color = (255, 200, 0, 255) if name in estimated else (0, 120, 255, 255)
            draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=color)
    font = ImageFont.truetype(FONT, 22)
    for p in raw_points:
        x, y = opencv_to_pixel([p["x"], p["y"]])
        draw.ellipse((x - 6, y - 6, x + 6, y + 6), outline=(255, 0, 0, 255), width=3)
        draw.text((x + 8, y - 24), str(p["id"]), font=font, fill=(255, 0, 0, 255), stroke_width=3, stroke_fill=(255, 255, 255, 255))
    labels = {"right": "着用者の右", "left": "着用者の左"}
    for name, (x, y) in anchors.items():
        side = next((labels[s] for s in labels if f"_{s}" in name), "")
        if side and name.startswith(("shoulder_", "cuff_top_")):
            draw.text((x - 40, y - 60), side, font=font, fill=(200, 0, 120, 255), stroke_width=3, stroke_fill=(255, 255, 255, 255))
    legend = "確認用。赤＝推論（または手で直した）点と番号、緑＝服の輪郭、青＝輪郭上の点、黄＝推定した点、白＝三角形"
    # 襟元の点を隠さないよう、説明は下に置く。
    draw.rectangle((0, image.height - 34, image.width, image.height), fill=(0, 0, 0, 160))
    draw.text((8, image.height - 28), legend, font=ImageFont.truetype(FONT, 20), fill=(255, 255, 255, 255))
    Image.alpha_composite(image, overlay).convert("RGB").save(path)


def parse_box(text):
    values = [float(v) for v in text.split(",")]
    if len(values) != 4:
        raise SystemExit("範囲は x1,y1,x2,y2 の4つの数で指定してください")
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--front", help="前面の写真")
    parser.add_argument("--back", help="背面の写真")
    parser.add_argument("--out", required=True, help="結果を書き出すフォルダ")
    for view in ("front", "back"):
        parser.add_argument(f"--{view}-points", help=f"手で直したpoints_{view}.json")
        parser.add_argument(f"--{view}-mask", help=f"手で直したmask_{view}.png（白＝服）")
        parser.add_argument(f"--{view}-bbox", help="服を囲む範囲 x1,y1,x2,y2（自動検出が外れるとき）")
    # 実写は布の実寸に比例する3Dの長さで区切る。uvはUV画像から作った合成写真の検査用。
    parser.add_argument("--fraction", choices=["3d", "uv"], default="3d", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if not args.front and not args.back:
        raise SystemExit("--frontか--backの少なくとも一方を指定してください")

    template = json.loads((ROOT / "uv_template.json").read_text(encoding="utf-8"))
    size = template["texture"]["width"]
    part_id = np.array(Image.open(ROOT / template["part_id_image"]["path"]))
    part_values = {name: int(value) for value, name in template["part_id_image"]["values"].items() if value != "0"}
    all_uv = np.array(Image.open(ROOT / template["coverage_spec"]["all_uv_mask"])) > 0
    islands = {view: np.array(Image.open(ROOT / template["islands"][view]["mask"])) > 0 for view in ("front", "back")}
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    inference = Inference()
    texture = np.zeros((size, size, 3), np.uint8)
    observed = np.zeros((size, size), bool)
    low = np.zeros((size, size), bool)
    report = {
        "template": f"{template['template_id']} {template['template_version']}",
        "fraction": args.fraction,
        "status": "推論とテンプレートによる自動処理の結果。正しく貼れたかは画像と3Dで目視確認する",
        "views": {},
    }
    for view in ("front", "back"):
        photo_path = getattr(args, view)
        if not photo_path:
            report["views"][view] = {"photo": None}
            continue
        notes = []
        photo, info = load_photo(photo_path)
        height, width = photo.shape[:2]
        points_path = getattr(args, f"{view}_points")
        if points_path:
            record = json.loads(Path(points_path).read_text(encoding="utf-8"))
            if [record["widthPx"], record["heightPx"]] != [width, height]:
                raise SystemExit(f"{points_path}の画像サイズが写真と一致しません")
            notes.append(f"点は{Path(points_path).name}を使った")
        else:
            bbox = parse_box(getattr(args, f"{view}_bbox")) if getattr(args, f"{view}_bbox") else None
            result = inference.run(photo, bbox)
            record = {
                "imageId": f"photo_{view}.jpg",
                "view": view,
                "widthPx": width,
                "heightPx": height,
                "pixelConvention": "opencv_center",
                "source": info,
                "bbox": result["bbox"],
                "paperCorners": result["paperCorners"],
                "modelVersion": result["modelVersion"],
                "points": [{"id": p["id"], "x": round(p["x"], 2), "y": round(p["y"], 2), "score": round(p["score"], 4), "source": "model"} for p in result["points"]],
                "auxPoints": [],
                "howToEdit": "点がずれていたらx・yを直してsourceをmanualにする。足りない番号は追加する。袖付けの中点を指定するときはauxPointsに{name: aux_armhole_mid_right_front, x, y}を足す",
            }
            (out / f"points_{view}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        Image.fromarray(cv2.cvtColor(photo, cv2.COLOR_BGR2RGB)).save(out / f"photo_{view}.jpg", quality=95)
        mask_path = getattr(args, f"{view}_mask")
        if mask_path:
            garment = np.where(np.array(Image.open(mask_path).convert("L")) > 127, 255, 0).astype(np.uint8)
            if garment.shape != photo.shape[:2]:
                raise SystemExit(f"{mask_path}の大きさが写真と一致しません")
        else:
            garment = garment_mask(photo, record["bbox"], record["paperCorners"])
        garment = fill_holes(garment)
        if not mask_path:
            save_mask(garment > 0, out / f"mask_{view}.png")

        xs = np.flatnonzero(garment.any(axis=0))
        anchors = resolve_anchors(view, record["points"], template, notes, xs.max() - xs.min() + 1)
        for aux in record.get("auxPoints", []):
            anchors[aux["name"]] = opencv_to_pixel([aux["x"], aux["y"]])
        contour = outer_contour(garment)
        points, estimated = photo_points(view, anchors, contour, template, notes, "fraction_uv" if args.fraction == "uv" else "fraction")
        draw_debug(view, photo, garment, record["points"], anchors, points, estimated, template, out / f"debug_photo_{view}.jpg")
        colors, seen, uncertain, flipped = warp_view(view, photo, garment, points, estimated, template, part_id, part_values)
        if flipped:
            notes.append(f"写真側で裏返った三角形が{len(flipped)}個あり、その部分は貼らなかった。点の位置を確認する")
        texture[seen] = cv2.cvtColor(colors, cv2.COLOR_BGR2RGB)[seen]
        observed |= seen
        low |= uncertain
        report["views"][view] = {
            "photo": info["file"],
            "size": [width, height],
            "points_used": len(record["points"]),
            "flipped_triangles": len(flipped),
            "observed_ratio_by_part": {
                part: round(float((seen & (part_id == part_values[part])).sum() / (part_id == part_values[part]).sum()), 4) for part in template["views"][view]["parts"]
            },
            "notes": notes,
        }

    # 写真の色がないテクセルを、同じ島の近い色で補う。島をまたいで補わない。
    filled = np.zeros_like(observed)
    for view, island in islands.items():
        filled |= nearest_fill(texture, observed & island, island & ~observed, FILL_LIMIT_PX)
    uncovered = all_uv & ~observed & ~filled
    # 縫い目で背景色を拾わないよう、島の外へ色を広げる。塗り残しの判定には含めない。
    nearest_fill(texture, all_uv & ~uncovered, ~all_uv, PAD_PX)

    Image.fromarray(texture, "RGB").save(out / "texture.png")
    save_mask(observed, out / "coverage_observed.png")
    save_mask(filled, out / "coverage_filled.png")
    save_mask(uncovered, out / "coverage_uncovered.png")
    save_mask(low, out / "coverage_low_confidence.png")
    debug = texture.astype(np.float32)
    debug[filled] = debug[filled] * 0.4 + np.array([0, 200, 255]) * 0.6
    debug[low] = debug[low] * 0.7 + np.array([255, 220, 0]) * 0.3
    debug[uncovered] = (255, 0, 255)
    Image.fromarray(debug.astype(np.uint8), "RGB").save(out / "debug_texture_coverage.png")
    total = int(all_uv.sum())
    report["coverage"] = {
        "observed": round(float(observed.sum() / total), 4),
        "filled": round(float(filled.sum() / total), 4),
        "uncovered": round(float(uncovered.sum() / total), 4),
        "low_confidence": round(float(low.sum() / total), 4),
    }
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
