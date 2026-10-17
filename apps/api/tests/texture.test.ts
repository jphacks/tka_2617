import assert from "node:assert/strict";
import { test } from "node:test";
import type { BackPhotoResponse } from "#src/lib/garment-texture";

// 外部通信をすべて差し替え、実際のDB・Storageには書き込まない。
const profileId = "6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34";
const inferenceToken = "inference-test-token-at-least-32-characters";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.INTERNAL_API_TOKEN = "test-token-that-is-at-least-32-characters";
process.env.DEMO_PROFILE_ID = profileId;
process.env.INFERENCE_URL = "http://127.0.0.1:8001";
process.env.INFERENCE_TOKEN = inferenceToken;
const { app } = await import("#src/app");
const id = "11111111-1111-4111-8111-111111111111";
const path = `/v1/garments/${id}`;
const headers = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` };
const photos = [
  { role: "measurement", storage_key: "front.jpg" },
  { role: "back", storage_key: "back.jpg" },
  { role: "cutout", storage_key: "cutout.png" },
];

void test("裏面を保存できた場合は、生成依頼だけ失敗しても保存成功を返す", async (t) => {
  let imageSaved = false;
  t.mock.method(console, "error", () => {});
  t.mock.method(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/rest/v1/garments")
        return Promise.resolve(
          Response.json({
            category: "trousers",
            garment_images: imageSaved ? photos : [],
          }),
        );
      if (url.pathname === "/rest/v1/garment_images") {
        assert.equal(init?.method, "POST");
        imageSaved = true;
        return Promise.resolve(new Response(null, { status: 201 }));
      }
      if (url.pathname.startsWith("/storage/v1/object/"))
        return Promise.resolve(
          init?.method === "POST"
            ? Response.json({ Key: "saved.jpg" })
            : new Response("jpeg", {
                headers: { "Content-Type": "image/jpeg" },
              }),
        );
      assert.equal(url.pathname, "/textures");
      return Promise.resolve(
        Response.json({ detail: "template missing" }, { status: 503 }),
      );
    },
  );
  const form = new FormData();
  // JPEG読込の境界を通すためのSOFヘッダー。推論の画像検証はPython側で別に行う。
  form.set(
    "image",
    new File(
      [
        new Uint8Array([
          255, 216, 255, 192, 0, 11, 8, 0, 40, 0, 30, 1, 1, 17, 0,
        ]),
      ],
      "back.jpg",
      { type: "image/jpeg" },
    ),
  );
  const response = await app.request(`${path}/back`, {
    method: "PUT",
    headers,
    body: form,
  });
  assert.equal(response.status, 200);
  const result = (await response.json()) as BackPhotoResponse;
  assert.equal(result.id, id);
  assert.equal(result.texture.status, "failed");
  assert.equal(imageSaved, true);
});
