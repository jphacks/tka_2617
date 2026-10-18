import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { TextureStatus } from "#src/lib/garment-texture";
import type { GarmentView } from "#src/lib/garment-records";

// 外部通信をすべて差し替え、実際のDB・Storage・推論サービスには触れない。
const profileId = "6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.INTERNAL_API_TOKEN = "test-token-that-is-at-least-32-characters";
process.env.DEMO_PROFILE_ID = profileId;
process.env.INFERENCE_URL = "http://127.0.0.1:8001";
process.env.INFERENCE_TOKEN = "inference-test-token-at-least-32-characters";
const { app } = await import("#src/app");
const id = "11111111-1111-4111-8111-111111111111";
const textureId = "22222222-2222-4222-8222-222222222222";
const newTextureId = "33333333-3333-4333-8333-333333333333";
const job = "2026-10-17_12-00-00_Tシャツ_11111111";
const headers = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` };
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAG0lEQVQIHWNkQAKMDECQYiT3f865R4yMDEgAAEVBBATEz/jIAAAAAElFTkSuQmCC",
  "base64",
);
const back = {
  id: "44444444-4444-4444-8444-444444444444",
  role: "back",
  texture_job: null,
  created_at: "2026-10-17T03:00:00+00:00",
};
const savedTexture = {
  id: textureId,
  role: "texture",
  texture_job: job,
  created_at: "2026-10-17T03:10:00+00:00",
};

type Fake = {
  images?: unknown[] | null;
  // 推論サービスの状態。nullならつながらない
  inference?: { status: number; body?: unknown } | null;
  texture?: Buffer;
  // DBの関数の戻り値。引数は今回上げた画像のキー
  saved?: (uploadedKey: string) => {
    image_id: string | null;
    removed_key: string | null;
  };
};

// どこに何を送ったかを記録しながら、DB・Storage・推論サービスの代わりに答える
function fake(t: TestContext, options: Fake) {
  const calls = {
    inference: [] as string[],
    uploaded: [] as { key: string; type: string | null }[],
    saved: [] as unknown[],
    removed: [] as string[],
  };
  function answer(input: string | URL | Request, init?: RequestInit) {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === "/rest/v1/garments") {
      assert.equal(url.searchParams.get("id"), `eq.${id}`);
      assert.equal(url.searchParams.get("profile_id"), `eq.${profileId}`);
      return Response.json(
        options.images === null ? null : { garment_images: options.images },
      );
    }
    if (url.origin === "http://127.0.0.1:8001") {
      calls.inference.push(decodeURIComponent(url.pathname));
      if (options.inference === null) throw new TypeError("fetch failed");
      if (url.pathname.endsWith("/texture.png"))
        return new Response(options.texture ?? png, {
          headers: { "Content-Type": "image/png" },
        });
      return Response.json(options.inference?.body ?? {}, {
        status: options.inference?.status ?? 404,
      });
    }
    if (url.pathname === "/rest/v1/rpc/save_garment_texture") {
      const body = JSON.parse(init?.body as string) as {
        new_image: { storage_key: string };
      };
      calls.saved.push(body);
      // 行が返らないのは、保存の失敗として扱われる
      return Response.json(
        options.saved ? [options.saved(body.new_image.storage_key)] : [],
      );
    }
    if (url.pathname.startsWith("/storage/v1/object/garments/")) {
      calls.uploaded.push({
        key: decodeURIComponent(
          url.pathname.slice("/storage/v1/object/garments/".length),
        ),
        type: new Headers(init?.headers).get("content-type"),
      });
      return Response.json({ Key: "uploaded" });
    }
    if (url.pathname === "/storage/v1/object/garments") {
      const body = JSON.parse(init?.body as string) as { prefixes: string[] };
      calls.removed.push(...body.prefixes);
      return Response.json([]);
    }
    throw new Error(`想定していない通信: ${url.href}`);
  }
  // answerの中で投げた例外は、fetchの失敗（rejectされたPromise）になる
  t.mock.method(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        resolve(answer(input, init));
      }),
  );
  return calls;
}

async function status(response: Response) {
  return (await response.json()) as TextureStatus;
}
const request = () => app.request(`/v1/garments/${id}/texture`, { headers });

void test("裏面が無い、または推論サービスに作業が無ければ、まだ作っていないと返す", async (t) => {
  await t.test("裏面が無い", async (t) => {
    const calls = fake(t, { images: [] });
    assert.deepEqual(await status(await request()), { status: "none" });
    assert.deepEqual(calls.inference, []);
  });
  await t.test("作業が無い", async (t) => {
    const calls = fake(t, { images: [back], inference: { status: 404 } });
    assert.deepEqual(await status(await request()), { status: "none" });
    assert.deepEqual(calls.inference, [`/textures/${id}`]);
  });
});

void test("待ちと作成中は、作成中と返す", async (t) => {
  for (const state of ["queued", "running"]) {
    await t.test(state, async (t) => {
      fake(t, {
        images: [back],
        inference: {
          status: 200,
          body: { status: state, job: null, error: null },
        },
      });
      assert.deepEqual(await status(await request()), {
        status: "processing",
      });
    });
  }
});

void test("完成した作業はStorageへ移し、古いテクスチャを消して画像のIDを返す", async (t) => {
  const calls = fake(t, {
    images: [back, { ...savedTexture, texture_job: "前の作業" }],
    inference: { status: 200, body: { status: "done", job, error: null } },
    saved: () => ({ image_id: newTextureId, removed_key: "old-texture.png" }),
  });
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(await status(response), {
    status: "done",
    imageId: newTextureId,
  });
  assert.deepEqual(calls.inference, [
    `/textures/${id}`,
    `/textures/${id}/${job}/texture.png`,
  ]);
  assert.equal(calls.uploaded.length, 1);
  const [uploaded] = calls.uploaded;
  assert.match(
    uploaded.key,
    new RegExp(`^${profileId}/${id}/texture-.+\\.png$`),
  );
  assert.equal(uploaded.type, "image/png");
  assert.deepEqual(calls.saved, [
    {
      target_garment_id: id,
      target_profile_id: profileId,
      expected_back_image_id: back.id,
      new_image: {
        storage_key: uploaded.key,
        width_px: 3,
        height_px: 3,
        texture_job: job,
      },
    },
  ]);
  assert.deepEqual(calls.removed, ["old-texture.png"]);
});

void test("同じ作業を保存済みなら、推論サービスから取り直さない", async (t) => {
  const calls = fake(t, {
    images: [back, savedTexture],
    inference: { status: 200, body: { status: "done", job, error: null } },
  });
  assert.deepEqual(await status(await request()), {
    status: "done",
    imageId: textureId,
  });
  assert.deepEqual(calls.inference, [`/textures/${id}`]);
  assert.deepEqual(calls.uploaded, []);
});

void test("同時に保存されていたら、今回上げた画像を消して、保存済みの画像を返す", async (t) => {
  const calls = fake(t, {
    images: [back],
    inference: { status: 200, body: { status: "done", job, error: null } },
    saved: (uploadedKey) => ({ image_id: textureId, removed_key: uploadedKey }),
  });
  assert.deepEqual(await status(await request()), {
    status: "done",
    imageId: textureId,
  });
  assert.equal(calls.uploaded.length, 1);
  assert.deepEqual(calls.removed, [calls.uploaded[0].key]);
});

void test("裏面を撮り直す前のテクスチャは使わない", async (t) => {
  const old = { ...savedTexture, created_at: "2026-10-17T02:00:00+00:00" };
  await t.test("推論サービスに作業が無い", async (t) => {
    fake(t, { images: [back, old], inference: { status: 404 } });
    assert.deepEqual(await status(await request()), { status: "none" });
  });
  await t.test("新しい作業の依頼が届かず、古い作業が最新のまま", async (t) => {
    const calls = fake(t, {
      images: [back, old],
      inference: { status: 200, body: { status: "done", job, error: null } },
    });
    assert.deepEqual(await status(await request()), { status: "none" });
    assert.deepEqual(calls.uploaded, []);
  });
  await t.test("推論サービスにつながらない", async (t) => {
    fake(t, { images: [back, old], inference: null });
    assert.equal((await request()).status, 503);
  });
});

void test("失敗の理由は画面に出さず、決まった文で返す", async (t) => {
  t.mock.method(console, "error", () => {});
  fake(t, {
    images: [back],
    inference: {
      status: 200,
      body: { status: "failed", job, error: "C:\\Users\\private\\path" },
    },
  });
  const response = await request();
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(body.includes('"status":"failed"'));
  assert.ok(!body.includes("private"));
});

void test("推論サービスにつながらなくても、保存済みのテクスチャは返す", async (t) => {
  for (const inference of [
    null,
    { status: 503 },
    { status: 200, body: "壊れた応答" },
  ]) {
    await t.test(JSON.stringify(inference), async (t) => {
      fake(t, { images: [back, savedTexture], inference });
      assert.deepEqual(await status(await request()), {
        status: "done",
        imageId: textureId,
      });
    });
    await t.test(`${JSON.stringify(inference)}で保存済みが無い`, async (t) => {
      fake(t, { images: [back], inference });
      const response = await request();
      assert.equal(response.status, 503);
    });
  }
});

void test("PNGでない画像は保存しない", async (t) => {
  const calls = fake(t, {
    images: [back],
    inference: { status: 200, body: { status: "done", job, error: null } },
    texture: Buffer.from("<html>not png</html>"),
  });
  assert.equal((await request()).status, 503);
  assert.deepEqual(calls.uploaded, []);
});

void test("保存するまでの間に裏面が撮り直されたら、保存せず、上げた画像を消して作成中を返す", async (t) => {
  const calls = fake(t, {
    images: [back],
    inference: { status: 200, body: { status: "done", job, error: null } },
    // DBの関数は、裏面が変わっていると行を変えず、image_idをnullにして返す
    saved: (uploadedKey) => ({ image_id: null, removed_key: uploadedKey }),
  });
  assert.deepEqual(await status(await request()), { status: "processing" });
  assert.equal(calls.uploaded.length, 1);
  assert.deepEqual(calls.removed, [calls.uploaded[0].key]);
});

void test("DBへの保存に失敗したら、上げた画像を消す", async (t) => {
  const calls = fake(t, {
    images: [back],
    inference: { status: 200, body: { status: "done", job, error: null } },
  });
  assert.equal((await request()).status, 503);
  assert.equal(calls.uploaded.length, 1);
  assert.deepEqual(calls.removed, [calls.uploaded[0].key]);
});

void test("認証・IDを確かめ、服が無ければ404を返す", async (t) => {
  const calls = fake(t, { images: null });
  assert.equal((await app.request(`/v1/garments/${id}/texture`)).status, 401);
  assert.equal(
    (await app.request("/v1/garments/bad/texture", { headers })).status,
    400,
  );
  assert.equal((await request()).status, 404);
  assert.deepEqual(calls.inference, []);
});

void test("作り直しの間と、作り直しに失敗したときも、今の写真から前に作ったテクスチャを返す", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const [state, expected] of [
    ["running", { status: "processing", imageId: textureId }],
    [
      "failed",
      {
        status: "failed",
        message:
          "テクスチャを作れませんでした。裏面を撮り直すか、もう一度作ってください",
        imageId: textureId,
      },
    ],
  ] as const) {
    await t.test(state, async (t) => {
      fake(t, {
        images: [back, savedTexture],
        inference: {
          status: 200,
          body: {
            status: state,
            job: "次の作業",
            error: "理由",
            backImageId: back.id,
          },
        },
      });
      assert.deepEqual(await status(await request()), expected);
    });
  }
});

void test("撮り直す前の裏面から作った作業は、無い扱いにして保存しない", async (t) => {
  const older = {
    status: 200,
    body: {
      status: "done",
      job,
      error: null,
      backImageId: "55555555-5555-4555-8555-555555555555",
    },
  };
  await t.test("今の写真のテクスチャが無い", async (t) => {
    const calls = fake(t, { images: [back], inference: older });
    assert.deepEqual(await status(await request()), { status: "none" });
    assert.deepEqual(calls.uploaded, []);
  });
  await t.test("今の写真から作ったテクスチャがある", async (t) => {
    const calls = fake(t, {
      images: [back, { ...savedTexture, texture_job: "前の作業" }],
      inference: { ...older, body: { ...older.body, status: "running" } },
    });
    assert.deepEqual(await status(await request()), {
      status: "done",
      imageId: textureId,
    });
    assert.deepEqual(calls.uploaded, []);
  });
  await t.test("今の裏面の作業なら保存する", async (t) => {
    const calls = fake(t, {
      images: [back],
      inference: { ...older, body: { ...older.body, backImageId: back.id } },
      saved: () => ({ image_id: newTextureId, removed_key: null }),
    });
    assert.deepEqual(await status(await request()), {
      status: "done",
      imageId: newTextureId,
    });
    assert.equal(calls.uploaded.length, 1);
  });
});

void test("服の詳細のimagesにはテクスチャを入れない（古いことがあるため）", async (t) => {
  const image = (imageId: string, role: string) => ({
    id: imageId,
    storage_key: `${role}.png`,
    role,
    width_px: 3,
    height_px: 3,
    points: [],
    pixels_per_cm: null,
    paper_corners: [],
    model_version: null,
    texture_job: role === "texture" ? job : null,
  });
  const signed: string[] = [];
  t.mock.method(globalThis, "fetch", (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname.startsWith("/storage/v1/object/sign/garments/")) {
      signed.push(url.pathname.split("/").at(-1) ?? "");
      return Promise.resolve(
        Response.json({ signedURL: "/object/sign/garments/x?token=test" }),
      );
    }
    assert.equal(url.pathname, "/rest/v1/garments");
    return Promise.resolve(
      Response.json({
        id,
        name: "",
        category: "trousers",
        measurements: {},
        measurement_version: "df2-a4-flat-midpoint-v2",
        purchased_month: null,
        seasons: [],
        color_family: null,
        created_at: "2026-10-17T00:00:00Z",
        garment_images: [image(back.id, "back"), image(textureId, "texture")],
      }),
    );
  });
  const response = await app.request(`/v1/garments/${id}`, { headers });
  assert.equal(response.status, 200);
  const garment = (await response.json()) as GarmentView;
  assert.deepEqual(
    garment.images.map((item) => item.role),
    ["back"],
  );
  assert.deepEqual(signed, ["back.png"]);
});
