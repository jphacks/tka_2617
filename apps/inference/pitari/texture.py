"""服ごとのテクスチャを、UVテンプレートでPC内のフォルダへ作る。画面やAPIの応答には出さない。"""

import json
import logging
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "textures"
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


def submit(garment_id, category, front, back, models, lock):
    """待っている間に同じ服が届いたら、新しい写真で作り直すよう置き換える。"""
    with waiting_lock:
        queued = garment_id in waiting
        if not queued and len(waiting) >= MAX_WAITING:
            raise QueueFull()
        waiting[garment_id] = (category, front, back)
    if not queued:
        worker.submit(run, garment_id, models, lock)


def run(garment_id, models, lock):
    with waiting_lock:
        category, front, back = waiting.pop(garment_id)
    try:
        make(garment_id, category, front, back, models, lock)
    except Exception:
        logger.exception("テクスチャの作業フォルダを用意できませんでした")


def make(garment_id, category, front, back, models, lock):
    started = time.perf_counter()
    created_at = datetime.now().astimezone()
    out = OUTPUT / garment_id / created_at.strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True)
    job = {"garmentId": garment_id, "category": category, "createdAt": created_at.isoformat(), "status": "running"}
    (out / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        views = {}
        for view, raw in (("front", front), ("back", back)):
            if raw:
                (out / f"input_{view}.jpg").write_bytes(raw)
                views[view] = {"photo": out / f"input_{view}.jpg"}
        report = photo_to_texture.make_texture(out, views, LockedInference(models, lock), category=category)
        job.update(status="done", coverage=report["coverage"])
    except SystemExit as error:
        # 点が足りないなど、写真の問題は試行用スクリプトがSystemExitで知らせる。
        job.update(status="failed", error=str(error))
    except Exception:
        logger.exception("テクスチャの作成に失敗")
        job.update(status="failed", error="テクスチャを作成できませんでした。推論サービスのログを確認してください")
    job["elapsedMs"] = round((time.perf_counter() - started) * 1000)
    (out / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
