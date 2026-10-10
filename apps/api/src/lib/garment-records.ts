import { z } from "zod";
import {
  categorySchema,
  coordinateSchema,
  measurementsSchema,
  pointSchema,
} from "#src/lib/measurement-schema";

export const bucket = "garments";
export const imageRecordSchema = z.object({
  id: z.uuid(),
  storage_key: z.string(),
  role: z.enum(["original", "measurement", "cutout"]),
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
  created_at: z.string(),
  garment_images: z.array(imageRecordSchema),
});
export type GarmentRecord = z.infer<typeof garmentRecordSchema>;
export type GarmentView = {
  id: string;
  name: string;
  category: GarmentRecord["category"];
  measurements: GarmentRecord["measurements"];
  measurementVersion: string;
  createdAt: string;
  images: {
    id: string;
    role: "original" | "measurement" | "cutout";
    url: string;
    widthPx: number;
    heightPx: number;
    points: z.infer<typeof pointSchema>[];
    pixelsPerCm: number | null;
    paperCorners: [number, number][];
    modelVersion: string | null;
  }[];
};
