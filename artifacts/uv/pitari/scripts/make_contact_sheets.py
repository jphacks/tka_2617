"""視点ごとの描画（<フォルダ>/<視点>.png）を1枚に並べる。

使い方（リポジトリ直下）：
  # 確認画像5種類の一覧（renders/sheet_check_*.png）
  ./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/make_contact_sheets.py
  # 写真から作ったテクスチャの一覧
  ./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/make_contact_sheets.py --dir artifacts/uv/pitari/trials/try1/renders --title 写真のテクスチャ
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
VIEWS = [
    ("front", "前から"),
    ("back", "後ろから"),
    ("wearer_right_side", "着用者の右側から"),
    ("wearer_left_side", "着用者の左側から"),
    ("neck_front_top", "襟まわり（前・上から）"),
    ("underarm_right", "右の脇の下（前・下から、体なし）"),
    ("underarm_left", "左の脇の下（前・下から、体なし）"),
    ("underarm_right_back", "右の脇の下（後ろ・下から、体なし）"),
    ("underarm_left_back", "左の脇の下（後ろ・下から、体なし）"),
    ("neck_back_top", "襟まわり（後ろ・上から）"),
]
TROUSERS_VIEWS = VIEWS[:4] + [
    ("crotch_front_low", "股まわり（前・下から、体なし）"),
    ("crotch_back_low", "股まわり（後ろ・下から、体なし）"),
]
TITLES = {
    "check_parts": "部位の色分け",
    "check_labels": "前後・左右の文字",
    "check_landmarks": "ランドマーク番号（球は3D座標から置いた点）",
    "check_grid": "カラーグリッド",
    "check_checker": "市松模様",
}
TILE = 450
COLUMNS = 5


def make_sheet(folder, title, path, views=VIEWS, columns=COLUMNS):
    title_font = ImageFont.truetype("C:/Windows/Fonts/BIZ-UDGothicB.ttc", 30)
    label_font = ImageFont.truetype("C:/Windows/Fonts/BIZ-UDGothicB.ttc", 20)
    rows = (len(views) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * TILE, rows * (TILE + 30) + 50), (25, 25, 25))
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 10), title, font=title_font, fill=(255, 255, 255))
    for k, (view, label) in enumerate(views):
        source = folder / f"{view}.png"
        if not source.exists():
            continue
        x, y = (k % columns) * TILE, 50 + (k // columns) * (TILE + 30)
        sheet.paste(Image.open(source).convert("RGB").resize((TILE, TILE)), (x, y + 30))
        draw.text((x + 8, y + 4), label, font=label_font, fill=(255, 255, 255))
    sheet.save(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", help="視点ごとの画像があるフォルダ")
    parser.add_argument("--title", default="作業用モデルに貼った確認画像")
    parser.add_argument("--trousers", action="store_true", help="ズボンの6視点を並べる")
    args = parser.parse_args()
    if args.dir:
        folder = Path(args.dir)
        options = {"views": TROUSERS_VIEWS, "columns": 3} if args.trousers else {}
        make_sheet(folder, args.title, folder.parent / "sheet.png", **options)
        return
    for check, title in TITLES.items():
        make_sheet(ROOT / "renders" / check, f"{title}（{check}.png を作業用モデルに貼った確認画像）", ROOT / "renders" / f"sheet_{check}.png")


if __name__ == "__main__":
    main()
