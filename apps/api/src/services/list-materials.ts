import { supabase } from "#src/lib/supabase";
import { HttpError } from "#src/lib/http-error";
import { materialRecordSchema, type Material } from "#src/lib/materials";

export async function listMaterials(): Promise<{ materials: Material[] }> {
  const { data, error } = await supabase
    .from("materials")
    .select("id, label, sort_order")
    .order("sort_order");
  if (error) throw new HttpError(503, "素材の一覧を取得できませんでした");
  return {
    materials: materialRecordSchema
      .array()
      .parse(data)
      .map(({ id, label }) => ({ id, label })),
  };
}
