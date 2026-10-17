import assert from "node:assert/strict";
import { test } from "node:test";
import { readPng } from "#src/lib/png";

const transparent = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAG0lEQVQIHWNkQAKMDECQYiT3f865R4yMDEgAAEVBBATEz/jIAAAAAElFTkSuQmCC",
  "base64",
);

void test("透過PNGの画像寸法とバイト列を保存前に確認する", async () => {
  const result = await readPng(
    new File([transparent], "cutout.png", { type: "image/png" }),
  );
  assert.equal(result.widthPx, 3);
  assert.equal(result.heightPx, 3);
  assert.deepEqual(result.bytes, transparent);
});

void test("JPEGの偽装・破損PNG・透明度なし・過大な寸法を拒否する", async () => {
  const noAlpha = Buffer.from(transparent);
  noAlpha[25] = 2;
  const huge = Buffer.from(transparent);
  huge.writeUInt32BE(5000, 16);
  const invalidChunk = Buffer.from(transparent);
  invalidChunk.writeUInt32BE(100000, 33);
  for (const bytes of [
    Buffer.from([255, 216, 255]),
    transparent.subarray(0, 40),
    noAlpha,
    huge,
    invalidChunk,
  ]) {
    await assert.rejects(
      readPng(new File([bytes], "cutout.png", { type: "image/png" })),
    );
  }
});
