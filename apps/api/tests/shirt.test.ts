import assert from "node:assert/strict";
import { test } from "node:test";
import type { DetectionResult } from "#src/lib/measurement-schema";

// 推論サービス・DB・Storageには接続せず、シャツを長そでとして推論に送り、シャツとして返すことを確認する。
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.INTERNAL_API_TOKEN = "test-token-that-is-at-least-32-characters";
process.env.DEMO_PROFILE_ID = "6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34";
process.env.INFERENCE_URL = "http://127.0.0.1:8001";
process.env.INFERENCE_TOKEN = "inference-test-token-at-least-32-characters";
const { app } = await import("#src/app");
const headers = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` };
const points = Array.from({ length: 33 }, (_, i) => ({
  id: i + 1,
  x: i + 1,
  y: 50,
  score: null,
}));

void test("シャツは長そでとして検出・採寸し、種類はシャツのまま返す", async (t) => {
  let sent: Record<string, unknown> = {};
  t.mock.method(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      assert.equal(url.href, "http://127.0.0.1:8001/detect");
      const form = init?.body as FormData;
      sent = JSON.parse(form.get("options") as string) as Record<
        string,
        unknown
      >;
      return Promise.resolve(
        Response.json({
          imageId: "11111111-1111-4111-8111-111111111111",
          imageBase64: "",
          cutoutBase64: null,
          cutoutWidthPx: null,
          cutoutHeightPx: null,
          widthPx: 100,
          heightPx: 100,
          category: "long_sleeve_top",
          bbox: [1, 1, 90, 90],
          points,
          paperCorners: [],
          pixelsPerCm: 10,
          modelVersion: "test",
          warnings: [],
          elapsedMs: 1,
        }),
      );
    },
  );
  const form = new FormData();
  // JPEGのSOF境界の確認用。写真の復号は推論側のテストで確認する。
  form.set(
    "image",
    new File(
      [
        new Uint8Array([
          255, 216, 255, 192, 0, 11, 8, 0, 100, 0, 100, 1, 1, 17, 0, 255, 217,
        ]),
      ],
      "front.jpg",
      { type: "image/jpeg" },
    ),
  );
  form.set(
    "options",
    JSON.stringify({
      stage: "landmarks",
      category: "shirt",
      bbox: [1, 1, 90, 90],
    }),
  );
  const response = await app.request("/v1/detections", {
    method: "POST",
    headers,
    body: form,
  });
  assert.equal(response.status, 200);
  assert.equal(sent.category, "long_sleeve_top");
  const result = (await response.json()) as DetectionResult;
  assert.equal(result.category, "shirt");
  // 長そでの定義どおり、肩幅は7番から33番、袖丈は7番から11番の距離
  assert.equal(result.measurements.shoulderWidthCm, 2.6);
  assert.equal(result.measurements.sleeveLengthCm, 0.4);
});

void test("シャツの寸法は長そでと同じ定義で計算する", async () => {
  const measure = async (category: string) => {
    const response = await app.request("/v1/measurements", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        imageId: "11111111-1111-4111-8111-111111111111",
        category,
        widthPx: 100,
        heightPx: 100,
        points,
        pixelsPerCm: 10,
      }),
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as Pick<DetectionResult, "measurements">)
      .measurements;
  };
  assert.deepEqual(await measure("shirt"), await measure("long_sleeve_top"));
});

void test("シャツはテンプレートがないので、テクスチャを依頼しない", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () =>
    Promise.resolve(
      Response.json({
        category: "shirt",
        created_at: "2026-10-17T00:00:00Z",
        garment_images: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            role: "measurement",
            storage_key: "front.jpg",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            role: "back",
            storage_key: "back.jpg",
          },
        ],
      }),
    ),
  );
  const response = await app.request(
    "/v1/garments/11111111-1111-4111-8111-111111111111/texture",
    { method: "POST", headers },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "シャツはまだテクスチャを作れません",
  });
  // DBで種類を確かめるだけで、写真のダウンロードと推論サービスへの依頼はしない
  assert.equal(fetch.mock.callCount(), 1);
});
