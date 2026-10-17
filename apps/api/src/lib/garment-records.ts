import { z } from "zod";
import {
  categorySchema,
  coordinateSchema,
  measurementsSchema,
  pointSchema,
} from "#src/lib/measurement-schema";
import { materialRecordSchema, type GarmentMaterial } from "#src/lib/materials";

/** 服の行と一緒に読む列。素材は一覧の名前と順も読む */
export const garmentColumns =
  "*, garment_images(*), garment_materials(percent, materials(id, label, sort_order))";

export const bucket = "garments";
export const imageRoleSchema = z.enum([
  "original",
  "measurement",
  "cutout",
  "back",
  "back_cutout",
  "texture",
]);
export const seasonSchema = z.enum(["spring", "summer", "autumn", "winter"]);
export const purchasedMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const imageRecordSchema = z.object({
  id: z.uuid(),
  storage_key: z.string(),
  role: imageRoleSchema,
  width_px: z.number(),
  height_px: z.number(),
  points: z.array(pointSchema),
  pixels_per_cm: z.number().nullable(),
  paper_corners: z.array(coordinateSchema),
  model_version: z.string().nullable(),
});
export const garmentRecordSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: categorySchema,
  measurements: measurementsSchema,
  measurement_version: z.string(),
  purchased_month: purchasedMonthSchema.nullable(),
  seasons: z.array(seasonSchema),
  created_at: z.string(),
  garment_images: z.array(imageRecordSchema),
  // 削除のように素材を読まないところでは、空になる
  garment_materials: z
    .array(z.object({ percent: z.number(), materials: materialRecordSchema }))
    .default([]),
});
export type GarmentRecord = z.infer<typeof garmentRecordSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type GarmentView = {
  id: string;
  name: string;
  category: GarmentRecord["category"];
  measurements: GarmentRecord["measurements"];
  measurementVersion: string;
  purchasedMonth: string | null;
  seasons: Season[];
  /** 割合の多い順。同じ割合なら素材の一覧の順 */
  materials: GarmentMaterial[];
  createdAt: string;
  images: {
    id: string;
    role: z.infer<typeof imageRoleSchema>;
    url: string;
    widthPx: number;
    heightPx: number;
    points: z.infer<typeof pointSchema>[];
    pixelsPerCm: number | null;
    paperCorners: [number, number][];
    modelVersion: string | null;
  }[];
};
