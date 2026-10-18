"""服ごとのテクスチャを、UVテンプレートでPC内のフォルダへ作る。完成したものはapiが受け取ってStorageに置く。"""

import io
import itertools
import json
import logging
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "textures"
JST = timezone(timedelta(hours=9))
CATEGORY_LABELS = {"short_sleeve_top": "Tシャツ", "long_sleeve_top": "長そで", "shirt": "シャツ", "trousers": "パンツ"}
# 変換の本体は、UVテンプレートと同じ場所にある試行用スクリプトをそのまま使う。
sys.path.insert(0, str(ROOT.parents[1] / "artifacts/uv/pitari/scripts"))
import photo_to_texture  # noqa: E402
from pitari import detections  # noqa: E402

logger = logging.getLogger("pitari")
# 公開された/api/*から裏面を何度も送られても、CPUの作業が際限なく積まれないようにする。
MAX_WAITING = 5
# 作り直すたびにフォルダが増えるので、服ごとに新しいものから残す数を決めておく（ADR 0053）。
KEEP_JOBS = 3

waiting = {}
# 待ちから取り出して作っている間の服。状態を聞かれたときに、前の作業を最新として返さないために持つ
active = {}
# 作っている間に消された服。書きかけのフォルダを消さないよう、作業が終わってから片付ける
deleted = set()
waiting_lock = threading.Lock()
worker = ThreadPoolExecutor(max_workers=1)


class QueueFull(Exception):
    pass


class LockedInference(photo_to_texture.Inference):
    """採寸のリクエストとモデルを取り合わないよう、推論の間だけロックを持つ。"""

    def __init__(self, models, lock):
        super().__init__(models)
        self.lock = lock

    def run(self, image, bbox, category, **known):
        with self.lock:
            return super().run(image, bbox, category, **known)


def template_ready(category):
    return photo_to_texture.template_ready(category)


def submit(garment_id, category, front, back, models, lock, garment_created_at=None, back_image_id=None, front_saved=None):
    """待っている間に同じ服が届いたら、新しい写真で作り直すよう置き換える。

    front_savedは、採寸画面で確かめてDBに保存した表の{"paperCorners", "points", "widthPx", "heightPx"}。
    """
    with waiting_lock:
        queued = garment_id in waiting
        if not queued and len(waiting) >= MAX_WAITING:
            raise QueueFull()
        waiting[garment_id] = (category, front, back, garment_created_at, back_image_id, front_saved)
    if not queued:
        worker.submit(run, garment_id, models, lock)


def run(garment_id, models, lock):
    with waiting_lock:
        # 待っている間に服が消されたら、作らない
        if garment_id not in waiting:
            return
        category, front, back, garment_created_at, back_image_id, front_saved = waiting.pop(garment_id)
        active[garment_id] = back_image_id
    try:
        make(garment_id, category, front, back, models, lock, garment_created_at=garment_created_at, back_image_id=back_image_id,
             front_saved=front_saved)
    except Exception:
        logger.exception("テクスチャの作業フォルダを用意できませんでした")
    finally:
        with waiting_lock:
            active.pop(garment_id, None)
            removed = garment_id in deleted
            deleted.discard(garment_id)
        try:
            if removed:
                remove_folders(garment_id)
            else:
                remove_folders(garment_id, keep=KEEP_JOBS)
        except OSError:
            logger.exception("テクスチャの作業フォルダを片付けられませんでした")


def forget(garment_id):
    """服を消したときに呼ぶ。待ちの作業を取り消し、その服の作業フォルダと、写真の切り抜きの記録を消す。

    作っている最中なら、書きかけのフォルダを消さず、作業が終わってから消す。
    """
    with waiting_lock:
        waiting.pop(garment_id, None)
        running = garment_id in active
        if running:
            deleted.add(garment_id)
    return {"removed": 0 if running else remove_folders(garment_id), "running": running}


def garment_folders(garment_id):
    """服の作業フォルダを、新しい順に返す。"""
    jobs = []
    # フォルダ名に服IDの先頭8文字が入るので、まずそれで絞ってからjob.jsonの服IDで確かめる
    for folder in OUTPUT.glob(f"*_{garment_id[:8]}*"):
        job = read_job(folder)
        if job and job.get("garmentId") == garment_id:
            jobs.append((job.get("createdAt") or "", folder.name, folder, job))
    return [(folder, job) for _, _, folder, job in sorted(jobs, key=lambda item: (item[0], item[1]), reverse=True)]


def remove_folders(garment_id, keep=0):
    """新しいものからkeep件を残し、ほかの作業フォルダを消す。keepが0なら、写真の切り抜きの記録も消す。"""
    removed = 0
    for folder, _ in garment_folders(garment_id)[keep:]:
        if not keep:
            for view in ("front", "back"):
                photo = folder / f"input_{view}.jpg"
                if photo.is_file():
                    detections.forget(photo.read_bytes())
        shutil.rmtree(folder)
        removed += 1
    return removed


def latest(garment_id):
    """服の最新の作業の状態。apiのGET /textures/{garmentId}が返す形で、作業が無ければNone。"""
    with waiting_lock:
        if garment_id in waiting:
            return {"status": "queued", "job": None, "error": None, "backImageId": waiting[garment_id][4]}
        if garment_id in active:
            return {"status": "running", "job": None, "error": None, "backImageId": active[garment_id]}
    jobs = garment_folders(garment_id)
    if not jobs:
        return None
    folder, job = jobs[0]
    return {"status": job.get("status"), "job": folder.name, "error": job.get("error"), "backImageId": job.get("backImageId")}


def texture_file(garment_id, job_name):
    """完成した作業のテクスチャのパス。服が違う・未完成・フォルダ名が不正ならNone。"""
    if not job_name or Path(job_name).name != job_name or job_name.startswith("."):
        return None
    folder = OUTPUT / job_name
    job = read_job(folder)
    if not job or job.get("garmentId") != garment_id or job.get("status") != "done":
        return None
    path = folder / "texture.png"
    return path if path.is_file() else None


def read_job(folder):
    try:
        return json.loads((folder / "job.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def run_name(garment_id, category, created_at):
    """日時を先頭に置き、フォルダを名前順に並べると生成順になるようにする。"""
    return f"{created_at.astimezone(JST):%Y-%m-%d_%H-%M-%S}_{CATEGORY_LABELS[category]}_{garment_id[:8]}"


def new_folder(name):
    # 写真の不足ですぐ失敗すると、同じ服の再生成が同じ秒に重なることがある。
    for number in itertools.count(1):
        out = OUTPUT / (name if number == 1 else f"{name}_{number}")
        try:
            out.mkdir(parents=True)
            return out
        except FileExistsError:
            continue


def recall(raw, category):
    """採寸・裏面の登録で切り抜いた写真なら、そのときの範囲・点・服の領域。"""
    with Image.open(io.BytesIO(raw)) as image:
        size = image.size
    return detections.recall(raw, *size, photo_to_texture.MODEL_CATEGORIES.get(category, category))


def make(garment_id, category, front, back, models, lock, garment_created_at=None, back_image_id=None, front_saved=None):
    started = time.perf_counter()
    created_at = datetime.now(JST)
    out = new_folder(run_name(garment_id, category, created_at))
    # backImageIdは、apiが撮り直す前の裏面から作った作業を見分けるために使う
    job = {"garmentId": garment_id, "category": category, "backImageId": back_image_id,
           "garmentCreatedAt": garment_created_at.astimezone(JST).isoformat() if garment_created_at else None,
           "createdAt": created_at.isoformat(), "status": "running"}
    (out / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        views = {}
        for view, raw in (("front", front), ("back", back)):
            if raw:
                (out / f"input_{view}.jpg").write_bytes(raw)
                views[view] = {"photo": out / f"input_{view}.jpg", "detection": recall(raw, category)}
        if front_saved and "front" in views:
            views["front"]["saved"] = front_saved
        report = photo_to_texture.make_texture(out, views, LockedInference(models, lock), category=category)
        # 画像だけを持ち出しても分かるよう、フォルダと同じ名前のコピーを置く。既存のBlender確認スクリプトが読むtexture.pngも残す。
        filename = f"{out.name}.png"
        shutil.copyfile(out / "texture.png", out / filename)
        job.update(status="done", coverage=report["coverage"], textureFile=filename, timingsMs=report.get("timingsMs"))
    except SystemExit as error:
        # 点が足りないなど、写真の問題は試行用スクリプトがSystemExitで知らせる。
        job.update(status="failed", error=str(error))
    except Exception:
        logger.exception("テクスチャの作成に失敗")
        job.update(status="failed", error="テクスチャを作成できませんでした。推論サービスのログを確認してください")
    job["elapsedMs"] = round((time.perf_counter() - started) * 1000)
    job["completedAt"] = datetime.now(JST).isoformat()
    (out / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
