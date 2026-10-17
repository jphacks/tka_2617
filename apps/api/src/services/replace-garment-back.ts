import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { readJpeg } from "#src/lib/jpeg";
import { readPng } from "#src/lib/png";
import { HttpError } from "#src/lib/http-error";
import { bucket } from "#src/lib/garment-records";

const backRoles = ["back", "back_cutout"];

export async function replaceGarmentBack(
  id: string,
  image: File,
  cutoutImage?: File,
) {
  const back = await readJpeg(image);
  const cutout = cutoutImage ? await readPng(cutoutImage) : null;
  const { data, error } = await supabase
    .from("garments")
    .select("id, garment_images(role, storage_key)")
    .eq("id", id)
    .eq("profile_id", env.DEMO_PROFILE_ID)
    .maybeSingle()
    .overrideTypes<
      { garment_images: { role: string; storage_key: string }[] } | null,
      { merge: false }
    >();
  if (error) throw new HttpError(503, "裏面を保存できませんでした");
  if (!data) throw new HttpError(404, "服が見つかりません");
  const previous = data.garment_images.filter((item) =>
    backRoles.includes(item.role),
  );
  // 差し替えのたびに別のキーにして、古い画像を表示中の画面と取り違えないようにする
  const version = crypto.randomUUID();
  const files = [
    { role: "back", data: back, type: "image/jpeg", extension: "jpg" },
    ...(cutout
      ? [
          {
            role: "back_cutout",
            data: cutout,
            type: "image/png",
            extension: "png",
          },
        ]
      : []),
  ];
  const uploaded: string[] = [];
  try {
    const records = [];
    for (const file of files) {
      const key = `${env.DEMO_PROFILE_ID}/${id}/${file.role}-${version}.${file.extension}`;
      const upload = await supabase.storage
        .from(bucket)
        .upload(key, file.data.bytes, {
          contentType: file.type,
          upsert: false,
        });
      if (upload.error) throw upload.error;
      uploaded.push(key);
      records.push({
        id: crypto.randomUUID(),
        garment_id: id,
        storage_key: key,
        role: file.role,
        width_px: file.data.widthPx,
        height_px: file.data.heightPx,
        points: [],
        pixels_per_cm: null,
        paper_corners: [],
        model_version: null,
      });
    }
    const saved = await supabase
      .from("garment_images")
      .upsert(records, { onConflict: "garment_id,role" });
    if (saved.error) throw saved.error;
  } catch (failure) {
    if (uploaded.length) {
      const cleanup = await supabase.storage.from(bucket).remove(uploaded);
      if (cleanup.error)
        console.error("裏面の保存失敗後の画像削除に失敗", cleanup.error);
    }
    console.error("裏面の保存に失敗", failure);
    throw new HttpError(503, "裏面を保存できませんでした");
  }
  // 新しい画像は保存済みなので、古いものの片付けに失敗しても成功として返す
  let stale = previous.map((item) => item.storage_key);
  const previousCutout = previous.find((item) => item.role === "back_cutout");
  if (!cutout && previousCutout) {
    const removed = await supabase
      .from("garment_images")
      .delete()
      .eq("garment_id", id)
      .eq("role", "back_cutout");
    if (removed.error) {
      console.error("古い裏面の切り抜きの行削除に失敗", removed.error);
      stale = stale.filter((key) => key !== previousCutout.storage_key);
    }
  }
  if (stale.length) {
    const removed = await supabase.storage.from(bucket).remove(stale);
    if (removed.error) console.error("古い裏面の画像削除に失敗", removed.error);
  }
  return { id };
}
