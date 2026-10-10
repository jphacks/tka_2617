import { measurementsSchema } from "#src/lib/measurement-schema";
import type {
  Category,
  MeasurementInput,
  MeasurementKey,
} from "#src/lib/measurement-schema";

export type MeasurementDefinition = {
  key: MeasurementKey;
  label: string;
  start: number;
  end: number | [number, number];
  multiplier: number;
};
export const measurementDefinitions: Record<Category, MeasurementDefinition[]> =
  {
    short_sleeve_top: [
      {
        key: "shoulderWidthCm",
        label: "肩幅",
        start: 7,
        end: 25,
        multiplier: 1,
      },
      { key: "sleeveLengthCm", label: "袖丈", start: 7, end: 9, multiplier: 1 },
      { key: "bodyWidthCm", label: "身幅", start: 12, end: 20, multiplier: 1 },
      { key: "bodyLengthCm", label: "着丈", start: 1, end: 16, multiplier: 1 },
    ],
    trousers: [
      {
        key: "waistCm",
        label: "ウエスト（周囲の推定値）",
        start: 1,
        end: 3,
        multiplier: 2,
      },
      {
        key: "hipCm",
        label: "ヒップ（周囲の推定値）",
        start: 4,
        end: 14,
        multiplier: 2,
      },
      {
        key: "thighWidthCm",
        label: "わたり幅",
        start: 9,
        end: 14,
        multiplier: 1,
      },
      { key: "riseCm", label: "股上", start: 2, end: 9, multiplier: 1 },
      {
        key: "inseamCm",
        label: "股下（両裾間の中点方式）",
        start: 9,
        end: [7, 11],
        multiplier: 1,
      },
      { key: "hemWidthCm", label: "裾幅", start: 11, end: 12, multiplier: 1 },
    ],
  };

export function calculateMeasurements(input: MeasurementInput) {
  const result = measurementsSchema.parse({});
  if (input.pixelsPerCm === null) return result;
  const points = new Map(input.points.map((point) => [point.id, point]));
  for (const definition of measurementDefinitions[input.category]) {
    const start = points.get(definition.start);
    let end;
    if (typeof definition.end === "number") end = points.get(definition.end);
    else {
      const first = points.get(definition.end[0]);
      const second = points.get(definition.end[1]);
      if (first && second)
        end = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    }
    if (!start || !end) continue;
    const distance =
      (Math.hypot(start.x - end.x, start.y - end.y) / input.pixelsPerCm) *
      definition.multiplier;
    const rounded = Math.round(distance * 10) / 10;
    if (rounded > 0 && rounded <= 1000) result[definition.key] = rounded;
  }
  return result;
}
