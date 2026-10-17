import type { GarmentView } from "@pitari/api";

type Role = GarmentView["images"][number]["role"];

// 先にあるroleほど表示に向く。裏面は詳細画面だけで表と並べる
const rolesBySide: Record<"front" | "back", Role[]> = {
  front: ["cutout", "measurement", "original"],
  back: ["back_cutout", "back"],
};

export function garmentPhotoUrl(
  garment: GarmentView,
  side: "front" | "back" = "front",
) {
  const image = rolesBySide[side]
    .map((role) => garment.images.find((item) => item.role === role))
    .find((item) => item !== undefined);
  return image
    ? `/api/garments/${encodeURIComponent(garment.id)}/images/${encodeURIComponent(image.id)}`
    : undefined;
}
