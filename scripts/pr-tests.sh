#!/usr/bin/env bash
# 処理（apiのsrc/services・src/lib、webのsrc/lib）を足したり変えたりしたのに、
# 同じアプリのtests/が1つも変わっていなければ警告する。消すだけの変更や、動きを変えない書き直しもあるので、CIは落とさない。
# 使い方：bash scripts/pr-tests.sh [比べる先]（省略したときの決め方はscripts/pr-size.shと同じ）
set -euo pipefail

if [[ $# -ge 1 ]]; then
  base="$1"
elif pr_base=$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null) && [[ -n "$pr_base" ]]; then
  base="origin/${pr_base}"
else
  base="origin/main"
fi
echo "比べる先：${base}"

# 先に変数へ入れる。git diffが失敗したら、ここで止まる
changed=$(git diff --name-only --no-renames --diff-filter=AM "${base}...HEAD")
tests_changed=$(git diff --name-only --no-renames "${base}...HEAD" -- apps/api/tests apps/web/tests)

untested=""
for app in api web; do
  case "$app" in
    api) pattern='^apps/api/src/(services|lib)/.*\.ts$' ;;
    web) pattern='^apps/web/src/lib/.*\.ts$' ;;
  esac
  sources=$(printf '%s\n' "$changed" | grep -E "$pattern" || true)
  [[ -z "$sources" ]] && continue
  printf '%s\n' "$tests_changed" | grep -q "^apps/${app}/tests/" && continue
  while IFS= read -r path; do
    # 生成物（DBの型など）は、テストを書く対象ではない
    [[ $(git check-attr linguist-generated -- "$path" | awk '{print $NF}') == "true" ]] && continue
    untested+="${path}"$'\n'
  done <<< "$sources"
done

if [[ -z "$untested" ]]; then
  echo "処理の変更に、テストの変更がそろっている（または処理を変えていない）"
  exit 0
fi

message="処理を変えたのに、そのアプリのtests/が変わっていない。テストを足すか、要らない理由をPRの本文に書く"
echo "テストの無い処理の変更："
printf '%s' "$untested"
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  echo "::warning title=テストが変わっていない::${message}"
else
  echo "警告：${message}"
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "### テストが変わっていない処理の変更"
    echo
    echo "${message}。"
    echo
    printf '%s' "$untested" | awk 'NF { printf "- `%s`\n", $0 }'
  } >> "$GITHUB_STEP_SUMMARY"
fi
