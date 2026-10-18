"use client";

import Link from "next/link";
import { useState, type Ref } from "react";
import type { ColorFamily, GarmentView } from "@pitari/api";
import {
  colorFamilyLabels,
  similarGarments,
  similarLabel,
  type AddedGarment,
} from "@/lib/color-family";
import { garmentPhotoUrl } from "@/lib/garment-photo";
import { requestJson } from "@/lib/request";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main";
const shownCount = 4;

// 服を足した直後に、同じ系統の服が何着あるかを下から出す。<dialog>のshowModalで開く
export function SimilarGarmentsSheet({
  ref,
  added,
  garments,
  onColorChange,
}: {
  ref: Ref<HTMLDialogElement>;
  added: AddedGarment | null;
  garments: GarmentView[];
  onColorChange: (colorFamily: ColorFamily | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const similar = added ? similarGarments(garments, added) : [];

  async function changeColor(colorFamily: ColorFamily | null) {
    if (!added) return;
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/garments/${encodeURIComponent(added.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorFamily }),
      });
      onColorChange(colorFamily);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "色を保存できませんでした",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="similar-garments-title"
      onClick={(event) => {
        // 背景（dialog自身）を押したときだけ閉じ、中身のタップでは閉じない
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onClose={() => {
        setError("");
      }}
      className="mx-auto mt-auto mb-0 w-full max-w-120 rounded-t-2xl bg-white p-0 text-main backdrop:bg-black/40"
    >
      {added && (
        <div className="flex flex-col gap-4 px-6 pt-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
          <div className="flex flex-col gap-1">
            <h2
              id="similar-garments-title"
              className="text-base font-bold text-pretty"
            >
              {similar.length > 0
                ? `同じ系統の服が、もう${String(similar.length)}着あります`
                : "同じ系統の服は、まだありません"}
            </h2>
            <p className="text-[13px] text-description text-pretty">
              {added.colorFamily
                ? `「${similarLabel(added)}」で比べました。`
                : `色が分からなかったため、「${similarLabel(added)}」のすべてと比べました。`}
            </p>
          </div>
          {similar.length > 0 && (
            <ul aria-label="同じ系統の服" className="grid grid-cols-4 gap-2">
              {similar.slice(0, shownCount).map((garment) => {
                const photo = garmentPhotoUrl(garment);
                return (
                  <li key={garment.id}>
                    <Link
                      href={`/garments/${encodeURIComponent(garment.id)}`}
                      onClick={(event) =>
                        event.currentTarget.closest("dialog")?.close()
                      }
                      className={`block rounded transition active:opacity-70 ${focusRing}`}
                    >
                      <svg
                        viewBox="0 0 300 360"
                        className="w-full rounded bg-surface"
                        role="img"
                        aria-label={garment.name || "登録した服"}
                      >
                        {photo && (
                          <image
                            href={photo}
                            width="300"
                            height="360"
                            preserveAspectRatio="xMidYMid meet"
                          />
                        )}
                      </svg>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {similar.length > shownCount && (
            <p className="-mt-2 text-xs text-description">
              ほかに{similar.length - shownCount}着
            </p>
          )}
          <label className="flex items-center justify-between gap-3">
            <span className="flex flex-col gap-0.5 text-sm">
              色
              <span className="text-xs text-description">
                写真から自動で決めました
              </span>
            </span>
            <select
              value={added.colorFamily ?? ""}
              disabled={saving}
              onChange={(event) => {
                const value = event.target.value;
                void changeColor(value === "" ? null : (value as ColorFamily));
              }}
              className={`min-h-11 shrink-0 rounded-md bg-surface px-3 text-sm disabled:opacity-40 ${focusRing}`}
            >
              <option value="">分からない</option>
              {Object.entries(colorFamilyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-800">
              {error}
            </p>
          )}
          <form method="dialog" className="self-center">
            <button
              type="submit"
              className={`min-h-11 px-2 text-sm text-description ${focusRing}`}
            >
              閉じる
            </button>
          </form>
        </div>
      )}
    </dialog>
  );
}
