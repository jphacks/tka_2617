import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  detectionOptionsSchema,
  measurementInputSchema,
  measurementVersion,
} from "#src/lib/measurement-schema";
import {
  calculateMeasurements,
  measurementDefinitions,
} from "#src/lib/measurements";
import { requestInference } from "#src/lib/inference-client";
import { detectGarment } from "#src/services/detect-garment";
import { HttpError } from "#src/lib/http-error";

export const detections = new Hono().post(
  "/",
  zValidator(
    "form",
    z.object({ image: z.instanceof(File), options: z.string().max(10000) }),
    (result, c) => {
      if (!result.success)
        return c.json({ error: "画像と撮影条件を確認してください" }, 400);
    },
  ),
  async (c) => {
    const form = c.req.valid("form");
    let value: unknown;
    try {
      value = JSON.parse(form.options);
    } catch {
      throw new HttpError(400, "撮影条件の形式を確認してください");
    }
    const options = detectionOptionsSchema.safeParse(value);
    if (!options.success)
      throw new HttpError(400, "撮影条件を確認してください");
    return c.json(await detectGarment(form.image, options.data));
  },
);
export const measurements = new Hono()
  .get("/", (c) =>
    c.json({ definitions: measurementDefinitions, measurementVersion }),
  )
  .post(
    "/",
    zValidator("json", measurementInputSchema, (result, c) => {
      if (!result.success)
        return c.json({ error: "測定点と画像のサイズを確認してください" }, 400);
    }),
    (c) => {
      const input = c.req.valid("json");
      return c.json({
        imageId: input.imageId,
        measurements: calculateMeasurements(input),
        measurementVersion,
      });
    },
  );
export const inferenceStatus = new Hono().get("/", async (c) => {
  const schema = z.object({
    device: z.literal("cpu"),
    weightsPresent: z.boolean(),
    sourcePresent: z.boolean(),
    modelLoaded: z.boolean(),
    detectorPresent: z.boolean(),
    modelLoadMs: z.number().nullable(),
  });
  return c.json(schema.parse(await requestInference("/status")));
});
