"""公開HRNetの構造と学習済み重みをCPUで使用する。"""

import importlib.util
import os
import threading
from pathlib import Path
import time

import cv2
import numpy as np
import yaml

from pitari import openvino_models
from pitari.geometry import crop_transform, decode_heatmaps

ROOT = Path(__file__).resolve().parents[1]
WEIGHT_NAME = "pose_hrnet-w48_384x288-deepfashion2_mAP_0.7017.pth"
SOURCE = ROOT / "models/hrnet-source"
DETECTOR = ROOT / "models/grounding-dino-tiny"
MODEL_VERSION = "df2-hrnet-w48-f4ac2e1-cpu-v1"


class Config(dict):
    def __getattr__(self, name):
        return self[name]


def config_tree(value):
    if isinstance(value, dict):
        return Config({key: config_tree(item) for key, item in value.items()})
    return value


def torch_threads():
    import torch
    torch.set_num_threads(max(1, min(8, int(os.environ.get("INFERENCE_THREADS", "4")))))


def build_pose():
    """公開HRNetの構造に、配布元の学習済み重みを読み込んだPyTorchのモデル。"""
    import torch
    spec = importlib.util.spec_from_file_location("pitari_hrnet", SOURCE / "lib/models/pose_hrnet.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with (SOURCE / "experiments/deepfashion2/hrnet/w48_384x288_adam_lr1e-3.yaml").open(encoding="utf-8") as file:
        config = config_tree(yaml.safe_load(file))
    model = module.get_pose_net(config, is_train=False)
    # 配布元のstate_dictだけを読む。任意オブジェクトのpickle読み込みは許可しない。
    state = torch.load(ROOT / "models" / WEIGHT_NAME, map_location="cpu", weights_only=True)
    if "state_dict" in state:
        state = state["state_dict"]
    state = {key.removeprefix("module."): value for key, value in state.items()}
    model.load_state_dict(state, strict=True)
    return model.cpu().eval()


class TorchPose:
    def __init__(self, model):
        torch_threads()
        self.model = model

    def __call__(self, batch):
        import torch
        with torch.inference_mode():
            return self.model(torch.from_numpy(batch))[0].cpu().numpy()


class TorchDetector:
    def __init__(self, processor):
        from transformers import AutoModelForZeroShotObjectDetection
        torch_threads()
        self.processor = processor
        self.model = AutoModelForZeroShotObjectDetection.from_pretrained(DETECTOR, local_files_only=True).cpu().eval()

    def __call__(self, image, caption):
        import torch
        inputs = self.processor(images=image, text=caption, return_tensors="pt")
        with torch.inference_mode():
            return self.model(**inputs), inputs.input_ids


class Models:
    def __init__(self):
        self.pose = None
        self.detector = None
        self.processor = None
        self.load_ms = None
        # 起動時の読み込みと、その間に届いた採寸が、同じモデルを二重に読まないようにする。
        self.loading = threading.Lock()

    def status(self):
        return {"device": "cpu", "weightsPresent": (ROOT / "models" / WEIGHT_NAME).is_file(), "sourcePresent": (SOURCE / "lib/models/pose_hrnet.py").is_file(), "modelLoaded": self.pose is not None, "detectorPresent": (DETECTOR / "config.json").is_file(), "modelLoadMs": self.load_ms}

    def load_pose(self):
        with self.loading:
            if self.pose is not None:
                return
            status = self.status()
            if not status["weightsPresent"] or not status["sourcePresent"]:
                raise FileNotFoundError("自動採寸モデルが未準備です。寸法を入力してください")
            started = time.perf_counter()
            # prepare_models.py --openvinoで変換してあれば、そちらを使う（ADR 0049）。
            self.pose = openvino_models.Pose() if openvino_models.POSE_IR.is_file() else TorchPose(build_pose())
            self.load_ms = round((time.perf_counter() - started) * 1000)

    def landmarks(self, image, category, bbox):
        self.load_pose()
        matrix, inverse = crop_transform(bbox)
        crop = cv2.warpAffine(image, matrix, (288, 384))
        # 配布元設定のCOLOR_RGB=falseに合わせ、BGRのまま正規化する。
        normalized = (crop.astype(np.float32) / 255 - np.float32([0.485, 0.456, 0.406])) / np.float32([0.229, 0.224, 0.225])
        heatmaps = self.pose(normalized.transpose(2, 0, 1)[None].copy())
        return decode_heatmaps(heatmaps, inverse, category, image.shape[1], image.shape[0])

    def load_detector(self):
        with self.loading:
            if self.detector is not None:
                return
            if not (DETECTOR / "config.json").is_file():
                raise FileNotFoundError("服の自動検出モデルが未配置です。カテゴリと服を囲む範囲を指定してください")
            from transformers import AutoProcessor
            processor = AutoProcessor.from_pretrained(DETECTOR, local_files_only=True)
            converted = all(path.is_file() for path in openvino_models.DETECTOR_IRS.values())
            self.detector = openvino_models.Detector(processor) if converted else TorchDetector(processor)
            self.processor = processor

    def preload(self):
        """最初の採寸でモデルの読み込み（PyTorchで約30秒、OpenVINOで約1分）を待たせないよう、起動時に読む。未配置のモデルは飛ばす。"""
        for load in (self.load_pose, self.load_detector):
            try:
                load()
            except FileNotFoundError:
                pass

    def detect(self, image, category):
        self.load_detector()
        from PIL import Image
        caption = {"auto": "short sleeve t-shirt. long sleeve top. trousers.", "short_sleeve_top": "short sleeve t-shirt.", "long_sleeve_top": "long sleeve top.", "trousers": "trousers."}[category]
        output, input_ids = self.detector(Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)), caption)
        result = self.processor.post_process_grounded_object_detection(output, input_ids, threshold=0.3, text_threshold=0.25, target_sizes=[image.shape[:2]])[0]
        labels = result["text_labels"] if "text_labels" in result else result.get("labels", [])
        candidates = []
        for box, score, label in zip(result["boxes"], result["scores"], labels):
            label = str(label).lower()
            if category != "auto":
                detected = category
            else:
                detected = "trousers" if "trousers" in label else "long_sleeve_top" if "long" in label else "short_sleeve_top" if "shirt" in label or "short" in label else None
            if detected and (category == "auto" or category == detected):
                candidates.append((float(score), detected, box.tolist()))
        if not candidates:
            raise ValueError("対象の服を検出できません。カテゴリと範囲を指定してください")
        _, selected, bbox = max(candidates, key=lambda item: item[0])
        bbox = [max(0, bbox[0]), max(0, bbox[1]), min(image.shape[1] - 1, bbox[2]), min(image.shape[0] - 1, bbox[3])]
        return selected, bbox
