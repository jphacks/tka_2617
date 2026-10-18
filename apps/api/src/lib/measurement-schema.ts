import { z } from "zod";
import { garmentMaterialsSchema } from "#src/lib/materials";
import { colorFamilySchema } from "#src/lib/color-family";

// シャツは着せる3Dモデルを分けるための種類で、推論では長そでとして検出・採寸する
export const categorySchema = z.enum([
  "short_sleeve_top",
  "long_sleeve_top",
  "shirt",
  "trousers",
]);
export const landmarkCounts = {
  short_sleeve_top: 25,
  long_sleeve_top: 33,
  shirt: 33,
  trousers: 14,
} as const;
export const coordinateSchema = z.tuple([
  z.number().nonnegative(),
  z.number().nonnegative(),
]);
export const bboxSchema = z
  .tuple([
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().positive(),
    z.number().positive(),
  ])
  .refine(([x1, y1, x2, y2]) => x2 > x1 && y2 > y1);
export const pointSchema = z
  .object({
    id: z.number().int().min(1).max(33),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    score: z.number().nullable(),
  })
  .strict();
const dimension = z.number().positive().max(1000).nullable().default(null);
export const measurementsSchema = z
  .object({
    shoulderWidthCm: dimension,
    sleeveLengthCm: dimension,
    bodyWidthCm: dimension,
    bodyLengthCm: dimension,
    waistCm: dimension,
    hipCm: dimension,
    thighWidthCm: dimension,
    riseCm: dimension,
    inseamCm: dimension,
    hemWidthCm: dimension,
  })
  .strict();
export const measurementVersion = "df2-a4-flat-midpoint-v2" as const;
export const measurementInputSchema = z
  .object({
    imageId: z.uuid(),
    category: categorySchema,
    widthPx: z.number().int().positive().max(4096),
    heightPx: z.number().int().positive().max(4096),
    points: z.array(pointSchema).max(33),
    pixelsPerCm: z.number().min(2).max(100).nullable(),
  })
  .superRefine((value, context) => {
    const ids = new Set<number>();
    for (const point of value.points) {
      if (
        ids.has(point.id) ||
        point.x >= value.widthPx ||
        point.y >= value.heightPx ||
        point.id > landmarkCounts[value.category]
      )
        context.addIssue({
          code: "custom",
          message: "測定点の番号と画像内の座標を確認してください",
        });
      ids.add(point.id);
    }
  });
export const metadataSchema = measurementInputSchema.safeExtend({
  name: z.string().trim().max(100).default(""),
  paperCorners: z.array(coordinateSchema).length(4).or(z.tuple([])),
  modelVersion: z.string().max(100).nullable(),
  measurements: measurementsSchema,
  measurementVersion: z.literal(measurementVersion),
  materials: garmentMaterialsSchema.optional(),
  colorFamily: colorFamilySchema.nullable().default(null),
});
export const detectionOptionsSchema = z
  .object({
    category: z.enum([...categorySchema.options, "auto"]),
    paperCorners: z
      .array(coordinateSchema)
      .length(4)
      .or(z.tuple([]))
      .default([]),
    bbox: bboxSchema.optional(),
    // 切り抜きの手がかりにだけ使う、前の工程のランドマーク
    points: z.array(pointSchema).max(33).default([]),
    stage: z
      .enum(["all", "paper", "garment", "landmarks", "cutout"])
      .default("all"),
  })
  .refine((value) => !value.bbox || value.category !== "auto");
export const inferenceResultSchema = z.object({
  imageId: z.uuid(),
  imageBase64: z.string().max(16 * 1024 * 1024),
  cutoutBase64: z
    .string()
    .max(12 * 1024 * 1024)
    .nullable(),
  cutoutWidthPx: z.number().int().positive().max(4096).nullable(),
  cutoutHeightPx: z.number().int().positive().max(4096).nullable(),
  widthPx: z.number().int().positive().max(4096),
  heightPx: z.number().int().positive().max(4096),
  category: categorySchema.nullable(),
  bbox: bboxSchema.nullable(),
  points: z.array(pointSchema).max(33),
  paperCorners: z.array(coordinateSchema).max(4),
  pixelsPerCm: z.number().min(2).max(100).nullable(),
  modelVersion: z.string().nullable(),
  warnings: z.array(z.string().max(200)),
  elapsedMs: z.number().nonnegative(),
});
export type Category = z.infer<typeof categorySchema>;
export type MeasurementInput = z.infer<typeof measurementInputSchema>;
export type GarmentMetadata = z.infer<typeof metadataSchema>;
export type Measurements = z.infer<typeof measurementsSchema>;
export type MeasurementKey = keyof Measurements;
export type LandmarkPoint = z.infer<typeof pointSchema>;
export type DetectionOptions = z.infer<typeof detectionOptionsSchema>;
export type DetectionResult = z.infer<typeof inferenceResultSchema> & {
  measurements: Measurements;
  measurementVersion: typeof measurementVersion;
};
