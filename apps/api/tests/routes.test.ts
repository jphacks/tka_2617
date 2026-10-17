import assert from "node:assert/strict";
import { test } from "node:test";

// 通信しないテスト用の値。実際の環境ファイルは読まない。
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.INTERNAL_API_TOKEN = "test-token-that-is-at-least-32-characters";
process.env.DEMO_PROFILE_ID = "6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34";
const { app } = await import("#src/app");
const headers = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` };

void test("health以外はBearer認証が必要", async () => {
  assert.equal((await app.request("/health")).status, 200);
  for (const path of [
    "/v1/measurements",
    "/v1/garments",
    "/v1/inference-status",
    "/v1/garments/11111111-1111-4111-8111-111111111111/images/22222222-2222-4222-8222-222222222222",
  ]) {
    assert.equal((await app.request(path)).status, 401);
  }
  assert.equal(
    (await app.request("/v1/measurements", { headers })).status,
    200,
  );
});

void test("壊れたJSON・ID・カテゴリをDB呼び出し前に拒否する", async () => {
  const response = await app.request("/v1/measurements", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(response.status, 400);
  assert.equal(
    (await app.request("/v1/garments/not-a-uuid", { headers })).status,
    400,
  );
  assert.equal(
    (
      await app.request(
        "/v1/garments/11111111-1111-4111-8111-111111111111/images/not-a-uuid",
        { headers },
      )
    ).status,
    400,
  );
  assert.equal(
    (await app.request("/v1/garments?category=skirt", { headers })).status,
    400,
  );
});
