import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  measurementVersion,
  metadataSchema,
} from "#src/lib/measurement-schema";
import type { GarmentView } from "#src/lib/garment-records";

// 外部通信をすべて差し替え、実際のDBには書き込まない。
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.INTERNAL_API_TOKEN = "test-token-that-is-at-least-32-characters";
process.env.DEMO_PROFILE_ID = "6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34";
const { app } = await import("#src/app");
const headers = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` };
const garmentId = "11111111-1111-4111-8111-111111111111";

const metadata = {
  name: "",
  category: "trousers",
  imageId: "22222222-2222-4222-8222-222222222222",
  widthPx: 100,
  heightPx: 100,
  points: [],
  pixelsPerCm: null,
  paperCorners: [],
  modelVersion: null,
  measurements: {},
  measurementVersion,
};

// 服の行に書いた内容を覚え、読むときはその内容を返す
function mockBackend(t: TestContext) {
  const written: Record<string, unknown>[] = [];
  let row: Record<string, unknown> = {};
  t.mock.method(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname.startsWith("/storage/v1/object/sign/"))
        return Promise.resolve(
          Response.json({ signedURL: "/object/sign/garments/x?token=test" }),
        );
      if (url.pathname.startsWith("/storage/v1/object/"))
        return Promise.resolve(Response.json({ Key: "x" }));
      if (url.pathname.startsWith("/rest/v1/rpc/"))
        return Promise.resolve(new Response(null, { status: 204 }));
      if (url.pathname === "/rest/v1/garment_images")
        return Promise.resolve(new Response(null, { status: 201 }));
      assert.equal(url.pathname, "/rest/v1/garments");
      if (init?.method === "POST" || init?.method === "PATCH") {
        assert(typeof init.body === "string");
        const body = JSON.parse(init.body) as Record<string, unknown>;
        written.push(body);
        row = { ...row, ...body };
        return init.method === "POST"
          ? Promise.resolve(new Response(null, { status: 201 }))
          : Promise.resolve(Response.json({ id: garmentId }));
      }
      return Promise.resolve(
        Response.json({
          ...row,
          id: garmentId,
          purchased_month: null,
          seasons: [],
          created_at: "2026-10-18T00:00:00Z",
          garment_images: [],
        }),
      );
    },
  );
  return written;
}

function registration(colorFamily?: string) {
  const form = new FormData();
  // JPEGのSOF境界の確認用。写真の中身は読まない
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
  form.set("metadata", JSON.stringify({ ...metadata, colorFamily }));
  return app.request("/v1/garments", { method: "POST", headers, body: form });
}

void test("色の系統を送らずに登録した服は、色をnullにする", () => {
  assert.equal(metadataSchema.parse(metadata).colorFamily, null);
  assert.equal(
    metadataSchema.safeParse({ ...metadata, colorFamily: "rainbow" }).success,
    false,
  );
});

void test("登録で送った色の系統を保存し、服の詳細で返す", async (t) => {
  const written = mockBackend(t);
  assert.equal((await registration("navy")).status, 201);
  assert.equal(written[0].color_family, "navy");
  const detail = await app.request(`/v1/garments/${garmentId}`, { headers });
  assert.equal(((await detail.json()) as GarmentView).colorFamily, "navy");
});

void test("一覧に無い色は、登録とPATCHのどちらでも400にする", async (t) => {
  const written = mockBackend(t);
  assert.equal((await registration("rainbow")).status, 400);
  const patched = await app.request(`/v1/garments/${garmentId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ colorFamily: "rainbow" }),
  });
  assert.equal(patched.status, 400);
  assert.deepEqual(written, []);
});

void test("PATCHで色を選び直し、nullで分からないに戻せる", async (t) => {
  const written = mockBackend(t);
  for (const colorFamily of ["gray", null]) {
    const response = await app.request(`/v1/garments/${garmentId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ colorFamily }),
    });
    assert.equal(response.status, 200);
  }
  assert.deepEqual(
    written.map((body) => body.color_family),
    ["gray", null],
  );
});
