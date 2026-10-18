import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

// 外部通信をすべて差し替え、実際のDB・Storage・推論サービスには触れない。
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
const headers = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` };
const garment = {
  id,
  name: "",
  category: "short_sleeve_top",
  measurements: {},
  measurement_version: "df2-a4-flat-midpoint-v2",
  purchased_month: null,
  seasons: [],
  color_family: null,
  created_at: "2026-10-18T00:00:00Z",
  garment_images: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      storage_key: `${profileId}/${id}/measurement.jpg`,
      role: "measurement",
      width_px: 30,
      height_px: 40,
      points: [],
      pixels_per_cm: null,
      paper_corners: [],
      model_version: null,
    },
  ],
};

// 通信の順番を記録する。推論サービスへの片付けは、inferenceで失敗させられる
function mockBackend(t: TestContext, inference: () => Promise<Response>) {
  const calls: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url.origin}${url.pathname}`);
      if (url.origin === "http://127.0.0.1:8001") {
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          `Bearer ${inferenceToken}`,
        );
        return inference();
      }
      if (url.pathname === "/rest/v1/garments" && method === "GET")
        return Promise.resolve(Response.json(garment));
      if (url.pathname === "/storage/v1/object/garments")
        return Promise.resolve(Response.json([]));
      assert.equal(`${method} ${url.pathname}`, "DELETE /rest/v1/garments");
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  );
  return calls;
}

void test("服を消したら、DBとStorageを消したあとに、推論サービスの作業と写真も片付ける", async (t) => {
  const calls = mockBackend(t, () =>
    Promise.resolve(Response.json({ removed: 2, running: false })),
  );
  const response = await app.request(`/v1/garments/${id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(response.status, 204);
  assert.deepEqual(calls.slice(-2), [
    "DELETE http://127.0.0.1:54321/rest/v1/garments",
    `DELETE http://127.0.0.1:8001/textures/${id}`,
  ]);
});

void test("推論サービスが止まっていても、服の削除は済ませる", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  for (const inference of [
    () => Promise.reject(new TypeError("fetch failed")),
    () => Promise.resolve(new Response(null, { status: 503 })),
  ]) {
    const calls = mockBackend(t, inference);
    const response = await app.request(`/v1/garments/${id}`, {
      method: "DELETE",
      headers,
    });
    assert.equal(response.status, 204);
    assert(calls.includes("DELETE http://127.0.0.1:54321/rest/v1/garments"));
  }
  assert.equal(errors.mock.callCount(), 2);
});
