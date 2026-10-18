import type { Category, ColorFamily, GarmentView } from "@pitari/api";
import { outfitSlot } from "@/lib/outfit";
import { pngFile } from "@/lib/photo";

/** 画面の選択肢もこの順に並べる */
export const colorFamilyLabels: Record<ColorFamily, string> = {
  white: "白",
  black: "黒",
  gray: "グレー",
  navy: "紺",
  beige: "ベージュ",
  brown: "茶",
  red: "赤",
  pink: "ピンク",
  orange: "オレンジ",
  yellow: "黄",
  green: "緑",
  blue: "青",
  purple: "紫",
};

// 1つの画素の色を、色の系統に分ける。r・g・bは0〜255。しきい値はADR 0042
export function colorFamilyOf(r: number, g: number, b: number): ColorFamily {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const value = max / 255;
  const chroma = (max - min) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (value < 0.15) return "black";
  // 色みの弱い画素は、明るさだけで分ける。電球の光で黄みがかった白も、白にする
  if (saturation < 0.2 || chroma < 0.08)
    return value >= 0.75 ? "white" : value < 0.3 ? "black" : "gray";
  const sector =
    max === r
      ? (g - b) / (max - min)
      : max === g
        ? (b - r) / (max - min) + 2
        : (r - g) / (max - min) + 4;
  const hue = (sector * 60 + 360) % 360;
  if (hue < 15 || hue >= 345)
    return saturation < 0.5 && value >= 0.7 ? "pink" : "red";
  if (hue < 45)
    return value < 0.55 ? "brown" : saturation < 0.5 ? "beige" : "orange";
  // 暗い黄色はカーキやオリーブなので、緑に入れる
  if (hue < 70)
    return value < 0.55 ? "green" : saturation < 0.4 ? "beige" : "yellow";
  if (hue < 170) return "green";
  if (hue < 250) return value < 0.5 ? "navy" : "blue";
  if (hue < 290) return "purple";
  return value >= 0.6 ? "pink" : "purple";
}

// 透けていない画素ごとに系統を決め、いちばん多い系統にする。
// 平均の色にしないのは、柄やしわの影で色がにごるため。透けていない画素が無ければnull
export function dominantColorFamily(
  rgba: Uint8ClampedArray,
): ColorFamily | null {
  const counts = new Map<ColorFamily, number>();
  for (let index = 0; index + 3 < rgba.length; index += 4) {
    if (rgba[index + 3] < 128) continue;
    const family = colorFamilyOf(rgba[index], rgba[index + 1], rgba[index + 2]);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  let best: ColorFamily | null = null;
  let bestCount = 0;
  for (const [family, count] of counts)
    if (count > bestCount) {
      best = family;
      bestCount = count;
    }
  return best;
}

// 切り抜きのPNGを64pxまで縮めてから数える。色を決めるには十分で、画素が少ないほど速い
export async function cutoutColorFamily(
  cutoutBase64: string,
): Promise<ColorFamily | null> {
  const bitmap = await createImageBitmap(pngFile(cutoutBase64));
  const scale = Math.min(1, 64 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return dominantColorFamily(
    context.getImageData(0, 0, canvas.width, canvas.height).data,
  );
}

export type AddedGarment = {
  id: string;
  category: Category;
  colorFamily: ColorFamily | null;
};

// 足した服と、上下（トップス・ボトムス）と色の系統が同じ服。
// 色が分からない服は、どの色とも同じにしない。足した服の色が分からなければ、上下だけで比べる
export function similarGarments(
  garments: GarmentView[],
  added: AddedGarment,
): GarmentView[] {
  return garments.filter(
    (garment) =>
      garment.id !== added.id &&
      outfitSlot(garment.category) === outfitSlot(added.category) &&
      (added.colorFamily === null || garment.colorFamily === added.colorFamily),
  );
}

// 「紺のトップス」の形。色が分からなければ「トップス」
export function similarLabel(added: AddedGarment): string {
  const slot = outfitSlot(added.category) === "top" ? "トップス" : "ボトムス";
  return added.colorFamily
    ? `${colorFamilyLabels[added.colorFamily]}の${slot}`
    : slot;
}
