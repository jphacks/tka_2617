import type {
  BackPhotoResponse,
  Category,
  DetectionOptions,
  DetectionResult,
} from "@pitari/api";
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

// 裏面は表示とテクスチャに使い、寸法は測らない。ランドマークは切り抜きの手がかりに使う
export async function prepareBackPhoto(
  file: File,
  category: Category,
  showProgress: ShowProgress,
): Promise<BackPhoto> {
  return cutBackPhoto(await preparePhoto(file), category, showProgress);
}

type PreparedPhoto = Pick<
  Awaited<ReturnType<typeof preparePhoto>>,
  "file" | "imageBase64" | "widthPx" | "heightPx"
>;

/**
 * 整えた裏面の写真を、推論で切り抜く。推論の通信に失敗したときや、切り抜けなかったときは、
 * JPEGだけを返す。推論サービスが未設定・停止中でも、裏面を保存できるようにするため
 */
export async function cutBackPhoto(
  photo: PreparedPhoto,
  category: Category,
  showProgress: ShowProgress,
): Promise<BackPhoto> {
  const jpegOnly: BackPhoto = {
    image: photo.file,
    cutoutImage: null,
    previewUrl: `data:image/jpeg;base64,${photo.imageBase64}`,
    previewWidthPx: photo.widthPx,
    previewHeightPx: photo.heightPx,
  };
  try {
    return (await cutout(photo, category, showProgress)) ?? jpegOnly;
  } catch {
    return jpegOnly;
  }
}

async function cutout(
  photo: PreparedPhoto,
  category: Category,
  showProgress: ShowProgress,
): Promise<BackPhoto | null> {
  showProgress(0, 30, "裏面を確認しています", 5000);
  const paper = await detect(photo.file, {
    stage: "paper",
    category,
    paperCorners: [],
    points: [],
  });
  const paperCorners =
    paper.paperCorners.length === 4 ? paper.paperCorners : [];
  showProgress(30, 70, "服を見つけています", 25000);
  const garment = await detect(photo.file, {
    stage: "landmarks",
    category,
    paperCorners,
    points: [],
  });
  if (!garment.bbox) return null;
  showProgress(70, 100, "切り抜いています", 5000);
  const result: DetectionResult = await detect(photo.file, {
    stage: "cutout",
    category,
    paperCorners,
    bbox: garment.bbox,
    points: garment.points,
  });
  if (
    !result.cutoutBase64 ||
    result.cutoutWidthPx === null ||
    result.cutoutHeightPx === null
  )
    return null;
  return {
    image: photo.file,
    cutoutImage: pngFile(result.cutoutBase64),
    previewUrl: `data:image/png;base64,${result.cutoutBase64}`,
    previewWidthPx: result.cutoutWidthPx,
    previewHeightPx: result.cutoutHeightPx,
  };
}

export async function uploadBackPhoto(garmentId: string, back: BackPhoto) {
  const form = new FormData();
  form.set("image", back.image);
  if (back.cutoutImage) form.set("cutoutImage", back.cutoutImage);
  return requestJson<BackPhotoResponse>(
    `/api/garments/${encodeURIComponent(garmentId)}/back`,
    {
      method: "PUT",
      body: form,
    },
  );
}
