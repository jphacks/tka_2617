import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bearerAuth } from "hono/bearer-auth";
import { env } from "#src/lib/env";
import { health } from "#src/routes/health";
import { bodyLimit } from "hono/body-limit";
import {
  detections,
  measurements,
  inferenceStatus,
} from "#src/routes/detections";
import { HttpError } from "#src/lib/http-error";
import { garments } from "#src/routes/garments";

// /v1 は web（BFF）からだけ呼ばれる想定なので、共有トークンが無ければ弾く。
// ルートは .route("/garments", garments) のように、この式へつなげて足す。
// 別の文で足すと、web から型が見えなくなる（https://hono.dev/docs/guides/rpc）
const v1 = new Hono()
  .use(bearerAuth({ token: env.INTERNAL_API_TOKEN }))
  .use(
    bodyLimit({
      maxSize: 18 * 1024 * 1024,
      onError: (c) => c.json({ error: "送信する画像が大きすぎます" }, 413),
    }),
  )
  .route("/detections", detections)
  .route("/measurements", measurements)
  .route("/inference-status", inferenceStatus)
  .route("/garments", garments);

export const app = new Hono()
  .route("/health", health)
  .route("/v1", v1)
  .onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json(
        { error: "認証またはリクエストの形式を確認してください" },
        error.status,
      );
    if (error instanceof HttpError)
      return c.json({ error: error.message }, error.status);
    console.error("API処理に失敗しました", error);
    return c.json(
      { error: "処理に失敗しました。設定と入力を確認してください" },
      500,
    );
  });

export type AppType = typeof app;
export type {
  Category,
  LandmarkPoint,
  MeasurementInput,
  Measurements,
  MeasurementKey,
  GarmentMetadata,
  DetectionOptions,
  DetectionResult,
} from "#src/lib/measurement-schema";
export type { MeasurementDefinition } from "#src/lib/measurements";
export type { GarmentView } from "#src/lib/garment-records";
