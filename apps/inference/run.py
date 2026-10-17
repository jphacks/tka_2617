"""専用仮想環境からローカル推論APIを起動する。"""

import os
from pathlib import Path


def main():
    environment = Path(__file__).parent / ".env"
    if environment.exists():
        for line in environment.read_text(encoding="utf-8-sig").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"'))
    if len(os.environ.get("INFERENCE_TOKEN", "")) < 32:
        raise SystemExit("apps/inference/.envのINFERENCE_TOKENを32文字以上で設定してください")
    import uvicorn
    uvicorn.run("pitari.app:app", host="127.0.0.1", port=int(os.environ.get("INFERENCE_PORT", "8001")), workers=1)


if __name__ == "__main__":
    main()
