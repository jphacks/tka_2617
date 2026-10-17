import assert from "node:assert/strict";
import { test } from "node:test";
import { measurementVersion } from "#src/lib/measurement-schema";
import type { GarmentView } from "#src/lib/garment-records";

// DB・Storageには接続せず、登録したカテゴリ・寸法・33点が取得時にも残ることを確認する。
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.INTERNAL_API_TOKEN = "test-token-that-is-at-least-32-characters";
process.env.DEMO_PROFILE_ID = "6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34";
const { app } = await import("#src/app");
const headers = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` };

void test("長そでの写真・手入力寸法・33点を登録して一覧と詳細で取得できる", async (t) => {
  let saved: Record<string, unknown> = {};
  let images: Record<string, unknown>[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname.startsWith("/storage/v1/object/sign/"))
        return Promise.resolve(
          Response.json({
            signedURL: "/object/sign/garments/test.jpg?token=test",
          }),
        );
      if (url.pathname.startsWith("/storage/v1/object/"))
        return Promise.resolve(Response.json({ Key: "test.jpg" }));
      // 素材は、素材のテスト（materials.test.ts）で確かめる
      if (url.pathname === "/rest/v1/rpc/set_garment_materials")
        return Promise.resolve(new Response(null, { status: 204 }));
      if (init?.method === "POST") {
        assert(typeof init.body === "string");
        const body = JSON.parse(init.body) as
          Record<string, unknown> | Record<string, unknown>[];
        if (url.pathname.endsWith("/garment_images"))
          images = body as Record<string, unknown>[];
        else saved = body as Record<string, unknown>;
        return Promise.resolve(new Response(null, { status: 201 }));
      }
      const row = {
        ...saved,
        garment_images: images,
        purchased_month: null,
        seasons: [],
        created_at: "2026-10-17T00:00:00Z",
      };
      return Promise.resolve(
        Response.json(url.searchParams.has("id") ? row : [row]),
      );
    },
  );
  const points = Array.from({ length: 33 }, (_, i) => ({
    id: i + 1,
    x: i + 1,
    y: 50,
    score: null,
  }));
  const form = new FormData();
  // JPEGのSOF境界の確認用。写真の復号と切り抜きは推論側のテストで確認する。
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
    "metadata",
    JSON.stringify({
      name: "長そで",
      category: "long_sleeve_top",
      imageId: "11111111-1111-4111-8111-111111111111",
      widthPx: 100,
      heightPx: 100,
      points,
      pixelsPerCm: null,
      paperCorners: [],
      modelVersion: null,
      measurements: {
        shoulderWidthCm: 45,
        sleeveLengthCm: 60,
        bodyWidthCm: 50,
        bodyLengthCm: 70,
      },
      measurementVersion,
    }),
  );
  const created = await app.request("/v1/garments", {
    method: "POST",
    headers,
    body: form,
  });
  assert.equal(created.status, 201);
  const { id } = (await created.json()) as { id: string };
  assert.equal(saved.category, "long_sleeve_top");
  assert.deepEqual(images[0].points, points);
  const detail = await app.request(`/v1/garments/${id}`, { headers });
  assert.equal(detail.status, 200);
  const garment = (await detail.json()) as GarmentView;
  assert.equal(garment.category, "long_sleeve_top");
  assert.equal(garment.measurements.sleeveLengthCm, 60);
  assert.equal(garment.images[0].points.length, 33);
  const list = await app.request("/v1/garments?category=long_sleeve_top", {
    headers,
  });
  assert.equal(list.status, 200);
  assert.equal(
    ((await list.json()) as { garments: GarmentView[] }).garments[0].id,
    id,
  );
});
