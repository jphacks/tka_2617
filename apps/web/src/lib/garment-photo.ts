import type { GarmentView } from "@pitari/api";

export function garmentPhotoUrl(garment: GarmentView) {
  const image =
    garment.images.find((item) => item.role === "cutout") ??
    garment.images.find((item) => item.role === "measurement") ??
    garment.images.at(0);
  return image
    ? `/api/garments/${encodeURIComponent(garment.id)}/images/${encodeURIComponent(image.id)}`
    : undefined;
}
