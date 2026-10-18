import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { cutBackPhoto } from "@/lib/back-photo";

const photo = {
  file: new File([new Uint8Array([255, 216, 255, 217])], "back.jpg", {
    type: "image/jpeg",
  }),
  imageBase64: "/9j/2Q==",
  widthPx: 300,
  heightPx: 400,
};
const progress = () => undefined;

/** 推論の結果。工程ごとに必要な所だけを変える */
function detection(values: Record<string, unknown>) {
  return {
    imageId: "11111111-1111-4111-8111-111111111111",
    imageBase64: photo.imageBase64,
    cutoutBase64: null,
    cutoutWidthPx: null,
    cutoutHeightPx: null,
    widthPx: 300,
    heightPx: 400,
    category: "trousers",
    bbox: null,
    points: [],
    paperCorners: [],
    pixelsPerCm: null,
    modelVersion: null,
    warnings: [],
    elapsedMs: 1,
    measurements: {},
    measurementVersion: "df2-a4-flat-midpoint-v2",
    ...values,
  };
}

// /api/detectionsへの通信を、工程（stage）ごとの応答に差し替える
function mockDetections(
  t: TestContext,
  respond: (stage: string) => Response | Promise<Response>,
) {
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: string | URL | Request, init?: RequestInit) => {
      const options = (init?.body as FormData).get("options") as string;
      const { stage } = JSON.parse(options) as { stage: string };
      return respond(stage);
    },
  );
}

void test("推論の通信に失敗したら、裏面はJPEGだけで返す", async (t) => {
  mockDetections(t, () => Promise.reject(new TypeError("Failed to fetch")));
  const back = await cutBackPhoto(photo, "trousers", progress);
  assert.equal(back.image, photo.file);
  assert.equal(back.cutoutImage, null);
  assert.equal(back.previewUrl, `data:image/jpeg;base64,${photo.imageBase64}`);
});

void test("推論サービスが未設定（503）でも、裏面はJPEGだけで返す", async (t) => {
  mockDetections(t, () =>
    Response.json({ error: "推論サービスを設定してください" }, { status: 503 }),
  );
  const back = await cutBackPhoto(photo, "trousers", progress);
  assert.equal(back.cutoutImage, null);
  assert.equal(back.previewWidthPx, 300);
});

void test("服が見つからず切り抜けないときも、裏面はJPEGだけで返す", async (t) => {
  const stages: string[] = [];
  mockDetections(t, (stage) => {
    stages.push(stage);
    return Response.json(detection({}));
  });
  const back = await cutBackPhoto(photo, "trousers", progress);
  assert.equal(back.cutoutImage, null);
  // 服の範囲が無ければ、切り抜きは頼まない
  assert.deepEqual(stages, ["paper", "landmarks"]);
});

void test("切り抜けたら、切り抜きのPNGも返す", async (t) => {
  mockDetections(t, (stage) =>
    Response.json(
      detection(
        stage === "cutout"
          ? {
              cutoutBase64: "iVBORw0K",
              cutoutWidthPx: 120,
              cutoutHeightPx: 200,
            }
          : { bbox: [10, 10, 290, 390] },
      ),
    ),
  );
  const back = await cutBackPhoto(photo, "trousers", progress);
  assert.equal(back.image, photo.file);
  assert.equal(back.cutoutImage?.type, "image/png");
  assert.equal(back.previewUrl, "data:image/png;base64,iVBORw0K");
  assert.equal(back.previewWidthPx, 120);
});
