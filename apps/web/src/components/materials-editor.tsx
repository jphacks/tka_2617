"use client";

import type { Material, MaterialList } from "@pitari/api";
import { useEffect, useState } from "react";
import { totalPercent, type MaterialRow } from "@/lib/garment-materials";
import { requestJson } from "@/lib/request";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main";
const field = `h-10 rounded-md bg-surface px-3 text-sm text-main ${focusRing}`;
const MAX_ROWS = 10;

/** 素材の混率の入力欄（綿98%・ポリウレタン2%など）。行ごとに素材と割合を入れる */
export function MaterialsEditor({
  rows,
  onChange,
}: {
  rows: MaterialRow[];
  onChange: (rows: MaterialRow[]) => void;
}) {
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    requestJson<MaterialList>("/api/materials")
      .then((data) => {
        if (active) setMaterials(data.materials);
      })
      .catch(() => {
        if (active) setLoadError("素材の一覧を読み込めませんでした");
      });
    return () => {
      active = false;
    };
  }, []);

  const total = totalPercent(rows);
  const unused = (materials ?? []).filter(
    (material) => !rows.some((row) => row.materialId === material.id),
  );
  // 一覧が届くまでは、入っている素材だけを選択肢に出す
  const options = (selected: string) =>
    materials ?? [{ id: selected, label: selected }];
  const update = (index: number, change: Partial<MaterialRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  };

  return (
    <fieldset className="text-sm">
      <legend>素材</legend>
      {loadError && (
        <p role="alert" className="mt-1 text-xs text-red-800">
          {loadError}
        </p>
      )}
      <ul className="mt-1 space-y-2">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2">
            <select
              aria-label={`${String(index + 1)}つ目の素材`}
              value={row.materialId}
              onChange={(event) => {
                update(index, { materialId: event.target.value });
              }}
              className={`${field} min-w-0 flex-1`}
            >
              {options(row.materialId).map((material) => (
                <option key={material.id} value={material.id}>
                  {material.label}
                </option>
              ))}
            </select>
            <input
              aria-label={`${String(index + 1)}つ目の素材の割合（%）`}
              type="number"
              inputMode="numeric"
              min="1"
              max="100"
              step="1"
              value={row.percent}
              onChange={(event) => {
                update(index, { percent: event.target.value });
              }}
              className={`${field} w-20 text-right tabular-nums`}
            />
            <span className="text-xs text-muted">%</span>
            {rows.length > 1 && (
              <button
                type="button"
                aria-label={`${String(index + 1)}つ目の素材を消す`}
                onClick={() => {
                  onChange(rows.filter((_, i) => i !== index));
                }}
                className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sub hover:text-main ${focusRing}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={unused.length === 0 || rows.length >= MAX_ROWS}
          onClick={() => {
            // 残りの割合を入れておくと、2つ目の素材を足すだけで合計が100%になる
            const rest = 100 - total;
            onChange([
              ...rows,
              {
                materialId: unused[0].id,
                percent: rest > 0 ? String(rest) : "",
              },
            ]);
          }}
          className={`min-h-11 text-xs text-description underline disabled:opacity-40 ${focusRing}`}
        >
          素材を足す
        </button>
        <span
          aria-live="polite"
          className={`text-xs tabular-nums ${total === 100 ? "text-description" : "font-semibold text-red-800"}`}
        >
          合計 {total}%
        </span>
      </div>
    </fieldset>
  );
}
