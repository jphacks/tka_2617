# UVテンプレートと検証データを最初から作り直す。リポジトリ直下のPowerShellで実行する。
# Windows PowerShell 5.1が日本語のコメントを読めるよう、このファイルはBOM付きUTF-8で保存する。
#   ./artifacts/uv/pitari/scripts/run_all.ps1
# 元のpitari.blendは読むだけで、上書きしない。作業用.blendはコピーから作り直す。
$ErrorActionPreference = "Stop"
$Blender = "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe"
$Python = "./apps/inference/.venv/Scripts/python.exe"
$Source = "artifacts/uv/pitari/inputs/tshirt/pitari.blend"
$Work = "artifacts/uv/pitari/pitari_uv_work.blend"

if (-not (Test-Path -LiteralPath $Source)) {
    throw "別途用意したpitari.blendをartifacts/uv/pitari/inputs/tshirt/へ置いてください。"
}
New-Item -ItemType Directory -Force -Path "artifacts/uv/pitari/data" | Out-Null
Copy-Item -LiteralPath $Source -Destination $Work -Force
& $Blender -b $Work --factory-startup --python artifacts/uv/pitari/scripts/inspect_scene.py -- artifacts/uv/pitari/data/scene_inspection.json
& $Blender -b $Work --factory-startup --python artifacts/uv/pitari/scripts/export_mesh_data.py -- artifacts/uv/pitari/data/mesh_export.json
& $Python artifacts/uv/pitari/scripts/build_template.py
& $Blender -b $Work --factory-startup --python artifacts/uv/pitari/scripts/apply_check_textures.py
& $Python artifacts/uv/pitari/scripts/make_contact_sheets.py
& $Blender -b $Work --factory-startup --python artifacts/uv/pitari/scripts/verify_work_blend.py
# CIのformat:checkに合わせて、書き出したJSONを整形する。pnpmがなくても動くよう、入っているprettierを直接使う。
& node ./node_modules/prettier/bin/prettier.cjs --write artifacts/uv/pitari
