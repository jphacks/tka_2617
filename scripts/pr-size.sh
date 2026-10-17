#!/usr/bin/env bash
# PRの変更行数（足した行＋消した行）を数え、上限を超えたら警告する。CIは落とさない。
# .gitattributesでlinguist-generatedにしたファイルと、バイナリは数えない。
# 使い方：bash scripts/pr-size.sh [比べる先。省略するとorigin/main]
set -euo pipefail

base="${1:-origin/main}"
limit="${PR_SIZE_LIMIT:-400}"

total=0
counted=""
while IFS=$'\t' read -r added deleted path; do
  # バイナリは行数が「-」になる
  [[ "$added" == "-" ]] && continue
  generated=$(git check-attr linguist-generated -- "$path" | awk '{print $NF}')
  [[ "$generated" == "true" ]] && continue
  lines=$((added + deleted))
  total=$((total + lines))
  counted+="${lines}"$'\t'"${path}"$'\n'
done < <(git diff --numstat --no-renames "${base}...HEAD")

largest=$(printf '%s' "$counted" | sort -rn | head -5)
echo "変更行数：${total}行（上限の目安は${limit}行。生成物とバイナリは数えない）"
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
    echo "生成物（.gitattributesのlinguist-generated）とバイナリは数えない。大きいファイル："
    echo
    printf '%s\n' "$largest" | awk -F'\t' 'NF == 2 { printf "- `%s`：%s行\n", $2, $1 }'
  } >> "$GITHUB_STEP_SUMMARY"
fi
