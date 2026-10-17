import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

// 外部通信をすべて差し替え、実際のDB・Storageには書き込まない。
const profileId = "6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.INTERNAL_API_TOKEN = "test-token-that-is-at-least-32-characters";
process.env.DEMO_PROFILE_ID = profileId;
const { app } = await import("#src/app");
const id = "11111111-1111-4111-8111-111111111111";
const headers = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` };
// JPEG読込の境界を通すためのSOFヘッダー（30×40）
const jpeg = new Uint8Array([
  255, 216, 255, 192, 0, 11, 8, 0, 40, 0, 30, 1, 1, 17, 0,
]);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAG0lEQVQIHWNkQAKMDECQYiT3f865R4yMDEgAAEVBBATEz/jIAAAAAElFTkSuQmCC",
  "base64",
);

type Backend = {
  garment?: unknown;
  replaced?: Response;
};

// Supabaseへの通信を記録し、場面ごとの応答を返す。
function mockBackend(t: TestContext, backend: Backend) {
  const calls = {
    uploaded: [] as string[],
    removed: [] as string[][],
    replaced: [] as {
      role: string;
      storage_key: string;
      width_px: number;
      height_px: number;
    }[][],
  };
  t.mock.method(console, "error", () => {});
  function respond(input: string | URL | Request, init?: RequestInit) {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === "/rest/v1/garments") {
      assert.equal(url.searchParams.get("profile_id"), `eq.${profileId}`);
      return Response.json(backend.garment ?? null);
    }
    if (url.pathname === "/rest/v1/rpc/replace_garment_back") {
      const body = JSON.parse(init?.body as string) as {
        target_garment_id: string;
        target_profile_id: string;
        new_images: (typeof calls.replaced)[number];
      };
      assert.equal(body.target_garment_id, id);
      assert.equal(body.target_profile_id, profileId);
      calls.replaced.push(body.new_images);
      return backend.replaced ?? Response.json([]);
    }
    if (
      url.pathname === "/storage/v1/object/garments" &&
      init?.method === "DELETE"
    ) {
      const body = JSON.parse(init.body as string) as { prefixes: string[] };
      calls.removed.push(body.prefixes);
      return Response.json([]);
    }
    if (url.pathname.startsWith("/storage/v1/object/garments/")) {
      calls.uploaded.push(
        url.pathname.replace("/storage/v1/object/garments/", ""),
      );
      return Response.json({ Key: "saved" });
    }
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

async function putBack(withCutout: boolean) {
  const form = new FormData();
  form.set("image", new File([jpeg], "back.jpg", { type: "image/jpeg" }));
  if (withCutout)
    form.set("cutoutImage", new File([png], "back.png", { type: "image/png" }));
  return app.request(`/v1/garments/${id}/back`, {
    method: "PUT",
    headers,
    body: form,
  });
}

void test("初回の裏面は画像を上げてから行を作り、消す古い画像はない", async (t) => {
  const calls = mockBackend(t, { garment: { id } });
  const response = await putBack(true);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { id: string }).id, id);
  assert.equal(calls.uploaded.length, 2);
  assert.deepEqual(
    calls.replaced[0]?.map((image) => [
      image.role,
      image.width_px,
      image.height_px,
    ]),
    [
      ["back", 30, 40],
      ["back_cutout", 3, 3],
    ],
  );
  assert.deepEqual(
    calls.replaced[0]?.map((image) => image.storage_key),
    calls.uploaded,
  );
  assert.deepEqual(calls.removed, []);
});

void test("切り抜きを省略した差し替えは、DBが外した古い裏面と切り抜きの画像を消す", async (t) => {
  const calls = mockBackend(t, {
    garment: { id },
    replaced: Response.json([
      { removed_key: "old/back.jpg" },
      { removed_key: "old/back_cutout.png" },
    ]),
  });
  const response = await putBack(false);
  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.replaced[0]?.map((image) => image.role),
    ["back"],
  );
  assert.deepEqual(calls.removed, [["old/back.jpg", "old/back_cutout.png"]]);
});

void test("DBの差し替えに失敗したら、上げた画像だけを消して503を返す", async (t) => {
  const calls = mockBackend(t, {
    garment: { id },
    replaced: Response.json(
      { code: "XX000", message: "private failure" },
      { status: 500 },
    ),
  });
  const response = await putBack(true);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private failure"));
  assert.deepEqual(calls.removed, [calls.uploaded]);
});

void test("服がなければ画像を上げずに404を返す", async (t) => {
  const calls = mockBackend(t, { garment: null });
  const response = await putBack(true);
  assert.equal(response.status, 404);
  assert.deepEqual(calls.uploaded, []);
  assert.deepEqual(calls.replaced, []);
});

void test("差し替えの間に服が消えたら、上げた画像を消して404を返す", async (t) => {
  const calls = mockBackend(t, {
    garment: { id },
    replaced: Response.json(
      { code: "P0002", message: "garment not found" },
      { status: 400 },
    ),
  });
  const response = await putBack(false);
  assert.equal(response.status, 404);
  assert.deepEqual(calls.removed, [calls.uploaded]);
});
