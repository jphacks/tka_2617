"""Grounding DINOとHRNetをOpenVINOのIRに変換し、変換したものを動かす（ADR 0049）。

PyTorchのままだと、服の検出がCPUの4スレッドで1枚約23秒かかる。
OpenVINOはIntelのCPU向けに同じモデルを速く動かせる。変換したモデルは変換に使った画像の大きさでしか動かないため、
縦長・横長の2つの大きさで変換し、画像はその大きさに収めて余白を足す（余白はpixel_maskで隠す）。文は決まった長さまで埋める。
"""

from pathlib import Path
from types import SimpleNamespace

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "models/openvino"
# 前処理は短辺800・長辺1333に縮める。3:4の写真は800×1066になる。
DETECTOR_SHAPES = {"portrait": (1066, 800), "landscape": (800, 1066)}
DETECTOR_IRS = {name: FOLDER / f"grounding-dino-tiny-{name}.xml" for name in DETECTOR_SHAPES}
POSE_IR = FOLDER / "pose-hrnet-w48.xml"
TEXT_LENGTH = 16
# DINOのBERTが文の区切りとして扱うトークン（[CLS]・[SEP]・.・?）。
SPECIAL_TOKENS = [101, 102, 1012, 1029]


def text_masks(input_ids):
    """transformersのgenerate_masks_with_special_tokens_and_transfer_mapと同じ結果を、ループなしで求める。

    元の関数は特別なトークンの数だけPythonでループするため、変換すると変換に使った文の区切りに固定される。
    """
    import torch

    # OpenVINOにcummin・cummax・isinの変換がないため、トークンの組（長さ×長さ）の比較と最小・最大で求める。
    batch, length = input_ids.shape
    index = torch.arange(length, device=input_ids.device).expand(batch, length)
    special = (input_ids[:, :, None] == torch.tensor(SPECIAL_TOKENS, device=input_ids.device)).any(dim=2)
    # 行が各トークン、列が特別なトークンの候補。
    later = (index[:, None, :] >= index[:, :, None]) & special[:, None, :]
    earlier = (index[:, None, :] < index[:, :, None]) & special[:, None, :]
    # 各トークンの、その位置以降で最初の特別なトークン。ここまでが1つの句になる。
    key = torch.where(later, index[:, None, :], torch.full_like(later, length, dtype=index.dtype)).amin(dim=2)
    # 各トークンより前で最後の特別なトークン。なければ元の関数と同じく0から数える。
    previous = torch.where(earlier, index[:, None, :], torch.zeros_like(earlier, dtype=index.dtype)).amax(dim=2)
    start = previous + 1
    inside = (key < length) & (key != 0) & (key != length - 1) & (index >= start)
    same = (key[:, :, None] == key[:, None, :]) & inside[:, :, None] & inside[:, None, :]
    attention = same | torch.eye(length, dtype=torch.bool, device=input_ids.device)[None]
    positions = torch.where(inside, index - start, torch.zeros_like(index))
    return attention, positions


def orientation(image):
    return "portrait" if image.height >= image.width else "landscape"


def detector_inputs(processor, image, caption):
    """PILの画像と文から、向きに合わせて形を固定した入力と、埋める前のinput_idsを返す。

    pred_boxesは余白を除いた画像に対する割合で返るので、transformersの後処理をそのまま使える。
    """
    from PIL import Image

    width, height = image.size
    canvas_height, canvas_width = DETECTOR_SHAPES[orientation(image)]
    scale = min(800 / min(width, height), 1333 / max(width, height), canvas_height / height, canvas_width / width)
    # transformersの前処理と同じく双線形で縮める。
    resized = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.BILINEAR)
    encoded = processor(images=resized, text=caption, return_tensors="np", do_resize=False)
    pixels = encoded["pixel_values"]
    _, _, h, w = pixels.shape
    canvas = np.zeros((1, 3, canvas_height, canvas_width), np.float32)
    canvas[:, :, :h, :w] = pixels
    mask = np.zeros((1, canvas_height, canvas_width), np.int64)
    mask[:, :h, :w] = 1
    ids = encoded["input_ids"]
    if ids.shape[1] > TEXT_LENGTH:
        raise ValueError("検出の文が長すぎます")
    pad = TEXT_LENGTH - ids.shape[1]
    feed = {
        "pixel_values": canvas,
        "pixel_mask": mask,
        "input_ids": np.pad(ids, ((0, 0), (0, pad))),
        "token_type_ids": np.pad(encoded["token_type_ids"], ((0, 0), (0, pad))),
        "attention_mask": np.pad(encoded["attention_mask"], ((0, 0), (0, pad))),
    }
    return feed, ids


def convert_detector(model_dir):
    from unittest.mock import patch

    import openvino as ov
    import torch
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
    from transformers.models.grounding_dino import modeling_grounding_dino
    from PIL import Image

    processor = AutoProcessor.from_pretrained(model_dir, local_files_only=True)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(model_dir, local_files_only=True).eval()

    def logit(x, eps=None):
        # OpenVINOにaten::logitの変換がないため、同じ式で書く。
        z = x if eps is None else x.clamp(eps, 1 - eps)
        return torch.log(z / (1 - z))

    FOLDER.mkdir(parents=True, exist_ok=True)
    for name, (height, width) in DETECTOR_SHAPES.items():
        feed, _ = detector_inputs(processor, Image.new("RGB", (width, height), (200, 200, 200)), "short sleeve t-shirt.")
        example = {key: torch.from_numpy(value) for key, value in feed.items()}
        with torch.no_grad(), patch.object(torch.special, "logit", logit), \
                patch.object(modeling_grounding_dino, "generate_masks_with_special_tokens_and_transfer_map", text_masks):
            converted = ov.convert_model(model, example_input=example)
        converted.reshape({key: list(value.shape) for key, value in feed.items()})
        ov.save_model(converted, DETECTOR_IRS[name])


def convert_pose(model):
    import openvino as ov
    import torch

    with torch.no_grad():
        converted = ov.convert_model(model, example_input=torch.zeros(1, 3, 384, 288), input=[1, 3, 384, 288])
    FOLDER.mkdir(parents=True, exist_ok=True)
    ov.save_model(converted, POSE_IR)


def compile_model(path):
    import openvino as ov

    # 読み込みは約1分かかるが、起動時に裏で済ませる。準備したものを残すCACHE_DIRは、12秒縮むだけで0.9GB使うので使わない。
    # 内蔵GPU（Iris Xe）では、変換したDINOの推論がドライバのエラー（CL_EXEC_STATUS_ERROR）で止まった。
    return ov.Core().compile_model(path, "CPU")


class Detector:
    """変換したGrounding DINO。transformersのモデルと同じく、後処理に渡せるlogitsとpred_boxesを返す。"""

    def __init__(self, processor):
        self.processor = processor
        self.compiled = {name: compile_model(path) for name, path in DETECTOR_IRS.items()}

    def __call__(self, image, caption):
        """埋めたトークンのlogitsは、PyTorchで動かしたときと同じく-infになる。"""
        import torch

        feed, ids = detector_inputs(self.processor, image, caption)
        result = self.compiled[orientation(image)](feed)
        return SimpleNamespace(logits=torch.from_numpy(result[0]), pred_boxes=torch.from_numpy(result[1])), torch.from_numpy(ids)


class Pose:
    def __init__(self):
        self.compiled = compile_model(POSE_IR)

    def __call__(self, tensor):
        return self.compiled(tensor)[0][0]
