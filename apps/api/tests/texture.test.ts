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
const registeredAt = "2026-10-17T02:12:59.163258+00:00";
const backImageId = "22222222-2222-4222-8222-222222222222";
const savedPoints = [{ id: 1, x: 120.5, y: 80, score: 0.9 }];
const savedCorners = [
  [10, 20],
  [300, 20],
  [300, 420],
  [10, 420],
];
const unmeasured = { points: [], paper_corners: [] };
const photos = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    role: "measurement",
    storage_key: "front.jpg",
    width_px: 960,
    height_px: 1280,
    points: savedPoints,
    paper_corners: savedCorners,
  },
  {
    id: backImageId,
    role: "back",
    storage_key: "back.jpg",
    width_px: 960,
    height_px: 1280,
    ...unmeasured,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    role: "cutout",
    storage_key: "cutout.png",
    width_px: 600,
    height_px: 900,
    ...unmeasured,
  },
];

void test("Tシャツ・長そで・シャツ・ズボンは保存済みのカテゴリ・表裏JPEGで生成を依頼する", async (t) => {
  for (const category of [
    "short_sleeve_top",
    "long_sleeve_top",
    "shirt",
    "trousers",
  ]) {
    await t.test(category, async (t) => {
      const downloaded: string[] = [];
      let submitted = false;
      t.mock.method(
        globalThis,
        "fetch",
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(input instanceof Request ? input.url : input);
          if (url.pathname === "/rest/v1/garments") {
            assert.equal(url.searchParams.get("id"), `eq.${id}`);
            assert.equal(url.searchParams.get("profile_id"), `eq.${profileId}`);
            return Response.json({
              category,
              created_at: registeredAt,
              garment_images: photos,
            });
          }
          if (url.pathname.startsWith("/storage/v1/object/")) {
            downloaded.push(url.pathname.split("/").at(-1) ?? "");
            return new Response(
              url.pathname.endsWith("front.jpg") ? "front bytes" : "back bytes",
              { headers: { "Content-Type": "image/jpeg" } },
            );
          }
          assert.equal(url.href, "http://127.0.0.1:8001/textures");
          assert.equal(
            new Headers(init?.headers).get("Authorization"),
            `Bearer ${inferenceToken}`,
          );
          const form = init?.body as FormData;
          assert.equal(form.get("garmentId"), id);
          assert.equal(form.get("category"), category);
          assert.equal(form.get("garmentCreatedAt"), registeredAt);
          assert.equal(form.get("backImageId"), backImageId);
          assert.deepEqual(JSON.parse(form.get("frontSaved") as string), {
            widthPx: 960,
            heightPx: 1280,
            points: savedPoints,
            paperCorners: savedCorners,
          });
          assert.equal(await (form.get("front") as File).text(), "front bytes");
          assert.equal(await (form.get("back") as File).text(), "back bytes");
          submitted = true;
          return Response.json({ accepted: true }, { status: 202 });
        },
      );
      const response = await app.request(`${path}/texture`, {
        method: "POST",
        headers,
      });
      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "accepted" });
      assert.deepEqual(downloaded, ["front.jpg", "back.jpg"]);
      assert.equal(submitted, true);
    });
  }
});

void test("点もA4の四隅も保存していない服は、推論サービスに推論させる", async (t) => {
  let form: FormData | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/rest/v1/garments")
        return Promise.resolve(
          Response.json({
            category: "short_sleeve_top",
            created_at: registeredAt,
            garment_images: photos.map((photo) => ({
              ...photo,
              ...unmeasured,
            })),
          }),
        );
      if (url.pathname.startsWith("/storage/v1/object/"))
        return Promise.resolve(
          new Response("jpeg", { headers: { "Content-Type": "image/jpeg" } }),
        );
      form = init?.body as FormData;
      return Promise.resolve(
        Response.json({ accepted: true }, { status: 202 }),
      );
    },
  );
  const response = await app.request(`${path}/texture`, {
    method: "POST",
    headers,
  });
  assert.equal(response.status, 202);
  assert.equal(form?.has("frontSaved"), false);
});

void test("認証・ID・写真不足を確認し、勝手に推論を開始しない", async (t) => {
  let reads = 0;
  let data: unknown = {
    category: "trousers",
    created_at: registeredAt,
    garment_images: photos.slice(0, 1),
  };
  t.mock.method(globalThis, "fetch", (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.pathname, "/rest/v1/garments");
    reads++;
    return Promise.resolve(Response.json(data));
  });
  assert.equal(
    (await app.request(`${path}/texture`, { method: "POST" })).status,
    401,
  );
  assert.equal(
    (await app.request("/v1/garments/bad/texture", { method: "POST", headers }))
      .status,
    400,
  );
  assert.equal(reads, 0);
  assert.equal(
    (await app.request(`${path}/texture`, { method: "POST", headers })).status,
    400,
  );
  data = null;
  assert.equal(
    (await app.request(`${path}/texture`, { method: "POST", headers })).status,
    404,
  );
});

void test("生成受付の失敗を成功扱いせず、画面へ安全なエラーを返す", async (t) => {
  for (const backendStatus of [429, 503, 200]) {
    await t.test(String(backendStatus), async (t) => {
      t.mock.method(globalThis, "fetch", (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname === "/rest/v1/garments")
          return Promise.resolve(
            Response.json({
              category: "trousers",
              created_at: registeredAt,
              garment_images: photos,
            }),
          );
        if (url.pathname.startsWith("/storage/v1/object/"))
          return Promise.resolve(
            new Response("jpeg", {
              headers: { "Content-Type": "image/jpeg" },
            }),
          );
        return Promise.resolve(
          Response.json(
            { detail: "private-path-and-stack" },
            { status: backendStatus },
          ),
        );
      });
      const response = await app.request(`${path}/texture`, {
        method: "POST",
        headers,
      });
      assert.equal(response.status, backendStatus === 429 ? 429 : 503);
      const body = await response.text();
      assert.ok(!body.includes("private-path-and-stack"));
    });
  }
});

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
            created_at: registeredAt,
            garment_images: imageSaved ? photos : [],
          }),
        );
      if (url.pathname === "/rest/v1/rpc/replace_garment_back") {
        imageSaved = true;
        return Promise.resolve(Response.json([]));
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
