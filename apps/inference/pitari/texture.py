"""服ごとのテクスチャを、UVテンプレートでPC内のフォルダへ作る。画面やAPIの応答には出さない。"""

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

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "textures"
JST = timezone(timedelta(hours=9))
CATEGORY_LABELS = {"short_sleeve_top": "Tシャツ", "long_sleeve_top": "長そで", "trousers": "パンツ"}
# 変換の本体は、UVテンプレートと同じ場所にある試行用スクリプトをそのまま使う。
sys.path.insert(0, str(ROOT.parents[1] / "artifacts/uv/pitari/scripts"))
import photo_to_texture  # noqa: E402

logger = logging.getLogger("pitari")
# 公開された/api/*から裏面を何度も送られても、CPUの作業が際限なく積まれないようにする。
MAX_WAITING = 5

waiting = {}
waiting_lock = threading.Lock()
worker = ThreadPoolExecutor(max_workers=1)


class QueueFull(Exception):
    pass


class LockedInference(photo_to_texture.Inference):
    """採寸のリクエストとモデルを取り合わないよう、推論の間だけロックを持つ。"""

    def __init__(self, models, lock):
        super().__init__(models)
        self.lock = lock

    def run(self, image, bbox, category):
        with self.lock:
            return super().run(image, bbox, category)


def template_ready(category):
    return photo_to_texture.template_ready(category)


def submit(garment_id, category, front, back, models, lock, garment_created_at=None):
    """待っている間に同じ服が届いたら、新しい写真で作り直すよう置き換える。"""
    with waiting_lock:
        queued = garment_id in waiting
        if not queued and len(waiting) >= MAX_WAITING:
            raise QueueFull()
        waiting[garment_id] = (category, front, back, garment_created_at)
    if not queued:
        worker.submit(run, garment_id, models, lock)


def run(garment_id, models, lock):
    with waiting_lock:
        category, front, back, garment_created_at = waiting.pop(garment_id)
    try:
        make(garment_id, category, front, back, models, lock, garment_created_at=garment_created_at)
    except Exception:
        logger.exception("テクスチャの作業フォルダを用意できませんでした")


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


def make(garment_id, category, front, back, models, lock, garment_created_at=None):
    started = time.perf_counter()
    created_at = datetime.now(JST)
    out = new_folder(run_name(garment_id, category, created_at))
    job = {"garmentId": garment_id, "category": category,
           "garmentCreatedAt": garment_created_at.astimezone(JST).isoformat() if garment_created_at else None,
           "createdAt": created_at.isoformat(), "status": "running"}
    (out / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        views = {}
        for view, raw in (("front", front), ("back", back)):
            if raw:
                (out / f"input_{view}.jpg").write_bytes(raw)
                views[view] = {"photo": out / f"input_{view}.jpg"}
        report = photo_to_texture.make_texture(out, views, LockedInference(models, lock), category=category)
        # 画像だけを持ち出しても分かるよう、フォルダと同じ名前のコピーを置く。既存のBlender確認スクリプトが読むtexture.pngも残す。
        filename = f"{out.name}.png"
        shutil.copyfile(out / "texture.png", out / filename)
        job.update(status="done", coverage=report["coverage"], textureFile=filename)
    except SystemExit as error:
        # 点が足りないなど、写真の問題は試行用スクリプトがSystemExitで知らせる。
        job.update(status="failed", error=str(error))
    except Exception:
        logger.exception("テクスチャの作成に失敗")
        job.update(status="failed", error="テクスチャを作成できませんでした。推論サービスのログを確認してください")
    job["elapsedMs"] = round((time.perf_counter() - started) * 1000)
    job["completedAt"] = datetime.now(JST).isoformat()
    (out / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
