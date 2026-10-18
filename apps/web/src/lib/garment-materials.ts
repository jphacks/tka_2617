import type { GarmentMaterial } from "@pitari/api";

/** 素材の入力欄の1行。割合は入力途中の文字のまま持つ */
export type MaterialRow = { materialId: string; percent: string };

/** 素材を入れなかった服は綿100%にする（apiと同じ） */
export const defaultMaterialRows: MaterialRow[] = [
  { materialId: "cotton", percent: "100" },
];

export function materialRows(
  materials: Pick<GarmentMaterial, "materialId" | "percent">[],
): MaterialRow[] {
  return materials.length > 0
    ? materials.map((value) => ({
        materialId: value.materialId,
        percent: String(value.percent),
      }))
    : defaultMaterialRows;
}

/** 入力欄の割合の合計。数でない欄は0として数える */
export function totalPercent(rows: MaterialRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
}

/** 入力欄を、APIに送る混率にする。送れないときは、画面に出す理由を返す */
export function materialsFromRows(
  rows: MaterialRow[],
):
  { materials: { materialId: string; percent: number }[] } | { error: string } {
  if (rows.length === 0) return { error: "素材を1つ以上入れてください" };
  if (new Set(rows.map((row) => row.materialId)).size !== rows.length)
    return { error: "同じ素材が2つあります" };
  const percents = rows.map((row) => Number(row.percent));
  if (
    rows.some((row) => row.percent.trim() === "") ||
    percents.some(
      (value) => !Number.isInteger(value) || value < 1 || value > 100,
    )
  )
    return { error: "割合は1〜100の整数で入れてください" };
  const total = totalPercent(rows);
  if (total !== 100)
    return { error: `割合の合計を100%にしてください（今は${String(total)}%）` };
  return {
    materials: rows.map((row, i) => ({
      materialId: row.materialId,
      percent: percents[i],
    })),
  };
}

/** 「綿98% ポリウレタン2%」のように、割合の多い順で並べる（APIが並べた順のまま） */
export function materialsSummary(
  materials: Pick<GarmentMaterial, "label" | "percent">[],
): string {
  return materials
    .map((value) => `${value.label}${String(value.percent)}%`)
    .join(" ");
}
