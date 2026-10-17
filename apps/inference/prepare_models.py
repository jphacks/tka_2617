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


if __name__ == "__main__":
    main()
