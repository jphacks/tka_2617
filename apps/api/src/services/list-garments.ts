import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { garmentRecordSchema } from "#src/lib/garment-records";
import { garmentView } from "#src/lib/garment-view";
import { HttpError } from "#src/lib/http-error";
import type { Category } from "#src/lib/measurement-schema";

export async function listGarments(category?: Category) {
  let query = supabase
    .from("garments")
    .select("*, garment_images(*)")
    .eq("profile_id", env.DEMO_PROFILE_ID)
    .order("created_at", { ascending: false })
    .limit(100);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error)
    throw new HttpError(
      503,
      "服の一覧を取得できません。DBの準備を確認してください",
    );
  const rows = garmentRecordSchema.array().parse(data);
  return { garments: await Promise.all(rows.map(garmentView)) };
}
