import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  measurementVersion,
  metadataSchema,
} from "#src/lib/measurement-schema";

// 外部通信をすべて差し替え、実際のDBには書き込まない。
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.INTERNAL_API_TOKEN = "test-token-that-is-at-least-32-characters";
process.env.DEMO_PROFILE_ID = "6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34";
const { app } = await import("#src/app");
const headers = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` };

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

// 写真の行に書いた内容を覚える
function mockBackend(t: TestContext) {
  const images: Record<string, unknown>[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname.startsWith("/storage/v1/object/"))
        return Promise.resolve(Response.json({ Key: "x" }));
      if (url.pathname.startsWith("/rest/v1/rpc/"))
        return Promise.resolve(new Response(null, { status: 204 }));
      if (url.pathname === "/rest/v1/garment_images") {
        assert(typeof init?.body === "string");
        images.push(...(JSON.parse(init.body) as Record<string, unknown>[]));
        return Promise.resolve(new Response(null, { status: 201 }));
      }
      assert.equal(url.pathname, "/rest/v1/garments");
      return Promise.resolve(new Response(null, { status: 201 }));
    },
  );
  return images;
}

function registration(bbox?: number[]) {
  const form = new FormData();
  // 100×100のJPEGのSOF。写真の中身は読まない
  const jpeg = new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 100, 0, 100, 1, 1, 17, 0, 255, 217,
  ]);
  form.set("image", new File([jpeg], "front.jpg", { type: "image/jpeg" }));
  form.set("metadata", JSON.stringify({ ...metadata, bbox }));
  return app.request("/v1/garments", { method: "POST", headers, body: form });
}

void test("服の範囲を送らずに登録した服は、範囲をnullにする", () => {
  assert.equal(metadataSchema.parse(metadata).bbox, null);
  assert.equal(
    metadataSchema.safeParse({ ...metadata, bbox: [50, 10, 20, 90] }).success,
    false,
  );
});

void test("登録で送った服の範囲を、採寸の写真の行に保存する", async (t) => {
  const images = mockBackend(t);
  assert.equal((await registration([5, 10, 95, 100])).status, 201);
  assert.deepEqual(
    images.map((image) => [image.role, image.bbox]),
    [["measurement", [5, 10, 95, 100]]],
  );
});

void test("写真からはみ出した服の範囲は、写真の中に切り詰め、登録は止めない", async (t) => {
  const images = mockBackend(t);
  assert.equal((await registration([5, 10, 100.4, 130])).status, 201);
  assert.deepEqual(images[0].bbox, [5, 10, 100, 100]);
});

void test("写真の外にある服の範囲は保存しない", async (t) => {
  const images = mockBackend(t);
  assert.equal((await registration([120, 10, 150, 90])).status, 201);
  assert.equal(images[0].bbox, null);
});
