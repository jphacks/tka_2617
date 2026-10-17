import type { Category, MeasurementKey, Measurements } from "@pitari/api";

const fields: Record<Category, { key: MeasurementKey; label: string }[]> = {
  short_sleeve_top: [
    { key: "bodyLengthCm", label: "着丈" },
    { key: "bodyWidthCm", label: "身幅" },
    { key: "shoulderWidthCm", label: "肩幅" },
    { key: "sleeveLengthCm", label: "袖丈" },
  ],
  long_sleeve_top: [
    { key: "bodyLengthCm", label: "着丈" },
    { key: "bodyWidthCm", label: "身幅" },
    { key: "shoulderWidthCm", label: "肩幅" },
    { key: "sleeveLengthCm", label: "袖丈" },
  ],
  trousers: [
    { key: "waistCm", label: "ウエスト" },
    { key: "hipCm", label: "ヒップ" },
    { key: "thighWidthCm", label: "わたり幅" },
    { key: "riseCm", label: "股上" },
    { key: "inseamCm", label: "股下" },
    { key: "hemWidthCm", label: "裾幅" },
  ],
};

export function GarmentMeasurements({
  category,
  measurements,
}: {
  category: Category;
  measurements: Measurements;
}) {
  return (
    <dl aria-label="保存した寸法" className="mt-3 space-y-1 text-xs">
      {fields[category].map(({ key, label }) => (
        <div
          key={key}
          className="flex flex-wrap justify-between gap-x-2 gap-y-1"
        >
          <dt className="text-description">{label}</dt>
          <dd className="tabular-nums">
            {measurements[key] == null
              ? "未測定"
              : `${String(measurements[key])} cm`}
          </dd>
        </div>
      ))}
    </dl>
  );
}
