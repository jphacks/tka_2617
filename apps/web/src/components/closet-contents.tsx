"use client";

import { categoryLabels } from "@/lib/garment-category";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { GarmentView } from "@pitari/api";
import { CameraIcon, HangerIcon } from "@/components/icons";
import { requestJson } from "@/lib/request";
import { garmentPhotoUrl } from "@/lib/garment-photo";
import { GarmentMeasurements } from "@/components/garment-measurements";
import {
  closetFilterLabel,
  closetFilters,
  garmentsPath,
  type ClosetFilter,
} from "@/lib/closet-filter";

// どの種類の何回目の読み込みの結果かを持ち、選び直す前の応答を出さない
type Loaded = { filter: ClosetFilter; attempt: number } & (
  { garments: GarmentView[] } | { error: string }
);

export function ClosetContents() {
  const [filter, setFilter] = useState<ClosetFilter>("all");
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    requestJson<{ garments: GarmentView[] }>(garmentsPath(filter), {
      signal: controller.signal,
    })
      .then((data) => {
        if (active) setLoaded({ filter, attempt, garments: data.garments });
      })
      .catch(() => {
        if (active)
          setLoaded({
            filter,
            attempt,
            error:
              "クローゼットを読み込めませんでした。APIとDBの起動を確認してください。",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [filter, attempt]);

  const current =
    loaded?.filter === filter && loaded.attempt === attempt ? loaded : null;
  const garments = current && "garments" in current ? current.garments : null;
  const error = current && "error" in current ? current.error : "";

  return (
    <main
      className="motion-safe:animate-fade-in"
      aria-busy={garments === null && !error}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        {/* 本物のラジオボタンを見えないように置き、矢印キーでの移動と選択はブラウザに任せる */}
        <div
          role="radiogroup"
          aria-label="服の種類で絞り込む"
          className="flex flex-wrap gap-1.5"
        >
          {closetFilters.map((option) => (
            <label key={option} className="cursor-pointer">
              <input
                type="radio"
                name="closet-filter"
                value={option}
                checked={filter === option}
                onChange={() => {
                  setFilter(option);
                }}
                className="peer sr-only"
              />
              <span className="flex min-h-11 items-center rounded-full border border-line px-3.5 py-1.5 text-[13px] transition peer-checked:border-main peer-checked:bg-main peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-main">
                {closetFilterLabel(option)}
              </span>
            </label>
          ))}
        </div>
        <span className="shrink-0 pt-1.5 text-xs font-semibold">
          {garments === null ? "—" : `${String(garments.length)}件`}
        </span>
      </div>
      {error ? (
        <div role="alert" className="px-4 py-6 text-sm">
          <p>{error}</p>
          <button
            className="mt-3 min-h-11 rounded border border-main px-4"
            onClick={() => {
              setAttempt((previous) => previous + 1);
            }}
          >
            再読み込み
          </button>
        </div>
      ) : garments === null ? (
        <p role="status" className="px-4 py-6 text-sm text-description">
          読み込み中…
        </p>
      ) : garments.length === 0 && filter !== "all" ? (
        <section className="flex flex-col items-center gap-3 px-6 pt-10 pb-9 text-center">
          <h2 className="text-[15px] font-semibold text-pretty">
            {closetFilterLabel(filter)}はまだ登録されていません
          </h2>
          <button
            type="button"
            className="min-h-11 rounded border border-main px-4 text-sm"
            onClick={() => {
              setFilter("all");
            }}
          >
            すべての服を見る
          </button>
        </section>
      ) : garments.length === 0 ? (
        <section className="flex flex-col items-center gap-3.5 px-6 pt-10 pb-9 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-surface">
            <HangerIcon className="size-7" strokeWidth={1.6} />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-semibold text-pretty">
              まだ服が登録されていません
            </h2>
            <p className="text-[13px] leading-[1.7] text-pretty text-description">
              服を撮影して、クローゼットに追加しましょう。
            </p>
          </div>
        </section>
      ) : (
        <section
          aria-label="登録した服"
          className="grid grid-cols-2 gap-4 px-4 py-5"
        >
          {garments.map((garment) => {
            const photo = garmentPhotoUrl(garment);
            return (
              <Link
                key={garment.id}
                href={`/garments/${encodeURIComponent(garment.id)}`}
                className="block min-w-0 rounded transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main"
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
                <h2 className="mt-2 text-sm font-semibold wrap-anywhere">
                  {garment.name || "名前なし"}
                </h2>
                <p className="mt-1 text-xs text-description">
                  {categoryLabels[garment.category]}
                </p>
                <GarmentMeasurements
                  category={garment.category}
                  measurements={garment.measurements}
                />
              </Link>
            );
          })}
        </section>
      )}
      <div className="flex flex-col items-center gap-3 px-6 pb-9">
        <Link
          href="/capture"
          className="flex h-12 w-full max-w-70 items-center justify-center gap-2 rounded bg-main text-sm font-semibold text-white transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main active:scale-[0.98]"
        >
          <CameraIcon className="size-4.5" strokeWidth={1.8} />
          服を登録する
        </Link>
        {garments && garments.length > 0 && (
          <Link
            href="/capture#saved-garments"
            className="flex min-h-11 items-center text-xs text-description underline"
          >
            登録した服の寸法を編集する
          </Link>
        )}
      </div>
    </main>
  );
}
