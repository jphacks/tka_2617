import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import {
  garmentRecordSchema,
  type GarmentRecord,
} from "#src/lib/garment-records";
import { garmentView } from "#src/lib/garment-view";
import { HttpError } from "#src/lib/http-error";

export async function getGarment(id: string) {
  const { data, error } = await supabase
    .from("garments")
    .select("*, garment_images(*)")
    .eq("id", id)
    .eq("profile_id", env.DEMO_PROFILE_ID)
    .maybeSingle()
    .overrideTypes<GarmentRecord | null, { merge: false }>();
  if (error) throw new HttpError(503, "服を取得できませんでした");
  if (!data) throw new HttpError(404, "服が見つかりません");
  return garmentView(garmentRecordSchema.parse(data));
}
