import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { HttpError } from "#src/lib/http-error";
import type { Measurements } from "#src/lib/measurement-schema";

export async function updateGarment(
  id: string,
  values: { name?: string; measurements?: Measurements },
) {
  const { data, error } = await supabase
    .from("garments")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", env.DEMO_PROFILE_ID)
    .select("id")
    .maybeSingle();
  if (error) throw new HttpError(503, "服を更新できませんでした");
  if (!data) throw new HttpError(404, "服が見つかりません");
  return { id };
}
