import { z } from "zod";

/** 登録・変更で受け取る素材の混率。素材が一覧にあるかは、DBの外部キーで確かめる */
export const garmentMaterialsSchema = z
  .array(
    z.object({
      materialId: z.string().regex(/^[a-z_]{1,40}$/),
      percent: z.number().int().min(1).max(100),
    }),
  )
  .min(1)
  .max(10)
  .refine(
    (values) =>
      new Set(values.map((value) => value.materialId)).size === values.length,
  )
  .refine(
    (values) => values.reduce((sum, value) => sum + value.percent, 0) === 100,
  );
export type GarmentMaterialInput = z.infer<typeof garmentMaterialsSchema>;

/** 素材を入れずに登録した服は綿100%にする */
export const defaultMaterials: GarmentMaterialInput = [
  { materialId: "cotton", percent: 100 },
];

export const materialRecordSchema = z.object({
  id: z.string(),
  label: z.string(),
  sort_order: z.number(),
});
export type Material = { id: string; label: string };
/** GET /v1/materialsの応答 */
export type MaterialList = { materials: Material[] };
export type GarmentMaterial = {
  materialId: string;
  label: string;
  percent: number;
};
