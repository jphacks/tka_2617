"""Honoだけが呼ぶ、ローカル採寸サービス。"""

import base64
import io
import json
import logging
import os
import secrets
import threading
import time
import uuid
from typing import Literal

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, Depends
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, ValidationError

from pitari.geometry import paper_candidate, paper_scale
from pitari.cutout import garment_cutout
from pitari.models import Models, MODEL_VERSION

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
models = Models()
processing = threading.Lock()
logger = logging.getLogger("pitari")
MAX_BYTES = 8 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 12_000_000


def authorize(authorization: str = Header(default="")):
    token = os.environ.get("INFERENCE_TOKEN", "")
    if len(token) < 32:
        raise HTTPException(503, "推論サービスのトークンを設定してください")
    if not secrets.compare_digest(authorization, "Bearer " + token):
        raise HTTPException(401, "認証できません")


class Options(BaseModel):
    category: Literal["short_sleeve_top", "trousers", "auto"]
    paperCorners: list[tuple[float, float]] = Field(default_factory=list, max_length=4)
    bbox: tuple[float, float, float, float] | None = None
    stage: Literal["all", "paper", "garment", "landmarks", "cutout"] = "all"


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/status", dependencies=[Depends(authorize)])
def status():
    return models.status()


@app.post("/detect", dependencies=[Depends(authorize)])
def detect(image: UploadFile = File(...), options: str = Form(...)):
    started = time.perf_counter()
    try:
        settings = Options.model_validate_json(options)
    except ValidationError:
        raise HTTPException(400, "撮影条件を確認してください") from None
    if not processing.acquire(blocking=False):
        raise HTTPException(429, "別の写真を処理しています。少し待って再試行してください")
    try:
        raw = image.file.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise HTTPException(413, "画像は8MiB以下にしてください")
        try:
            with Image.open(io.BytesIO(raw)) as original:
                if original.format != "JPEG" or original.width * original.height > 12_000_000 or original.getexif().get(274, 1) != 1:
                    raise ValueError()
                # 四隅の座標を変えないため、向きの確定はブラウザ側で済ませる。
                source = cv2.cvtColor(np.array(original.convert("RGB")), cv2.COLOR_RGB2BGR)
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            raise HTTPException(400, "向きを確定したJPEG画像を選んでください（最大1200万画素）") from None
        height, width = source.shape[:2]
        bbox = list(settings.bbox) if settings.bbox is not None else None
        if bbox is not None and (not np.isfinite(bbox).all() or not (0 <= bbox[0] < bbox[2] < width and 0 <= bbox[1] < bbox[3] < height)):
            raise HTTPException(400, "服の範囲を画像内に指定してください")
        if bbox is not None and settings.category == "auto":
            raise HTTPException(400, "範囲を指定した場合はカテゴリも選んでください")
        warnings = []
        corners = settings.paperCorners or (paper_candidate(source) if settings.stage in ("all", "paper") else [])
        pixels_per_cm = None
        if corners:
            try:
                pixels_per_cm = paper_scale(corners, width, height)
            except ValueError as error:
                warnings.append(str(error))
        else:
            warnings.append("A4の四隅を指定してください")
        category = None if settings.category == "auto" else settings.category
        points = []
        model_version = None
        if settings.stage in ("all", "garment", "landmarks"):
            try:
                if bbox is None:
                    category, bbox = models.detect(source, settings.category)
                if settings.stage in ("all", "landmarks"):
                    points = models.landmarks(source, category, bbox)
                    model_version = MODEL_VERSION
                    if not points:
                        warnings.append("寸法を推定できませんでした。数値を入力してください")
            except FileNotFoundError as error:
                warnings.append(str(error))
            except ValueError as error:
                if str(error).startswith("対象の服"):
                    warnings.append(str(error))
                else:
                    logger.exception("推論の形式エラー")
                    warnings.append("自動採寸に失敗しました。寸法を入力してください")
            except Exception:
                logger.exception("推論に失敗")
                warnings.append("自動採寸に失敗しました。寸法を入力してください")
        cutout_base64, cutout_width, cutout_height = None, None, None
        if settings.stage in ("all", "cutout"):
            if bbox is None:
                warnings.append("服の範囲を指定してください")
            else:
                try:
                    cutout = garment_cutout(source, bbox, corners)
                    ok, encoded = cv2.imencode(".png", cutout)
                    if not ok or encoded.nbytes > MAX_BYTES:
                        raise ValueError("切り抜き画像を作成できませんでした")
                    cutout_base64 = base64.b64encode(encoded).decode("ascii")
                    cutout_height, cutout_width = cutout.shape[:2]
                except (ValueError, cv2.error):
                    warnings.append("切り抜きに失敗しました。服の範囲を調整してください")
        return {"imageId": str(uuid.uuid4()), "imageBase64": base64.b64encode(raw).decode("ascii"), "widthPx": width, "heightPx": height, "category": category, "bbox": bbox, "points": points, "paperCorners": corners, "pixelsPerCm": pixels_per_cm, "modelVersion": model_version, "cutoutBase64": cutout_base64, "cutoutWidthPx": cutout_width, "cutoutHeightPx": cutout_height, "warnings": warnings, "elapsedMs": round((time.perf_counter() - started) * 1000)}
    finally:
        processing.release()
        image.file.close()
