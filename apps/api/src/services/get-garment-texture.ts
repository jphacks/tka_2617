import { z } from "zod";
import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { bucket } from "#src/lib/garment-records";
import { getFromInference } from "#src/lib/inference-client";
import { pngSize } from "#src/lib/png";
import { HttpError } from "#src/lib/http-error";
import type { TextureStatus } from "#src/lib/garment-texture";

const imagesSchema = z.object({
  garment_images: z.array(
    z.object({
      id: z.uuid(),
      role: z.string(),
      texture_job: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
});
// 推論サービスのGET /textures/{garmentId}の応答（#71）。backImageIdを返さない推論サービスもある
const jobSchema = z.object({
  status: z.enum(["queued", "running", "done", "failed"]),
  job: z.string().min(1).nullable(),
  error: z.string().nullable(),
  backImageId: z.string().nullable().optional(),
});
const savedSchema = z
  .array(
    z.object({
      image_id: z.uuid().nullable(),
      removed_key: z.string().nullable(),
    }),
  )
  .length(1);
// Storageのバケットの上限と同じ
const maxTextureBytes = 16 * 1024 * 1024;

export async function getGarmentTexture(id: string): Promise<TextureStatus> {
  const { data, error } = await supabase
    .from("garments")
    .select("garment_images(id, role, texture_job, created_at)")
    .eq("id", id)
    .eq("profile_id", env.DEMO_PROFILE_ID)
    .maybeSingle();
  if (error) throw new HttpError(503, "テクスチャを確認できませんでした");
  if (!data) throw new HttpError(404, "服が見つかりません");
  const images = imagesSchema.parse(data).garment_images;
  const back = images.find((image) => image.role === "back");
  if (!back) return { status: "none" };
  const saved = images.find((image) => image.role === "texture");
  // 裏面を撮り直す前に保存したテクスチャは、古い写真から作ったものなので使わない。
  // どちらの日時もDBが付けるので、推論サービスのPCと時計がずれていても比べられる
  const current =
    saved && Date.parse(saved.created_at) > Date.parse(back.created_at)
      ? saved
      : undefined;

  const response = await getFromInference(`/textures/${id}`);
  if (response?.status === 404)
    return current
      ? { status: "done", imageId: current.id }
      : { status: "none" };
  const job = response?.ok
    ? jobSchema.safeParse(await response.json().catch(() => null))
    : null;
  if (!job?.success) {
    // 推論サービスが止まっていても、保存済みのテクスチャは見せられる
    if (current) return { status: "done", imageId: current.id };
    throw new HttpError(
      503,
      "推論サービスにつながらないため、テクスチャを確認できません",
    );
  }
  // 撮り直す前の裏面から作る作業は、今の写真のものではないので無い扱いにする
  if (job.data.backImageId && job.data.backImageId !== back.id)
    return current
      ? { status: "done", imageId: current.id }
      : { status: "none" };
  const previous = current ? { imageId: current.id } : {};
  if (job.data.status === "queued" || job.data.status === "running")
    return { status: "processing", ...previous };
  if (job.data.status === "failed") {
    // 推論サービスの理由にはPC内のパスなどが入りうるので、画面には出さずログに残す
    console.error("テクスチャの作成に失敗しました", job.data.error);
    return {
      status: "failed",
      message:
        "テクスチャを作れませんでした。裏面を撮り直すか、もう一度作ってください",
      ...previous,
    };
  }
  if (!job.data.job)
    throw new HttpError(503, "テクスチャの作業を確認できませんでした");
  if (saved?.texture_job === job.data.job)
    return current
      ? { status: "done", imageId: current.id }
      : { status: "none" };
  const imageId = await saveTexture(id, job.data.job, back.id);
  // 保存するまでの間に裏面が撮り直されていたら、新しい写真の作業を待つ
  return imageId ? { status: "done", imageId } : { status: "processing" };
}

// 保存したテクスチャの画像IDを返す。裏面がbackImageIdから変わっていたら、保存せずにnull
async function saveTexture(
  garmentId: string,
  job: string,
  backImageId: string,
) {
  const response = await getFromInference(
    `/textures/${garmentId}/${encodeURIComponent(job)}/texture.png`,
  );
  const bytes = response?.ok
    ? await response
        .arrayBuffer()
        .then((buffer) => Buffer.from(buffer))
        .catch(() => null)
    : null;
  const size = bytes && bytes.length <= maxTextureBytes ? pngSize(bytes) : null;
  if (!bytes || !size)
    throw new HttpError(
      503,
      "推論サービスからテクスチャを受け取れませんでした",
    );
  // 差し替えのたびに別のキーにして、古いテクスチャを表示中の画面と取り違えないようにする
  const key = `${env.DEMO_PROFILE_ID}/${garmentId}/texture-${crypto.randomUUID()}.png`;
  const upload = await supabase.storage
    .from(bucket)
    .upload(key, bytes, { contentType: "image/png", upsert: false });
  if (upload.error)
    throw new HttpError(503, "テクスチャを保存できませんでした");
  // 古い行の削除と新しい行の追加は、DBの関数で1つのトランザクションにする。
  // 裏面が今もbackImageIdかも、同じロックの中で確かめ直す
  const result = await supabase.rpc("save_garment_texture", {
    target_garment_id: garmentId,
    target_profile_id: env.DEMO_PROFILE_ID,
    expected_back_image_id: backImageId,
    new_image: {
      storage_key: key,
      width_px: size.widthPx,
      height_px: size.heightPx,
      texture_job: job,
    },
  });
  const saved = result.error ? null : savedSchema.safeParse(result.data);
  if (!saved?.success) {
    const cleanup = await supabase.storage.from(bucket).remove([key]);
    if (cleanup.error)
      console.error("保存できなかったテクスチャを消せませんでした", key);
    if (result.error?.code === "P0002")
      throw new HttpError(404, "服が見つかりません");
    throw new HttpError(503, "テクスチャを保存できませんでした");
  }
  const [{ image_id: imageId, removed_key: removedKey }] = saved.data;
  if (removedKey) {
    // 行はもう決まっているので、使わなくなった画像を消せなくても成功として返す
    const removed = await supabase.storage.from(bucket).remove([removedKey]);
    if (removed.error)
      console.error("使わなくなったテクスチャを消せませんでした", removedKey);
  }
  return imageId;
}
