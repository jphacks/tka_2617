import type { GarmentView } from "@pitari/api";
import { z } from "zod";
import type { Top } from "@/components/try-on/use-try-on";
import { categoryLabels, categoryModels } from "@/lib/garment-category";
import { topMeasurements, type Measurements } from "@/lib/garment";
import { trouserMeasurements, type TrouserMeasurements } from "@/lib/trousers";

/** URLで指定された服のうち、アバターに着せられるもの */
export type WornTop = { name: string; model: Top; measurements: Measurements };
export type WornTrousers = { name: string; measurements: TrouserMeasurements };

export type WornResult<T> = { worn: T } | { problem: string };

/** APIの服を、上の服として着せる形にする。着せられないときは、画面に出す理由を返す */
export function wornTop(garment: GarmentView): WornResult<WornTop> {
  const name = garmentName(garment);
  // URLを手で書き換えると、上の欄にズボンのIDが入ることがある
  if (garment.category === "trousers")
    return { problem: `${name}は上の服ではありません` };
  const measurements = measure(() => topMeasurements(garment));
  return measurements
    ? {
        worn: { name, model: categoryModels[garment.category], measurements },
      }
    : { problem: missingMeasurements(name) };
}

/** APIの服を、ズボンとして着せる形にする。着せられないときは、画面に出す理由を返す */
export function wornTrousers(garment: GarmentView): WornResult<WornTrousers> {
  const name = garmentName(garment);
  if (garment.category !== "trousers")
    return { problem: `${name}は下の服ではありません` };
  const measurements = measure(() => trouserMeasurements(garment));
  return measurements
    ? { worn: { name, measurements } }
    : { problem: missingMeasurements(name) };
}

function garmentName(garment: GarmentView): string {
  return `「${garment.name || categoryLabels[garment.category]}」`;
}

// 採寸の点が取れなかった服は寸法がnullになり、zodの検証で止まる
function measure<T>(read: () => T): T | null {
  try {
    return read();
  } catch (error) {
    if (error instanceof z.ZodError) return null;
    throw error;
  }
}

function missingMeasurements(name: string): string {
  return `${name}は寸法が足りないため、着せられません`;
}

/** 寸法がそろっていて、アバターに着せられる服か */
export function isWearable(garment: GarmentView): boolean {
  return (
    "worn" in
    (garment.category === "trousers" ? wornTrousers(garment) : wornTop(garment))
  );
}
