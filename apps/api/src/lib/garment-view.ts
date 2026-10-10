import { supabase } from "#src/lib/supabase";
import { bucket } from "#src/lib/garment-records";
import type { GarmentRecord, GarmentView } from "#src/lib/garment-records";
import { HttpError } from "#src/lib/http-error";

export async function garmentView(row: GarmentRecord): Promise<GarmentView> {
  const images = await Promise.all(
    row.garment_images.map(async (image) => {
      const result = await supabase.storage
        .from(bucket)
        .createSignedUrl(image.storage_key, 600);
      if (result.error) throw new HttpError(503, "画像を取得できませんでした");
      return {
        id: image.id,
        role: image.role,
        url: result.data.signedUrl,
        widthPx: image.width_px,
        heightPx: image.height_px,
        points: image.points,
        pixelsPerCm: image.pixels_per_cm,
        paperCorners: image.paper_corners,
        modelVersion: image.model_version,
      };
    }),
  );
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    measurements: row.measurements,
    measurementVersion: row.measurement_version,
    createdAt: row.created_at,
    images,
  };
}
