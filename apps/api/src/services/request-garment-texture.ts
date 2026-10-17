import { z } from "zod";
import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { bucket } from "#src/lib/garment-records";
import { requestInference } from "#src/lib/inference-client";
import { categorySchema } from "#src/lib/measurement-schema";
import { textureAcceptedSchema } from "#src/lib/garment-texture";
import { HttpError } from "#src/lib/http-error";

const sourceSchema = z.object({
  category: categorySchema,
  created_at: z.iso.datetime({ offset: true }),
  garment_images: z.array(
    z.object({ role: z.string(), storage_key: z.string() }),
  ),
});

export async function requestGarmentTexture(id: string) {
  if (!env.INFERENCE_TOKEN)
    throw new HttpError(
      503,
      "テクスチャを作るには推論サービスの設定と起動が必要です",
    );
  const { data, error } = await supabase
    .from("garments")
    .select("category, created_at, garment_images(role, storage_key)")
    .eq("id", id)
    .eq("profile_id", env.DEMO_PROFILE_ID)
    .maybeSingle();
  if (error)
    throw new HttpError(503, "テクスチャ用の写真を確認できませんでした");
  if (!data) throw new HttpError(404, "服が見つかりません");
  const source = sourceSchema.safeParse(data);
  if (!source.success)
    throw new HttpError(503, "テクスチャ用の登録内容を確認できませんでした");
  const front = source.data.garment_images.find(
    (image) => image.role === "measurement",
  );
  const back = source.data.garment_images.find(
    (image) => image.role === "back",
  );
  if (!front || !back)
    throw new HttpError(
      400,
      "表と裏の写真を登録してからテクスチャを作ってください",
    );

  const form = new FormData();
  form.set("garmentId", id);
  form.set("category", source.data.category);
  form.set("garmentCreatedAt", source.data.created_at);
  for (const [field, image] of [
    ["front", front],
    ["back", back],
  ] as const) {
    const file = await supabase.storage
      .from(bucket)
      .download(image.storage_key);
    if (file.error)
      throw new HttpError(503, "テクスチャ用の写真を読み込めませんでした");
    form.set(
      field,
      new File([file.data], `${field}.jpg`, { type: "image/jpeg" }),
    );
  }
  const result = await requestInference("/textures", form);
  if (!z.object({ accepted: z.literal(true) }).safeParse(result).success)
    throw new HttpError(503, "テクスチャの生成依頼を確認できませんでした");
  return textureAcceptedSchema.parse({ status: "accepted" });
}
