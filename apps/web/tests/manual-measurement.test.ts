import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyMeasurements, manualResult } from "@/lib/manual-measurement";

const photo = { imageBase64: "/9j/2Q==", widthPx: 300, heightPx: 400 };

void test("推論を使わない結果は、写真と服の種類だけを持ち、寸法を推定しない", () => {
  const result = manualResult(
    photo,
    "long_sleeve_top",
    "df2-a4-flat-midpoint-v2",
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(result.imageId, "11111111-1111-4111-8111-111111111111");
  assert.equal(result.imageBase64, photo.imageBase64);
  assert.equal(result.widthPx, 300);
  assert.equal(result.heightPx, 400);
  assert.equal(result.category, "long_sleeve_top");
  // 点・A4・縮尺・切り抜きは持たない
  assert.equal(result.bbox, null);
  assert.deepEqual(result.points, []);
  assert.deepEqual(result.paperCorners, []);
  assert.equal(result.pixelsPerCm, null);
  assert.equal(result.cutoutBase64, null);
  assert.equal(result.modelVersion, null);
  assert.deepEqual(result.measurements, emptyMeasurements);
});

void test("画像のIDを渡さなければ、毎回新しいIDを作る", () => {
  const first = manualResult(photo, "trousers", "df2-a4-flat-midpoint-v2");
  const second = manualResult(photo, "trousers", "df2-a4-flat-midpoint-v2");
  assert.match(first.imageId, /^[0-9a-f-]{36}$/);
  assert.notEqual(first.imageId, second.imageId);
});
