import { z } from "zod";
import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { bucket, imageRecordSchema } from "#src/lib/garment-records";
import { requestInference } from "#src/lib/inference-client";
import { categorySchema } from "#src/lib/measurement-schema";
import { textureAcceptedSchema } from "#src/lib/garment-texture";
import { HttpError } from "#src/lib/http-error";

const sourceSchema = z.object({
  category: categorySchema,
  created_at: z.iso.datetime({ offset: true }),
  garment_images: z.array(
    imageRecordSchema.pick({
      id: true,
      role: true,
      storage_key: true,
      width_px: true,
      height_px: true,
      points: true,
      paper_corners: true,
    }),
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
    .select(
      "category, created_at, garment_images(id, role, storage_key, width_px, height_px, points, paper_corners)",
    )
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
  // 状態を聞くときに、裏面を撮り直す前の写真から作った作業を見分けるため
  form.set("backImageId", back.id);
  // 採寸画面で確かめた点とA4の四隅を、推論し直して上書きさせないため
  if (front.points.length > 0 || front.paper_corners.length > 0)
    form.set(
      "frontSaved",
      JSON.stringify({
        widthPx: front.width_px,
        heightPx: front.height_px,
        points: front.points,
        paperCorners: front.paper_corners,
      }),
    );
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
