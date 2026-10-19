"""服の前面・背面の写真を、UVテンプレートでpitariの半袖トップス・ズボンのテクスチャへ変換する（試行用）。

使い方（リポジトリ直下のPowerShell）：
  ./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/photo_to_texture.py --front 前面.jpg --back 背面.jpg --out artifacts/uv/pitari/trials/try1
ズボンは --category trousers を付ける（テンプレートはbuild_trousers_template.pyで作る）。

1回目は既存の推論（apps/inferenceのGrounding DINOとHRNet）で、服の範囲・ランドマーク・服の領域を求める。
点がずれていたら、出力のpoints_front.jsonの座標を直して --front-points で渡す。
服の領域がずれていたら、mask_front.pngを塗り直して --front-mask で渡す。背面も同じ。
"""

import argparse
import json
import sys
import time
from contextlib import contextmanager
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
from warp_support import mean_value_embedding, mean_value_weights, signed_area, triangle_mask  # noqa: E402

try:
    import pitari_fast
except ImportError:
    # Rust拡張（apps/inference/native）をビルドしていないPCでは、同じ結果を返すPython版を使う。
    pitari_fast = None

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
# 以下の3つは、テンプレートにdf2_pairs・df2_spread_checks・df2_centersがないとき（Tシャツ）に使う。
PAIRS = [(2, 6), (3, 5), (7, 25), (8, 24), (9, 23), (10, 22), (11, 21), (12, 20), (13, 19), (14, 18), (15, 17)]
SPREAD_CHECKS = [(7, 25), (9, 23), (10, 22), (12, 20), (15, 17)]
CENTERS = [1, 4, 16]
FONT = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"
# カテゴリごとのテンプレートの場所。ズボンはbuild_trousers_template.pyで作る。
TEMPLATE_ROOTS = {"short_sleeve_top": ROOT, "long_sleeve_top": ROOT / "longsleeve", "shirt": ROOT / "shirt", "trousers": ROOT / "trousers"}
# DeepFashion2にシャツはないので、検出・点・切り抜きは長そでとして行い、テンプレートだけをシャツ用にする（ADR 0033）。
MODEL_CATEGORIES = {"shirt": "long_sleeve_top"}


class Stopwatch:
    """工程ごとにかかった時間（ミリ秒）を足し上げる。どこが遅いかをreport.jsonで見るため。"""

    def __init__(self):
        self.ms = {}

    @contextmanager
    def measure(self, name):
        started = time.perf_counter()
        try:
            yield
        finally:
            self.add(name, (time.perf_counter() - started) * 1000)

    def add(self, name, ms):
        self.ms[name] = round(self.ms.get(name, 0) + ms)


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


def garment_mask(image, bbox, paper_corners, points=(), category=None):
    """apps/inference/pitari/cutout.pyのGrabCutで、写真と同じ大きさの服の領域を返す（切り詰めない）。"""
    from pitari.cutout import garment_alpha

    try:
        return garment_alpha(image, bbox, paper_corners, points, category)
    except ValueError as error:
        raise SystemExit(f"{error}。--front-bboxなどで服の範囲を指定してください") from None


class Inference:
    """既存の推論を、HTTPを通さず同じ関数で呼ぶ。modelsを渡さなければ初回だけ読み込む。"""

    def __init__(self, models=None):
        self.models = models

    def run(self, image, bbox, category="short_sleeve_top", paper_corners=None):
        """paper_cornersを渡したら、紙は推論しない。"""
        from pitari.geometry import paper_candidate
        from pitari.models import MODEL_VERSION, Models

        if self.models is None:
            print("推論モデルを読み込んでいます（初回は数十秒かかります）")
            self.models = Models()
        clock = Stopwatch()
        corners = paper_corners
        if not corners:
            with clock.measure("paper"):
                corners = paper_candidate(image)
        if bbox is None:
            with clock.measure("detect"):
                _, bbox = self.models.detect(image, category)
        with clock.measure("landmarks"):
            points = self.models.landmarks(image, category, bbox)
        return {"bbox": [float(v) for v in bbox], "paperCorners": [[float(x), float(y)] for x, y in corners], "points": points, "modelVersion": MODEL_VERSION, "timingsMs": clock.ms}


def df2_table(spec):
    return spec.get("df2_table") or spec["df2_short_sleeve_top"]


def entry_anchors(entry):
    """番号に対応する固定点の名前。ズボンの股のように、左右の島に1つずつあるものは複数になる。"""
    if entry.get("use") == "not_on_this_view":
        return []
    return entry.get("anchors") or ([entry["anchor"]] if entry.get("anchor") else [])


def resolve_anchors(view, points, template, notes, garment_width):
    """DeepFashion2の番号から固定点を決める。左右のペアは番号でなく写真上のxで決め直す。"""
    table = df2_table(template["views"][view])
    by_id = {int(p["id"]): opencv_to_pixel([p["x"], p["y"]]) for p in points}
    anchors = {}
    # 肩先・袖口・裾の角など、左右が近すぎるときは、両方を同じ袖などに置いた推定の失敗を疑う。
    for low, high in template.get("df2_spread_checks", SPREAD_CHECKS):
        if low in by_id and high in by_id and abs(by_id[low][0] - by_id[high][0]) < 0.25 * garment_width:
            notes.append(f"警告：{low}番と{high}番が左右で近すぎる（推定の失敗の可能性が高い）。debug_photo_{view}.jpgを見て点を直す")

    def put(number, xy):
        for name in entry_anchors(table.get(str(number), {})):
            anchors[name] = np.asarray(xy, dtype=float)

    for low, high in template.get("df2_pairs", PAIRS):
        if low in by_id and high in by_id:
            a, b = by_id[low], by_id[high]
            if a[0] > b[0]:
                notes.append(f"{low}番と{high}番が画像の左右逆だったため入れ替えた")
                a, b = b, a
            # 組の先の番号が画像の左（Tシャツは公式の図、ズボンは実写の推論で確かめた）。
            put(low, a)
            put(high, b)
        elif low in by_id or high in by_id:
            number = low if low in by_id else high
            notes.append(f"{number}番の相方がないため、左右を確かめずに使った")
            put(number, by_id[number])
    for number in template.get("df2_centers", CENTERS):
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

    # ズボンの股は、推論の9番より脚の間のすき間の一番上（輪郭）のほうが確か。9番は前（後ろ）中心の縫い目の上に出やすい。
    crotch = {"crotch_right", "crotch_left", "hem_inner_right", "hem_inner_left"}
    if crotch <= set(anchors):
        path, clean = contour_between(contour, anchors["hem_inner_right"], anchors["hem_inner_left"], blocked(*crotch))
        apex = path[np.argmin(path[:, 1])]
        hem_y = (anchors["hem_inner_right"][1] + anchors["hem_inner_left"][1]) / 2
        waist_y = min(anchors[n][1] for n in ("waist_center_right", "waist_center_left") if n in anchors) if "waist_center_right" in anchors else apex[1]
        moved = float(np.linalg.norm(apex - anchors["crotch_right"]))
        # すき間が裾から3割以上上まで届いていなければ、脚が重なっていると見て推論の点を使う。
        if clean and apex[1] < hem_y - 0.3 * (hem_y - waist_y):
            anchors["crotch_right"] = anchors["crotch_left"] = apex
            notes.append(f"股（9番）を脚の間の輪郭の一番上へ{moved:.0f}px動かした")
        else:
            notes.append("脚の間のすき間が見つからないため、股は推論の9番を使った。debug_photoで股の位置を確認する")

    # 写真から直接は出ない点を、輪郭や他の点から決める。
    if f"hem_center_{view}" not in anchors and {"hem_side_right", "hem_side_left"} <= set(anchors):
        path, _ = contour_between(contour, anchors["hem_side_right"], anchors["hem_side_left"], blocked("hem_side_right", "hem_side_left"))
        anchors[f"hem_center_{view}"] = sample(path, [0.5])[0]
        notes.append("裾の中心がないため、裾の輪郭の中点で代用した")
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
        # 袖付けを上下2つの区間に分けたテンプレート（Tシャツ・長そで）だけ。シャツの袖付けは1本の曲線。
        if name not in anchors and f"armhole_{side}_upper" in by_name and {f"shoulder_{side}", f"armpit_{side}"} <= set(anchors):
            # 袖付けの曲線全体を肩先と脇に合わせて置く。中点は上半分の曲線の終点。
            curve = uv_curve(f"armhole_{side}_upper", f"armhole_{side}_lower")
            middle = len(by_name[f"armhole_{side}_upper"]["uv_polyline"]) - 1
            anchors[name] = place_like(curve, anchors[f"shoulder_{side}"], anchors[f"armpit_{side}"])[middle]
        estimated.add(name)

    required = {name for s in segments for name in (s["start"], s["end"])}
    missing = sorted(required - set(anchors))
    if missing:
        numbers = sorted({int(k) for k, v in df2_table(spec).items() if set(entry_anchors(v)) & set(missing)})
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
        elif method == "straight":
            polyline = np.array([start, end])
        else:
            polyline = place_like(uv_curve(segment["name"]), start, end)
        names = [s["name"] for s in segment["samples"]]
        for name, xy in zip(names, sample(polyline, [s[fraction_key] for s in segment["samples"]])):
            points[name] = xy
        if method != "contour":
            estimated.update(names)

    # 内部点：UV側の輪郭で求めた平均値座標の重みを、写真側の輪郭の点に掛ける。
    # ズボンは三角形の辺に沿った重みで解く（interior_method）。輪郭全体の重みだと股で折れ返るため。
    template_points = spec["points"]
    for part in spec["parts"].values():
        photo_polygon = np.array([points[n] for n in part["polygon"]])
        if part.get("interior_method") == "mean_value_embedding":
            names = part["polygon"] + part["interior_points"]
            index = {name: i for i, name in enumerate(names)}
            source = np.array([template_points[n]["pixel"] for n in names])
            triangles = [[index[n] for n in triangle] for triangle in part["triangles"]]
            interior = mean_value_embedding(source, triangles, len(part["polygon"]), photo_polygon)
        else:
            uv_polygon = np.array([template_points[n]["uv"] for n in part["polygon"]])
            uv_interior = np.array([template_points[n]["uv"] for n in part["interior_points"]])
            interior = mean_value_weights(uv_polygon, uv_interior) @ photo_polygon
        for name, xy in zip(part["interior_points"], interior):
            points[name] = xy
    return points, estimated


def warp_maps(part_id, parts, sources, targets, low_flags):
    """三角形ごとのアフィン変換で、各テクセルが写真のどこを読むかを作る。pitari_fast.warp_mapsと同じ結果を返す。

    テクセルは、part_idが三角形の部位と同じで、まだ書いていなければ、先に並んだ三角形が取る。
    """
    height, width = part_id.shape
    map_x = np.full((height, width), -1.0, np.float32)
    map_y = np.full((height, width), -1.0, np.float32)
    written = np.zeros((height, width), bool)
    low = np.zeros((height, width), bool)
    for part, source, target, is_low in zip(parts, sources, targets, low_flags):
        x0, y0 = np.floor(source.min(axis=0)).astype(int)
        x1, y1 = np.ceil(source.max(axis=0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, width - 1), min(y1, height - 1)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        window = (slice(y0, y1 + 1), slice(x0, x1 + 1))
        inside = triangle_mask(source, xs, ys) & (part_id[window] == part) & ~written[window]
        if not inside.any():
            continue
        affine = np.linalg.solve(np.column_stack([source, np.ones(3)]), target)
        mapped = pixel_to_opencv(np.column_stack([xs[inside], ys[inside], np.ones(inside.sum())]) @ affine)
        map_x[window][inside] = mapped[:, 0]
        map_y[window][inside] = mapped[:, 1]
        written[window] |= inside
        if is_low:
            low[window] |= inside
    return map_x, map_y, written, low


def warp_view(view, photo, garment, points, estimated, template, part_id, part_values):
    """テンプレートの三角形ごとにアフィン変換し、写真の色をテクスチャへ写す。"""
    spec = template["views"][view]
    flipped = []
    parts, sources, targets, low_flags = [], [], [], []
    for part, part_spec in spec["parts"].items():
        for triangle in part_spec["triangles"]:
            source = np.array([spec["points"][n]["pixel"] for n in triangle], dtype=float)
            target = np.array([points[n] for n in triangle], dtype=float)
            # テクスチャも写真もyが下向きなので、同じ三角形は同じ向きになる。
            if signed_area(source) * signed_area(target) <= 0:
                flipped.append(triangle)
                continue
            parts.append(part_values[part])
            sources.append(source)
            targets.append(target)
            low_flags.append(bool(estimated.intersection(triangle)))
    if sources:
        # 三角形ごとのPythonのループが遅いため、Rust拡張があれば使う（ADR 0050）。
        rasterize = pitari_fast.warp_maps if pitari_fast else warp_maps
        map_x, map_y, written, low = rasterize(np.ascontiguousarray(part_id, np.uint8), parts, np.array(sources), np.array(targets), low_flags)
    else:
        map_x = map_y = np.full(part_id.shape, -1.0, np.float32)
        written = low = np.zeros(part_id.shape, bool)
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
        if side and name.startswith(("shoulder_", "cuff_top_", "waist_outer_", "hem_outer_")):
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


def template_ready(category="short_sleeve_top"):
    return category in TEMPLATE_ROOTS and (TEMPLATE_ROOTS[category] / "uv_template.json").is_file()


def make_texture(out, views, inference, fraction="3d", category="short_sleeve_top"):
    """views[view]は{"photo", "points", "mask", "bbox", "detection", "saved"}。points・mask・bboxは手で直したときだけ渡す。

    detectionは、同じ写真を採寸や裏面の登録で切り抜いたときの{"bbox", "paperCorners", "points", "mask", "modelVersion", "widthPx", "heightPx"}。
    渡すと推論と切り抜きをやり直さない。
    savedは、採寸画面で確かめてDBに保存した{"paperCorners", "points", "bbox", "widthPx", "heightPx"}。detectionや推論より優先する。
    bboxは、detectionが無いときに服の検出の代わりに使う。detectionがあれば、範囲から作った服の領域ごとdetectionを使う。
    保存した点が一部の番号だけでも、ほかの番号は推論の点で補う。
    """
    clock = Stopwatch()
    root = TEMPLATE_ROOTS[category]
    model_category = MODEL_CATEGORIES.get(category, category)
    with clock.measure("template"):
        template = json.loads((root / "uv_template.json").read_text(encoding="utf-8"))
        size = template["texture"]["width"]
        part_id = np.array(Image.open(root / template["part_id_image"]["path"]))
        part_values = {name: int(value) for value, name in template["part_id_image"]["values"].items() if value != "0"}
        all_uv = np.array(Image.open(root / template["coverage_spec"]["all_uv_mask"])) > 0
        # 島の中だけで色を補う。Tシャツは前後、ズボンは左右の脚が島になる。
        islands = {name: np.array(Image.open(root / spec["mask"])) > 0 for name, spec in template["islands"].items()}
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    texture = np.zeros((size, size, 3), np.uint8)
    observed = np.zeros((size, size), bool)
    low = np.zeros((size, size), bool)
    report = {
        "template": f"{template['template_id']} {template['template_version']}",
        "category": category,
        "fraction": fraction,
        "status": "推論とテンプレートによる自動処理の結果。正しく貼れたかは画像と3Dで目視確認する",
        "views": {},
    }
    for view in ("front", "back"):
        given = views.get(view) or {}
        photo_path = given.get("photo")
        if not photo_path:
            report["views"][view] = {"photo": None}
            continue
        notes = []
        with clock.measure(f"{view}.photo"):
            photo, info = load_photo(photo_path)
        height, width = photo.shape[:2]
        points_path = given.get("points")
        detection = given.get("detection")
        if detection and [detection["widthPx"], detection["heightPx"]] != [width, height]:
            notes.append("切り抜いたときと写真の大きさが違うため、推論し直した")
            detection = None
        saved = given.get("saved")
        if saved and [saved["widthPx"], saved["heightPx"]] != [width, height]:
            notes.append("保存した点・A4の四隅と写真の大きさが違うため、使わなかった")
            saved = None
        known = {}
        # 四隅がそろわないと縮尺を決められないので、4点のときだけ使い、ほかは紙を推論する
        if saved and len(saved["paperCorners"]) == 4:
            known["paperCorners"] = saved["paperCorners"]
        if saved and saved["points"]:
            known["points"] = saved["points"]
        if saved and saved.get("bbox") and not detection:
            known["bbox"] = saved["bbox"]
        if points_path:
            record = json.loads(Path(points_path).read_text(encoding="utf-8"))
            if [record["widthPx"], record["heightPx"]] != [width, height]:
                raise SystemExit(f"{points_path}の画像サイズが写真と一致しません")
            notes.append(f"点は{Path(points_path).name}を使った")
        else:
            if detection:
                result = {**detection, "paperCorners": known.get("paperCorners") or detection["paperCorners"]}
                notes.append("採寸・裏面の登録で切り抜いたときの範囲・点・服の領域を使った")
            else:
                # ロックの待ちも含む。モデルの時間は内訳として別に残す。
                with clock.measure(f"{view}.inference"):
                    result = inference.run(photo, given.get("bbox") or known.get("bbox"), model_category,
                                           paper_corners=known.get("paperCorners"))
                for step, ms in result.get("timingsMs", {}).items():
                    clock.add(f"{view}.{step}", ms)
            if known.get("points"):
                by_id = {point["id"]: point for point in result["points"]}
                by_id.update({point["id"]: point for point in known["points"]})
                result = {**result, "points": sorted(by_id.values(), key=lambda point: point["id"])}
            if known:
                notes.append("採寸画面で保存した" + "・".join({"paperCorners": "A4の四隅", "points": "点", "bbox": "服の範囲"}[key] for key in known) + "を使った")
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
                "points": [{"id": p["id"], "x": round(p["x"], 2), "y": round(p["y"], 2), "score": None if p.get("score") is None else round(p["score"], 4), "source": "model"} for p in result["points"]],
                "auxPoints": [],
                "howToEdit": "点がずれていたらx・yを直してsourceをmanualにする。足りない番号は追加する。袖付けの中点を指定するときはauxPointsに{name: aux_armhole_mid_right_front, x, y}を足す",
            }
            (out / f"points_{view}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        with clock.measure("save"):
            Image.fromarray(cv2.cvtColor(photo, cv2.COLOR_BGR2RGB)).save(out / f"photo_{view}.jpg", quality=95)
        mask_path = given.get("mask")
        with clock.measure(f"{view}.mask"):
            if mask_path:
                garment = np.where(np.array(Image.open(mask_path).convert("L")) > 127, 255, 0).astype(np.uint8)
                if garment.shape != photo.shape[:2]:
                    raise SystemExit(f"{mask_path}の大きさが写真と一致しません")
            elif detection:
                garment = detection["mask"]
            else:
                garment = garment_mask(photo, record["bbox"], record["paperCorners"], record["points"], model_category)
            garment = fill_holes(garment)
            # ズボンは股の付近で切り抜きの縁に細い割れ目や出っ張りができ、輪郭の点が行き来して三角形が裏返る。
            # テンプレートが指定するときは、服の領域を丸めてから使う。
            ratio = template.get("mask_smoothing_ratio")
            if ratio and not mask_path:
                size_px = max(3, round(ratio * max(garment.shape)) | 1)
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size_px, size_px))
                garment = cv2.morphologyEx(cv2.morphologyEx(garment, cv2.MORPH_CLOSE, kernel), cv2.MORPH_OPEN, kernel)
        if not mask_path:
            with clock.measure("save"):
                save_mask(garment > 0, out / f"mask_{view}.png")

        with clock.measure(f"{view}.points"):
            xs = np.flatnonzero(garment.any(axis=0))
            anchors = resolve_anchors(view, record["points"], template, notes, xs.max() - xs.min() + 1)
            for aux in record.get("auxPoints", []):
                anchors[aux["name"]] = opencv_to_pixel([aux["x"], aux["y"]])
            contour = outer_contour(garment)
            points, estimated = photo_points(view, anchors, contour, template, notes, "fraction_uv" if fraction == "uv" else "fraction")
        with clock.measure(f"{view}.debug"):
            draw_debug(view, photo, garment, record["points"], anchors, points, estimated, template, out / f"debug_photo_{view}.jpg")
        with clock.measure(f"{view}.warp"):
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
    with clock.measure("fill"):
        filled = np.zeros_like(observed)
        for island in islands.values():
            filled |= nearest_fill(texture, observed & island, island & ~observed, FILL_LIMIT_PX)
        uncovered = all_uv & ~observed & ~filled
        # 縫い目で背景色を拾わないよう、島の外へ色を広げる。塗り残しの判定には含めない。
        nearest_fill(texture, all_uv & ~uncovered, ~all_uv, PAD_PX)

    with clock.measure("save"):
        Image.fromarray(texture, "RGB").save(out / "texture.png")
        save_mask(observed, out / "coverage_observed.png")
        save_mask(filled, out / "coverage_filled.png")
        save_mask(uncovered, out / "coverage_uncovered.png")
        save_mask(low, out / "coverage_low_confidence.png")
        debug = texture.astype(np.float32)
        debug[filled] = debug[filled] * 0.4 + np.array([0, 200, 255]) * 0.6
        debug[low] = debug[low] * 0.7 + np.array([255, 220, 0]) * 0.3
        debug[uncovered] = (255, 0, 255)
        # 確認用なので、圧縮を弱めて保存を速くする（約0.5秒→0.2秒）。texture.pngはStorageに置くので小さく保つ。
        Image.fromarray(debug.astype(np.uint8), "RGB").save(out / "debug_texture_coverage.png", compress_level=1)
    report["timingsMs"] = clock.ms
    total = int(all_uv.sum())
    report["coverage"] = {
        "observed": round(float(observed.sum() / total), 4),
        "filled": round(float(filled.sum() / total), 4),
        "uncovered": round(float(uncovered.sum() / total), 4),
        "low_confidence": round(float(low.sum() / total), 4),
    }
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


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
    parser.add_argument("--category", choices=sorted(TEMPLATE_ROOTS), default="short_sleeve_top", help="服の種類（ズボンはtrousers）")
    args = parser.parse_args()
    if not args.front and not args.back:
        raise SystemExit("--frontか--backの少なくとも一方を指定してください")
    views = {
        view: {
            "photo": getattr(args, view),
            "points": getattr(args, f"{view}_points"),
            "mask": getattr(args, f"{view}_mask"),
            "bbox": parse_box(getattr(args, f"{view}_bbox")) if getattr(args, f"{view}_bbox") else None,
        }
        for view in ("front", "back")
    }
    report = make_texture(args.out, views, Inference(), args.fraction, args.category)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
