import assert from "node:assert/strict";
import { test } from "node:test";
import { TOPS } from "@/components/try-on/use-try-on";
import { STRETCH_RATIO, WOVEN_STRETCH_RATIO } from "@/lib/garment";

void test("シャツだけが織物の伸び率で、Tシャツと長袖はニットの伸び率", () => {
  assert.equal(TOPS.shirt.stretchRatio, WOVEN_STRETCH_RATIO);
  assert.equal(TOPS.tshirt.stretchRatio, STRETCH_RATIO);
  assert.equal(TOPS.longsleeve.stretchRatio, STRETCH_RATIO);
});
