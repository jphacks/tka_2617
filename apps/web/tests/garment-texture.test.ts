import assert from "node:assert/strict";
import { test } from "node:test";
import { textureImageUrl } from "@/lib/garment-texture";

const garmentId = "55555555-5555-4555-8555-555555555555";
const imageId = "66666666-6666-4666-8666-666666666666";
const imageUrl = `/api/garments/${garmentId}/images/${imageId}`;

void test("完成したテクスチャは、服の画像のURLで貼る", () => {
  assert.equal(
    textureImageUrl(garmentId, { status: "done", imageId }),
    imageUrl,
  );
});

void test("作り直しの間と、作り直しに失敗したときも、前に作ったものがあれば貼る", () => {
  assert.equal(
    textureImageUrl(garmentId, { status: "processing", imageId }),
    imageUrl,
  );
  assert.equal(
    textureImageUrl(garmentId, {
      status: "failed",
      message: "作れませんでした",
      imageId,
    }),
    imageUrl,
  );
});

void test("まだ無いときは貼らず、材質の色のまま出す", () => {
  assert.equal(textureImageUrl(garmentId, { status: "none" }), null);
  assert.equal(textureImageUrl(garmentId, { status: "processing" }), null);
  assert.equal(
    textureImageUrl(garmentId, {
      status: "failed",
      message: "作れませんでした",
    }),
    null,
  );
});
