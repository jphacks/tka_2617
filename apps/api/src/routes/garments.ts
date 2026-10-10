import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  categorySchema,
  metadataSchema,
  measurementsSchema,
} from "#src/lib/measurement-schema";
import { HttpError } from "#src/lib/http-error";
import { createGarment } from "#src/services/create-garment";
import { listGarments } from "#src/services/list-garments";
import { getGarment } from "#src/services/get-garment";
import { getGarmentImage } from "#src/services/get-garment-image";
import { updateGarment } from "#src/services/update-garment";
import { deleteGarment } from "#src/services/delete-garment";

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
        })
        .strict()
        .refine(
          (value) =>
            value.name !== undefined || value.measurements !== undefined,
        ),
      (result, c) => {
        if (!result.success)
          return c.json({ error: "名前と寸法を確認してください" }, 400);
      },
    ),
    async (c) =>
      c.json(await updateGarment(c.req.valid("param").id, c.req.valid("json"))),
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
