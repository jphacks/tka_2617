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
  # git worktreeで取り出したフォルダでは、.gitがファイルで、gitの本体は別の場所にある。
  # 作業フォルダだけを渡すとコンテナの中でgitが本体を見つけられず、調べずに通ってしまうので、本体も渡す。
  # コンテナの中の場所は/repoと/gitに固定する（WindowsのC:/…のパスはコンテナの中で使えないため）
  top=$(git rev-parse --show-toplevel)
  git_dir=$(git rev-parse --path-format=absolute --git-dir)
  common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
  # ふつうは空。worktreeでは/worktrees/<名前>になる
  worktree_part=${git_dir#"$common_dir"}
  # Git BashからDockerにパスを渡すとき、/repoなどが書き換えられないようにする
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v "$top:/repo" -v "$common_dir:/git" \
    -e "GIT_DIR=/git${worktree_part}" -e GIT_WORK_TREE=/repo \
    "$image" "${args[@]}" /repo
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
