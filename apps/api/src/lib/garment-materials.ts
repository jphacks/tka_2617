import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { HttpError } from "#src/lib/http-error";
import type { GarmentMaterialInput } from "#src/lib/materials";

/** 服の素材をまとめて差し替える。合計100%と、素材が一覧にあるかはDBでも確かめる */
export async function setGarmentMaterials(
  id: string,
  materials: GarmentMaterialInput,
) {
  const { error } = await supabase.rpc("set_garment_materials", {
    target_garment_id: id,
    target_profile_id: env.DEMO_PROFILE_ID,
    new_materials: materials.map((value) => ({
      material_id: value.materialId,
      percent: value.percent,
    })),
  });
  if (!error) return;
  if (error.code === "P0002") throw new HttpError(404, "服が見つかりません");
  // 23503は一覧に無い素材、23514は合計が100%でない
  if (error.code === "23503" || error.code === "23514")
    throw new HttpError(400, "素材を確認してください");
  throw new HttpError(503, "素材を保存できませんでした");
}
