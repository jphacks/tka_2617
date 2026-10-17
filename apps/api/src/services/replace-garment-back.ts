import { z } from "zod";
import { supabase } from "#src/lib/supabase";
import { env } from "#src/lib/env";
import { readJpeg } from "#src/lib/jpeg";
import { readPng } from "#src/lib/png";
import { HttpError } from "#src/lib/http-error";
import { bucket } from "#src/lib/garment-records";

const removedSchema = z.array(z.object({ removed_key: z.string() }));

export async function replaceGarmentBack(
  id: string,
  image: File,
  cutoutImage?: File,
) {
  const back = await readJpeg(image);
  const cutout = cutoutImage ? await readPng(cutoutImage) : null;
  // 存在しない服のために画像を上げないよう、先に確かめる
  const { data, error } = await supabase
    .from("garments")
    .select("id")
    .eq("id", id)
    .eq("profile_id", env.DEMO_PROFILE_ID)
    .maybeSingle();
  if (error) throw new HttpError(503, "裏面を保存できませんでした");
  if (!data) throw new HttpError(404, "服が見つかりません");
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
  let removedKeys: string[];
  try {
    const images = [];
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
      images.push({
        role: file.role,
        storage_key: key,
        width_px: file.data.widthPx,
        height_px: file.data.heightPx,
      });
    }
    // 古い裏面の行の削除と新しい行の追加は、DBの関数で1つのトランザクションにする。
    // 途中で失敗しても、新しい裏面と古い切り抜きが組になって残らない。
    const replaced = await supabase.rpc("replace_garment_back", {
      target_garment_id: id,
      target_profile_id: env.DEMO_PROFILE_ID,
      new_images: images,
    });
    if (replaced.error) {
      if (replaced.error.code === "P0002")
        throw new HttpError(404, "服が見つかりません");
      throw replaced.error;
    }
    removedKeys = removedSchema
      .parse(replaced.data)
      .map((row) => row.removed_key);
  } catch (failure) {
    if (uploaded.length) {
      const cleanup = await supabase.storage.from(bucket).remove(uploaded);
      if (cleanup.error)
        console.error("裏面の保存失敗後の画像削除に失敗", cleanup.error);
    }
    if (failure instanceof HttpError) throw failure;
    console.error("裏面の保存に失敗", failure);
    throw new HttpError(503, "裏面を保存できませんでした");
  }
  // 行はもう新しい画像を指しているので、古いファイルの片付けに失敗しても成功として返す
  if (removedKeys.length) {
    const removed = await supabase.storage.from(bucket).remove(removedKeys);
    if (removed.error) console.error("古い裏面の画像削除に失敗", removed.error);
  }
  return { id };
}
