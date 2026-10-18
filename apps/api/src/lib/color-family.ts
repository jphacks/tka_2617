import { z } from "zod";

/** 服の色の系統。切り抜きの色からブラウザで決めて、登録と一緒に送る（ADR 0044） */
export const colorFamilySchema = z.enum([
  "white",
  "black",
  "gray",
  "navy",
  "beige",
  "brown",
  "red",
  "pink",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
]);
export type ColorFamily = z.infer<typeof colorFamilySchema>;
