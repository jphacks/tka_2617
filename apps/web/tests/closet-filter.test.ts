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
  assert.equal(
    garmentsPath("long_sleeve_top"),
    "/api/garments?category=long_sleeve_top",
  );
  assert.equal(garmentsPath("trousers"), "/api/garments?category=trousers");
});
