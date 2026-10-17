import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  categorySchema,
  metadataSchema,
  measurementsSchema,
} from "#src/lib/measurement-schema";
import { HttpError } from "#src/lib/http-error";
import { purchasedMonthSchema, seasonSchema } from "#src/lib/garment-records";
import { createGarment } from "#src/services/create-garment";
import { listGarments } from "#src/services/list-garments";
import { getGarment } from "#src/services/get-garment";
import { getGarmentImage } from "#src/services/get-garment-image";
import { updateGarment } from "#src/services/update-garment";
import { replaceGarmentBack } from "#src/services/replace-garment-back";
import { requestGarmentTexture } from "#src/services/request-garment-texture";
import { getGarmentTexture } from "#src/services/get-garment-texture";
import { deleteGarment } from "#src/services/delete-garment";
import type { TextureRequestResult } from "#src/lib/garment-texture";

const idSchema = z.object({ id: z.uuid() });
export const garments = new Hono()
  .get(
    "/:id/images/:imageId",
    zValidator(
      "param",
      z.object({ id: z.uuid(), imageId: z.uuid() }),
      (result, c) => {
        if (!result.success)
          return c.json({ error: "画像のIDを確認してください" }, 400);
      },
    ),
    async (c) => {
      const { id, imageId } = c.req.valid("param");
      const image = await getGarmentImage(id, imageId);
      return new Response(image, {
        headers: {
          "Content-Type": image.type,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  )
  .get(
    "/",
    zValidator(
      "query",
      z.object({ category: categorySchema.optional() }),
      (result, c) => {
        if (!result.success)
          return c.json({ error: "カテゴリを確認してください" }, 400);
      },
    ),
    async (c) => c.json(await listGarments(c.req.valid("query").category)),
  )
  .post(
    "/",
    zValidator(
      "form",
      z.object({
        image: z.instanceof(File),
        originalImage: z.instanceof(File).optional(),
        cutoutImage: z.instanceof(File).optional(),
        metadata: z.string().max(30000),
      }),
      (result, c) => {
        if (!result.success)
          return c.json({ error: "画像と登録内容を確認してください" }, 400);
      },
    ),
    async (c) => {
      const form = c.req.valid("form");
      let value: unknown;
      try {
        value = JSON.parse(form.metadata);
      } catch {
        throw new HttpError(400, "登録内容の形式を確認してください");
      }
      const metadata = metadataSchema.safeParse(value);
      if (!metadata.success)
        throw new HttpError(400, "登録内容と寸法を確認してください");
      return c.json(
        await createGarment(
          form.image,
          form.originalImage,
          metadata.data,
          form.cutoutImage,
        ),
        201,
      );
    },
  )
  .get(
    "/:id",
    zValidator("param", idSchema, (result, c) => {
      if (!result.success)
        return c.json({ error: "服のIDを確認してください" }, 400);
    }),
    async (c) => c.json(await getGarment(c.req.valid("param").id)),
  )
  .patch(
    "/:id",
    zValidator("param", idSchema, (result, c) => {
      if (!result.success)
        return c.json({ error: "服のIDを確認してください" }, 400);
    }),
    zValidator(
      "json",
      z
        .object({
          name: z.string().trim().max(100).optional(),
          measurements: measurementsSchema.optional(),
          purchasedMonth: purchasedMonthSchema.nullable().optional(),
          // 送られた順や重複に関係なく、春夏秋冬の順で保存する
          seasons: z
            .array(seasonSchema)
            .max(4)
            .transform((values) =>
              seasonSchema.options.filter((season) => values.includes(season)),
            )
            .optional(),
        })
        .strict()
        .refine(
          (value) =>
            value.name !== undefined ||
            value.measurements !== undefined ||
            value.purchasedMonth !== undefined ||
            value.seasons !== undefined,
        ),
      (result, c) => {
        if (!result.success)
          return c.json(
            { error: "名前・寸法・購入時期・季節を確認してください" },
            400,
          );
      },
    ),
    async (c) =>
      c.json(await updateGarment(c.req.valid("param").id, c.req.valid("json"))),
  )
  .put(
    "/:id/back",
    zValidator("param", idSchema, (result, c) => {
      if (!result.success)
        return c.json({ error: "服のIDを確認してください" }, 400);
    }),
    zValidator(
      "form",
      z.object({
        image: z.instanceof(File),
        cutoutImage: z.instanceof(File).optional(),
      }),
      (result, c) => {
        if (!result.success)
          return c.json({ error: "裏面の画像を確認してください" }, 400);
      },
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const form = c.req.valid("form");
      const saved = await replaceGarmentBack(id, form.image, form.cutoutImage);
      // 写真の保存と生成依頼の成否を分け、依頼だけ失敗しても写真を再登録させない。
      let texture: TextureRequestResult;
      try {
        texture = await requestGarmentTexture(id);
      } catch (error) {
        console.error("テクスチャの作成を依頼できませんでした", error);
        texture = {
          status: "failed",
          message:
            error instanceof HttpError
              ? error.message
              : "テクスチャの生成を依頼できませんでした",
        };
      }
      return c.json({ ...saved, texture });
    },
  )
  .post(
    "/:id/texture",
    zValidator("param", idSchema, (result, c) => {
      if (!result.success)
        return c.json({ error: "服のIDを確認してください" }, 400);
    }),
    async (c) =>
      c.json(await requestGarmentTexture(c.req.valid("param").id), 202),
  )
  .get(
    "/:id/texture",
    zValidator("param", idSchema, (result, c) => {
      if (!result.success)
        return c.json({ error: "服のIDを確認してください" }, 400);
    }),
    async (c) => c.json(await getGarmentTexture(c.req.valid("param").id)),
  )
  .delete(
    "/:id",
    zValidator("param", idSchema, (result, c) => {
      if (!result.success)
        return c.json({ error: "服のIDを確認してください" }, 400);
    }),
    async (c) => {
      await deleteGarment(c.req.valid("param").id);
      return c.body(null, 204);
    },
  );
