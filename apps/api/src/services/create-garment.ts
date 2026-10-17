import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { readJpeg } from "#src/lib/jpeg";
import { readPng } from "#src/lib/png";
import { HttpError } from "#src/lib/http-error";
import { bucket } from "#src/lib/garment-records";
import type { GarmentMetadata } from "#src/lib/measurement-schema";

export async function createGarment(
  image: File,
  originalImage: File | undefined,
  metadata: GarmentMetadata,
  cutoutImage?: File,
) {
  const measurement = await readJpeg(image);
  if (
    measurement.widthPx !== metadata.widthPx ||
    measurement.heightPx !== metadata.heightPx
  )
    throw new HttpError(400, "画像と測定点のサイズが一致しません");
  const original = originalImage ? await readJpeg(originalImage) : null;
  const cutout = cutoutImage ? await readPng(cutoutImage) : null;
  if (metadata.pixelsPerCm !== null && metadata.paperCorners.length !== 4)
    throw new HttpError(400, "A4の四隅が必要です");
  const cornerImage = measurement;
  if (
    metadata.paperCorners.some(
      ([x, y]) =>
        x < 0 || y < 0 || x >= cornerImage.widthPx || y >= cornerImage.heightPx,
    )
  )
    throw new HttpError(400, "A4の四隅を原画像内に指定してください");
  const id = crypto.randomUUID();
  const uploaded: string[] = [];
  let inserted = false;
  try {
    const files = [
      { role: "measurement", data: measurement },
      ...(original ? [{ role: "original", data: original }] : []),
      ...(cutout ? [{ role: "cutout", data: cutout }] : []),
    ];
    const records = [];
    for (const file of files) {
      const key = `${env.DEMO_PROFILE_ID}/${id}/${file.role}.${file.role === "cutout" ? "png" : "jpg"}`;
      const upload = await supabase.storage
        .from(bucket)
        .upload(key, file.data.bytes, {
          contentType: file.role === "cutout" ? "image/png" : "image/jpeg",
          upsert: false,
        });
      if (upload.error) throw upload.error;
      uploaded.push(key);
      records.push({
        id:
          file.role === "measurement" ? metadata.imageId : crypto.randomUUID(),
        garment_id: id,
        storage_key: key,
        role: file.role,
        width_px: file.data.widthPx,
        height_px: file.data.heightPx,
        points: file.role === "measurement" ? metadata.points : [],
        pixels_per_cm:
          file.role === "measurement" ? metadata.pixelsPerCm : null,
        paper_corners: file.role === "measurement" ? metadata.paperCorners : [],
        model_version:
          file.role === "measurement" ? metadata.modelVersion : null,
      });
    }
    const garment = await supabase.from("garments").insert({
      id,
      profile_id: env.DEMO_PROFILE_ID,
      name: metadata.name,
      category: metadata.category,
      measurements: metadata.measurements,
      measurement_version: metadata.measurementVersion,
    });
    if (garment.error) throw garment.error;
    inserted = true;
    const images = await supabase.from("garment_images").insert(records);
    if (images.error) throw images.error;
    return { id };
  } catch (error) {
    if (inserted) {
      const cleanup = await supabase
        .from("garments")
        .delete()
        .eq("id", id)
        .eq("profile_id", env.DEMO_PROFILE_ID);
      if (cleanup.error)
        console.error("登録失敗後の行削除に失敗", cleanup.error);
    }
    if (uploaded.length) {
      const cleanup = await supabase.storage.from(bucket).remove(uploaded);
      if (cleanup.error)
        console.error("登録失敗後の画像削除に失敗", cleanup.error);
    }
    console.error("服の登録に失敗", error);
    throw new HttpError(
      503,
      "保存できませんでした。DBとStorageの準備を確認してください",
    );
  }
}
