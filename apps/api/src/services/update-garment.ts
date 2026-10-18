import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { HttpError } from "#src/lib/http-error";
import type { Measurements } from "#src/lib/measurement-schema";
import type { Season } from "#src/lib/garment-records";
import type { GarmentMaterialInput } from "#src/lib/materials";
import type { ColorFamily } from "#src/lib/color-family";
import { setGarmentMaterials } from "#src/lib/garment-materials";

export async function updateGarment(
  id: string,
  values: {
    name?: string;
    measurements?: Measurements;
    purchasedMonth?: string | null;
    seasons?: Season[];
    materials?: GarmentMaterialInput;
    colorFamily?: ColorFamily | null;
  },
) {
  // 素材を先に保存する。一覧に無い素材や合計の誤りで止まったとき、名前などだけが変わらないように
  if (values.materials) await setGarmentMaterials(id, values.materials);
  const { data, error } = await supabase
    .from("garments")
    .update({
      name: values.name,
      measurements: values.measurements,
      purchased_month: values.purchasedMonth,
      seasons: values.seasons,
      color_family: values.colorFamily,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("profile_id", env.DEMO_PROFILE_ID)
    .select("id")
    .maybeSingle();
  if (error) throw new HttpError(503, "服を更新できませんでした");
  if (!data) throw new HttpError(404, "服が見つかりません");
  return { id };
}
