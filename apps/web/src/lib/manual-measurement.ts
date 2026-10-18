import type { Category, DetectionResult, Measurements } from "@pitari/api";

export const emptyMeasurements: Measurements = {
  shoulderWidthCm: null,
  sleeveLengthCm: null,
  bodyWidthCm: null,
  bodyLengthCm: null,
  waistCm: null,
  hipCm: null,
  thighWidthCm: null,
  riseCm: null,
  inseamCm: null,
  hemWidthCm: null,
};

/**
 * 推論を使わずに登録するときの結果。写真と服の種類だけを持ち、点・A4・縮尺・切り抜きは持たない。
 * 寸法は推定せず、空のまま始めて手で入れる
 */
export function manualResult(
  photo: { imageBase64: string; widthPx: number; heightPx: number },
  category: Category,
  measurementVersion: DetectionResult["measurementVersion"],
  imageId: string = crypto.randomUUID(),
): DetectionResult {
  return {
    imageId,
    imageBase64: photo.imageBase64,
    cutoutBase64: null,
    cutoutWidthPx: null,
    cutoutHeightPx: null,
    widthPx: photo.widthPx,
    heightPx: photo.heightPx,
    category,
    bbox: null,
    points: [],
    paperCorners: [],
    pixelsPerCm: null,
    modelVersion: null,
    warnings: [],
    elapsedMs: 0,
    measurements: { ...emptyMeasurements },
    measurementVersion,
  };
}
