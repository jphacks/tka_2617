"""実行時の自動ダウンロードを避け、必要なモデルを事前に取得する。"""

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REVISION = "f4ac2e1ef63e08fc51733cdf042b607b41f59261"
REPOSITORY = "https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch.git"
DETECTOR_REVISION = "a2bb814dd30d776dcf7e30523b00659f4f141c71"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--detector", action="store_true", help="任意の自動検出モデルも取得する")
    parser.add_argument("--openvino", action="store_true", help="取得済みのモデルをOpenVINOのIRに変換する")
    arguments = parser.parse_args()
    source = ROOT / "models/hrnet-source"
    if not source.exists():
        subprocess.run(["git", "clone", REPOSITORY, str(source)], check=True)
    actual = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    if actual != REVISION:
        subprocess.run(["git", "-C", str(source), "checkout", "--detach", REVISION], check=True)
    if arguments.detector:
        from huggingface_hub import snapshot_download
        snapshot_download("IDEA-Research/grounding-dino-tiny", revision=DETECTOR_REVISION, local_dir=ROOT / "models/grounding-dino-tiny", allow_patterns=["*.json", "*.txt", "*.safetensors"])
    print("HRNetの構造を準備しました。学習済み.pthはREADMEの手順でmodels/に置いてください。")
    if arguments.openvino:
        convert()


def convert():
    """変換は合わせて10分ほどかかる。変換したものが読み込めることも確かめる。"""
    from pitari import openvino_models
    from pitari.models import DETECTOR, WEIGHT_NAME, Models, build_pose

    if not (ROOT / "models" / WEIGHT_NAME).is_file():
        raise SystemExit("学習済み重みが未配置です。READMEの手順でmodels/に置いてから変換してください")
    openvino_models.convert_pose(build_pose())
    print(f"HRNetを変換しました：{openvino_models.POSE_IR}")
    if (DETECTOR / "config.json").is_file():
        openvino_models.convert_detector(DETECTOR)
        print(f"Grounding DINOを変換しました：{openvino_models.FOLDER}")
    Models().preload()
    print("変換したモデルを読み込めました")


if __name__ == "__main__":
    main()
