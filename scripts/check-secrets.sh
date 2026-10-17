#!/usr/bin/env bash
# stagedの変更に、鍵やトークンなどの秘密が混ざっていないかをgitleaksで調べる（lefthookのpre-commit）。
# gitleaksが無ければDockerのイメージで動かす。どちらも動かせなければ飛ばし、PRのCIで調べる。
set -uo pipefail

# CIの.github/workflows/secrets.ymlと同じ版にする
image="zricethezav/gitleaks:v8.30.1"
# 秘密が見つかったときだけ2で終わらせ、gitleaksが動かなかったとき（1）と見分ける
args=(git --pre-commit --staged --redact --verbose --no-banner --exit-code 2)

if command -v gitleaks >/dev/null; then
  gitleaks "${args[@]}" .
  status=$?
elif command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  # Git BashからDockerにパスを渡すとき、/repoが書き換えられないようにする
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/repo" "$image" "${args[@]}" /repo
  status=$?
else
  echo "gitleaksもDockerも無いので、秘密の検出を飛ばす（PRのCIで調べる）"
  exit 0
fi

if [[ "$status" -eq 2 ]]; then
  echo "秘密が見つかった。stagedから外してからcommitする。誤検出なら、その行の末尾にgitleaks:allowと書く" >&2
  exit 1
fi
if [[ "$status" -ne 0 ]]; then
  echo "gitleaksを動かせなかったので、秘密の検出を飛ばす（PRのCIで調べる）" >&2
fi
exit 0
