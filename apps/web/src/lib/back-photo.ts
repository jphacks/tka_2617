import type { Category, DetectionOptions, DetectionResult } from "@pitari/api";
import { preparePhoto, pngFile } from "@/lib/photo";
import { requestJson } from "@/lib/request";

export type BackPhoto = {
  image: File;
  cutoutImage: File | null;
  previewUrl: string;
  previewWidthPx: number;
  previewHeightPx: number;
};

type ShowProgress = (
  percent: number,
  nextPercent: number,
  label: string,
  estimatedMs: number,
) => void;

async function detect(image: File, options: DetectionOptions) {
  const form = new FormData();
  form.set("image", image);
  form.set("options", JSON.stringify(options));
  return requestJson<DetectionResult>("/api/detections", {
    method: "POST",
    body: form,
  });
}

// 裏面は表示に使い、寸法は測らない
export async function prepareBackPhoto(
  file: File,
  category: Category,
  showProgress: ShowProgress,
): Promise<BackPhoto> {
  const photo = await preparePhoto(file);
  showProgress(0, 30, "裏面を確認しています", 5000);
  const paper = await detect(photo.file, {
    stage: "paper",
    category,
    paperCorners: [],
  });
  const paperCorners =
    paper.paperCorners.length === 4 ? paper.paperCorners : [];
  showProgress(30, 70, "服を見つけています", 20000);
  const garment = await detect(photo.file, {
    stage: "garment",
    category,
    paperCorners,
  });
  let cutout: DetectionResult | null = null;
  if (garment.bbox) {
    showProgress(70, 100, "切り抜いています", 5000);
    cutout = await detect(photo.file, {
      stage: "cutout",
      category,
      paperCorners,
      bbox: garment.bbox,
    });
  }
  if (
    cutout?.cutoutBase64 &&
    cutout.cutoutWidthPx !== null &&
    cutout.cutoutHeightPx !== null
  )
    return {
      image: photo.file,
      cutoutImage: pngFile(cutout.cutoutBase64),
      previewUrl: `data:image/png;base64,${cutout.cutoutBase64}`,
      previewWidthPx: cutout.cutoutWidthPx,
      previewHeightPx: cutout.cutoutHeightPx,
    };
  return {
    image: photo.file,
    cutoutImage: null,
    previewUrl: `data:image/jpeg;base64,${photo.imageBase64}`,
    previewWidthPx: photo.widthPx,
    previewHeightPx: photo.heightPx,
  };
}

export async function uploadBackPhoto(garmentId: string, back: BackPhoto) {
  const form = new FormData();
  form.set("image", back.image);
  if (back.cutoutImage) form.set("cutoutImage", back.cutoutImage);
  return requestJson<{ id: string }>(
    `/api/garments/${encodeURIComponent(garmentId)}/back`,
    {
      method: "PUT",
      body: form,
    },
  );
}
