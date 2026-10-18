import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { GarmentView } from "#src/lib/garment-records";

// 外部通信をすべて差し替え、実際のDBには書き込まない。
const profileId = "6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.INTERNAL_API_TOKEN = "test-token-that-is-at-least-32-characters";
process.env.DEMO_PROFILE_ID = profileId;
const { app } = await import("#src/app");
const id = "11111111-1111-4111-8111-111111111111";
const headers = {
  Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}`,
  "Content-Type": "application/json",
};

const material = (id: string, label: string, sort_order: number) => ({
  id,
  label,
  sort_order,
});
const cotton = material("cotton", "綿", 1);
const polyester = material("polyester", "ポリエステル", 2);
const polyurethane = material("polyurethane", "ポリウレタン", 8);

type Backend = { rpcError?: { code: string; message: string } };

// Supabaseへの通信を記録し、場面ごとの応答を返す。
function mockBackend(t: TestContext, backend: Backend = {}) {
  const calls = { rpc: [] as unknown[], paths: [] as string[] };
  t.mock.method(console, "error", () => {});
  function respond(input: string | URL | Request, init?: RequestInit) {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.paths.push(url.pathname);
    if (url.pathname === "/rest/v1/rpc/set_garment_materials") {
      calls.rpc.push(JSON.parse(init?.body as string));
      return backend.rpcError
        ? Response.json(backend.rpcError, { status: 400 })
        : new Response(null, { status: 204 });
    }
    if (url.pathname === "/rest/v1/materials") {
      assert.equal(url.searchParams.get("order"), "sort_order.asc");
      return Response.json([cotton, polyester, polyurethane]);
    }
    if (url.pathname === "/rest/v1/garments" && init?.method === "PATCH")
      return Response.json({ id });
    if (url.pathname === "/rest/v1/garments")
      return Response.json({
        id,
        name: "チノパン",
        category: "trousers",
        measurements: {},
        measurement_version: "df2-a4-flat-midpoint-v2",
        purchased_month: null,
        seasons: [],
        color_family: null,
        created_at: "2026-10-18T00:00:00Z",
        garment_images: [],
        // DBは順を決めずに返すので、apiが並べる
        garment_materials: [
          { percent: 2, materials: polyurethane },
          { percent: 49, materials: polyester },
          { percent: 49, materials: cotton },
        ],
      });
    throw new Error(`想定外の通信：${init?.method ?? "GET"} ${url.pathname}`);
  }
  t.mock.method(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(respond(input, init)),
  );
  return calls;
}

function patch(body: unknown) {
  return app.request(`/v1/garments/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

void test("混率の誤りは、DBに送る前に400で止める", async (t) => {
  const calls = mockBackend(t);
  for (const materials of [
    [],
    [{ materialId: "cotton", percent: 90 }],
    [
      { materialId: "cotton", percent: 50 },
      { materialId: "cotton", percent: 50 },
    ],
    [{ materialId: "cotton", percent: 99.5 }],
    [{ materialId: "Cotton", percent: 100 }],
    Array.from({ length: 11 }, (_, i) => ({
      materialId: `m${"_".repeat(i)}`,
      percent: i === 0 ? 90 : 1,
    })),
  ]) {
    assert.equal((await patch({ materials })).status, 400);
  }
  assert.deepEqual(calls.paths, []);
});

void test("素材を差し替えるときは、DBの関数に服・プロフィール・混率を渡す", async (t) => {
  const calls = mockBackend(t);
  const response = await patch({
    materials: [
      { materialId: "cotton", percent: 98 },
      { materialId: "polyurethane", percent: 2 },
    ],
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.rpc, [
    {
      target_garment_id: id,
      target_profile_id: profileId,
      new_materials: [
        { material_id: "cotton", percent: 98 },
        { material_id: "polyurethane", percent: 2 },
      ],
    },
  ]);
});

void test("一覧に無い素材は400を返し、一緒に送った名前も変えない", async (t) => {
  const calls = mockBackend(t, {
    rpcError: { code: "23503", message: "foreign key violation" },
  });
  const response = await patch({
    name: "新しい名前",
    materials: [{ materialId: "unknown", percent: 100 }],
  });
  assert.equal(response.status, 400);
  assert.deepEqual(calls.paths, ["/rest/v1/rpc/set_garment_materials"]);
});

void test("服の素材は、割合の多い順、同じ割合なら一覧の順に並べる", async (t) => {
  mockBackend(t);
  const response = await app.request(`/v1/garments/${id}`, { headers });
  assert.equal(response.status, 200);
  const garment = (await response.json()) as GarmentView;
  assert.deepEqual(garment.materials, [
    { materialId: "cotton", label: "綿", percent: 49 },
    { materialId: "polyester", label: "ポリエステル", percent: 49 },
    { materialId: "polyurethane", label: "ポリウレタン", percent: 2 },
  ]);
});

void test("素材の一覧は、画面に並べる順で、IDと名前を返す", async (t) => {
  mockBackend(t);
  const response = await app.request("/v1/materials", { headers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    materials: [
      { id: "cotton", label: "綿" },
      { id: "polyester", label: "ポリエステル" },
      { id: "polyurethane", label: "ポリウレタン" },
    ],
  });
});
