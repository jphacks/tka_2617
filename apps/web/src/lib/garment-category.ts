import type { Category } from "@pitari/api";
import type { Top } from "@/components/try-on/use-try-on";

export const categoryLabels: Record<Category, string> = {
  short_sleeve_top: "Tシャツ",
  long_sleeve_top: "長そで",
  shirt: "シャツ",
  trousers: "ズボン",
};

/** 撮影の画面で最初に選ぶ種類の並び */
export const categoryChoices: Category[] = [
  "shirt",
  "long_sleeve_top",
  "short_sleeve_top",
  "trousers",
];

/** 服の種類ごとに、アバターで着せる3Dモデル。上の服は`TOPS`のキーで、ズボンは`trousers_male.glb` */
export const categoryModels = {
  short_sleeve_top: "tshirt",
  long_sleeve_top: "longsleeve",
  shirt: "shirt",
  trousers: "trousers",
} as const satisfies Record<Category, Top | "trousers">;
