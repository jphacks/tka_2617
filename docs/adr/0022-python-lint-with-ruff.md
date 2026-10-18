# 0022 Pythonのlintと整形にruffを使い、ディレクトリごとに入れていく

日付：2026-10-17

## 背景

Pythonは、推論（`apps/inference`）、Blenderのスクリプト（`assets/blender`）、UVテンプレート（`artifacts/uv`）の3か所にある。TypeScriptにはESLintとPrettierがあり、lefthookとCIで走るが、Pythonには何も無かった。AIが書くコードが増えるほど、未使用のimportや、書き方のばらつきが残りやすい。

ただ、今のコードをruffで整形すると、約3000行が変わる（推論が約500行、Blenderが約660行、`artifacts/uv`が約1800行）。3か所とも作業中なので、まとめて整形すると、作業中のブランチとぶつかる。

## 決定

- Pythonのlintと整形にruffを使う。設定はルートの`ruff.toml`で、ルールはruffの標準
- ruffのバージョンは`ruff.toml`の`required-version`で固定し、lefthookとCIで同じものを動かす
- lefthookは、uvがあれば`uvx`でruffを動かす（`check --fix`のあとに`format`）。uvが無い人のcommitは止めず、PRのCIで確かめる
- 今あるPythonのディレクトリは、`ruff.toml`の`extend-exclude`で外しておく。持ち主の作業が一区切りしたら、ディレクトリごとに整形のPRを出し、excludeから消す
- mdの中のPythonのコード例は整形しない（`[format]`の`exclude`）。lefthookはmdをruffに渡さないので、CIだけで落ちてしまうため

## 理由

- lintと整形が1つの道具で済み、速い
- 標準のルールで、未使用のimportや変数、ループの変数を関数に閉じ込めるバグ（B023）などを調べられる。AIが残しがちな誤りを止められる
- 整形をディレクトリごとに分けると、PRが小さくなり、持ち主と時期を合わせられる
- uvで動かせば、推論の仮想環境やBlenderのPythonに、ruffを入れなくて済む

## 代替案

- 今すべて整形する：すぐそろうが、PRが約3000行になり、作業中のブランチとぶつかる
- lintだけ入れ、整形はしない：差分は小さいが、書き方がそろわない
- flake8、isort、black：同じことができるが、道具が3つになる
- ruffを推論の`requirements.txt`に入れる：Blenderと`artifacts/uv`のスクリプトは、その仮想環境を使わない

## 影響

- excludeから消すまで、そのディレクトリのPythonは検査されない
- Pythonを書く人は、uvを入れるとcommit前に直せる（[setup.md](../setup.md#必要なもの)）
- ruffの標準のルールは、バージョンで変わる（0.16.0で59から413に増え、0.17.0でも変わった）。上げるときは`ruff.toml`、`lefthook.yml`、`.github/workflows/ci.yml`の3か所を変え、新しい指摘を直す

## 参考文献

- [Ruff: Settings](https://docs.astral.sh/ruff/settings/)：`required-version`はPEP 440の書き方で、合わないとruffがエラーで止まる。`force-exclude`は、pre-commitのように名指しで渡したファイルにもexcludeを効かせる
- [Ruff: Configuring Ruff](https://docs.astral.sh/ruff/configuration/)：名指しで渡したファイルは、`force-exclude`が無いとexcludeされない
- [Ruff: Default rules](https://docs.astral.sh/ruff/default-rules/)：標準で有効なルールの一覧
- [Ruff 0.16.x changelog](https://github.com/astral-sh/ruff/blob/main/changelogs/0.16.x.md)：標準のルールが59から413に増えた
- [uv: Installation](https://docs.astral.sh/uv/getting-started/installation/)：Homebrewとwingetでの入れ方
