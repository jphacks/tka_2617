"""公開HRNetの構造と学習済み重みをCPUで使用する。"""

import importlib.util
import os
from pathlib import Path
import time

import cv2
import numpy as np
import yaml

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


class Models:
    def __init__(self):
        self.pose = None
        self.detector = None
        self.processor = None
        self.load_ms = None

    def status(self):
        return {"device": "cpu", "weightsPresent": (ROOT / "models" / WEIGHT_NAME).is_file(), "sourcePresent": (SOURCE / "lib/models/pose_hrnet.py").is_file(), "modelLoaded": self.pose is not None, "detectorPresent": (DETECTOR / "config.json").is_file(), "modelLoadMs": self.load_ms}

    def load_pose(self):
        if self.pose is not None:
            return
        status = self.status()
        if not status["weightsPresent"] or not status["sourcePresent"]:
            raise FileNotFoundError("自動採寸モデルが未準備です。寸法を入力してください")
        import torch
        torch.set_num_threads(max(1, min(8, int(os.environ.get("INFERENCE_THREADS", "4")))))
        started = time.perf_counter()
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
        self.pose = model.cpu().eval()
        self.load_ms = round((time.perf_counter() - started) * 1000)

    def landmarks(self, image, category, bbox):
        self.load_pose()
        import torch
        matrix, inverse = crop_transform(bbox)
        crop = cv2.warpAffine(image, matrix, (288, 384))
        # 配布元設定のCOLOR_RGB=falseに合わせ、BGRのまま正規化する。
        normalized = (crop.astype(np.float32) / 255 - np.float32([0.485, 0.456, 0.406])) / np.float32([0.229, 0.224, 0.225])
        tensor = torch.from_numpy(normalized.transpose(2, 0, 1).copy()).unsqueeze(0)
        with torch.inference_mode():
            heatmaps = self.pose(tensor)[0].cpu().numpy()
        return decode_heatmaps(heatmaps, inverse, category, image.shape[1], image.shape[0])

    def detect(self, image, category):
        if not (DETECTOR / "config.json").is_file():
            raise FileNotFoundError("服の自動検出モデルが未配置です。カテゴリと服を囲む範囲を指定してください")
        import torch
        from PIL import Image
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
        torch.set_num_threads(max(1, min(8, int(os.environ.get("INFERENCE_THREADS", "4")))))
        if self.detector is None:
            self.processor = AutoProcessor.from_pretrained(DETECTOR, local_files_only=True)
            self.detector = AutoModelForZeroShotObjectDetection.from_pretrained(DETECTOR, local_files_only=True).cpu().eval()
        caption = {"auto": "t-shirt. trousers.", "short_sleeve_top": "t-shirt.", "trousers": "trousers."}[category]
        inputs = self.processor(images=Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)), text=caption, return_tensors="pt")
        with torch.inference_mode():
            output = self.detector(**inputs)
        result = self.processor.post_process_grounded_object_detection(output, inputs.input_ids, threshold=0.3, text_threshold=0.25, target_sizes=[image.shape[:2]])[0]
        labels = result["text_labels"] if "text_labels" in result else result.get("labels", [])
        candidates = []
        for box, score, label in zip(result["boxes"], result["scores"], labels):
            detected = "trousers" if "trousers" in str(label) else "short_sleeve_top" if "shirt" in str(label) else None
            if detected and (category == "auto" or category == detected):
                candidates.append((float(score), detected, box.tolist()))
        if not candidates:
            raise ValueError("対象の服を検出できません。カテゴリと範囲を指定してください")
        _, selected, bbox = max(candidates, key=lambda item: item[0])
        bbox = [max(0, bbox[0]), max(0, bbox[1]), min(image.shape[1] - 1, bbox[2]), min(image.shape[0] - 1, bbox[3])]
        return selected, bbox
