#!/usr/bin/env bash
# PRの変更行数（足した行＋消した行）を数え、上限を超えたら警告する。CIは落とさない。
# .gitattributesでlinguist-generatedにしたファイル、バイナリ、テストは数えない。
# 使い方：bash scripts/pr-size.sh [比べる先]
# 比べる先を省略すると、今のブランチのPRのマージ先と比べる。PRがまだ無いときや、ghが使えないときはorigin/main
set -euo pipefail

# 積み上げたPRのマージ先は、mainではなく下のPRのブランチになる。mainと比べると、下のPRの変更まで数えてしまう
if [[ $# -ge 1 ]]; then
  base="$1"
elif pr_base=$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null) && [[ -n "$pr_base" ]]; then
  base="origin/${pr_base}"
else
  base="origin/main"
fi
limit="${PR_SIZE_LIMIT:-400}"
# テストは数えない。テストを書くほどPRが大きく見えると、テストを書かなくなるため
tests='(^|/)tests/|(^|/)test_[^/]*\.py$|\.test\.[cm]?[jt]sx?$'
echo "比べる先：${base}"

# 先に変数へ入れる。ループの中で直接読むと、比べる先を間違えてgit diffが失敗しても、0行として通ってしまう
diff=$(git diff --numstat --no-renames "${base}...HEAD")

total=0
counted=""
while IFS=$'\t' read -r added deleted path; do
  # 差分が無いと空の行が1つ来る
  [[ -z "$path" ]] && continue
  # バイナリは行数が「-」になる
  [[ "$added" == "-" ]] && continue
  generated=$(git check-attr linguist-generated -- "$path" | awk '{print $NF}')
  [[ "$generated" == "true" ]] && continue
  [[ "$path" =~ $tests ]] && continue
  lines=$((added + deleted))
  total=$((total + lines))
  counted+="${lines}"$'\t'"${path}"$'\n'
done <<< "$diff"

largest=$(printf '%s' "$counted" | sort -rn | head -5)
echo "変更行数：${total}行（上限の目安は${limit}行。生成物、バイナリ、テストは数えない）"
[[ -n "$largest" ]] && printf '%s\n' "$largest"

if [[ "$total" -gt "$limit" ]]; then
  message="変更が${total}行あり、目安の${limit}行を超えている。PRを分けられないか考え、分けないなら本文に理由を書く"
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::warning title=PRが大きい::${message}"
  else
    echo "警告：${message}"
  fi
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "### PRの変更行数：${total}行（目安は${limit}行）"
    echo
    echo "生成物（.gitattributesのlinguist-generated）、バイナリ、テストは数えない。大きいファイル："
    echo
    printf '%s\n' "$largest" | awk -F'\t' 'NF == 2 { printf "- `%s`：%s行\n", $2, $1 }'
  } >> "$GITHUB_STEP_SUMMARY"
fi
