import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { bucket } from "#src/lib/garment-records";
import { HttpError } from "#src/lib/http-error";

export async function getGarmentImage(garmentId: string, imageId: string) {
  const { data, error } = await supabase
    .from("garment_images")
    .select("storage_key, garments!inner(profile_id)")
    .eq("id", imageId)
    .eq("garment_id", garmentId)
    .eq("garments.profile_id", env.DEMO_PROFILE_ID)
    .maybeSingle()
    .overrideTypes<{ storage_key: string } | null, { merge: false }>();
  if (error) throw new HttpError(503, "画像を取得できませんでした");
  if (!data) throw new HttpError(404, "画像が見つかりません");
  const image = await supabase.storage.from(bucket).download(data.storage_key);
  if (image.error || !["image/jpeg", "image/png"].includes(image.data.type))
    throw new HttpError(503, "画像を取得できませんでした");
  return image.data;
}
