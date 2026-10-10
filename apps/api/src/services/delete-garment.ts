import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import {
  bucket,
  garmentRecordSchema,
  type GarmentRecord,
} from "#src/lib/garment-records";
import { HttpError } from "#src/lib/http-error";

export async function deleteGarment(id: string) {
  const { data, error } = await supabase
    .from("garments")
    .select("*, garment_images(*)")
    .eq("id", id)
    .eq("profile_id", env.DEMO_PROFILE_ID)
    .maybeSingle()
    .overrideTypes<GarmentRecord | null, { merge: false }>();
  if (error) throw new HttpError(503, "服を削除できませんでした");
  if (!data) throw new HttpError(404, "服が見つかりません");
  const row = garmentRecordSchema.parse(data);
  // 行を最後に消すことで、画像削除に失敗してもキーを残して再試行できる。
  if (row.garment_images.length) {
    const removed = await supabase.storage
      .from(bucket)
      .remove(row.garment_images.map((image) => image.storage_key));
    if (removed.error)
      throw new HttpError(
        503,
        "画像を削除できませんでした。再試行してください",
      );
  }
  const removed = await supabase
    .from("garments")
    .delete()
    .eq("id", id)
    .eq("profile_id", env.DEMO_PROFILE_ID);
  if (removed.error)
    throw new HttpError(
      503,
      "登録情報を削除できませんでした。再試行してください",
    );
}
