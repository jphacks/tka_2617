import assert from "node:assert/strict";
import { test } from "node:test";
import {
  closetFilterLabel,
  closetFilters,
  garmentsPath,
} from "@/lib/closet-filter";
import { categoryLabels } from "@/lib/garment-category";

void test("先頭に「すべて」があり、そのあとに服の種類がすべて並ぶ", () => {
  assert.equal(closetFilters[0], "all");
  assert.equal(closetFilterLabel("all"), "すべて");
  assert.deepEqual(
    closetFilters.slice(1).map(closetFilterLabel),
    Object.values(categoryLabels),
  );
});

void test("「すべて」ではcategoryを付けず、種類を選ぶとcategoryで絞り込む", () => {
  assert.equal(garmentsPath("all"), "/api/garments");
  for (const category of [
    "short_sleeve_top",
    "long_sleeve_top",
    "shirt",
    "trousers",
  ] as const) {
    const url = new URL(garmentsPath(category), "http://localhost");
    assert.equal(url.pathname, "/api/garments");
    assert.deepEqual([...url.searchParams], [["category", category]]);
  }
});

void test("追加されたシャツも、表示名とAPIのカテゴリを対応させる", () => {
  assert.ok(closetFilters.includes("shirt"));
  assert.equal(closetFilterLabel("shirt"), "シャツ");
});
