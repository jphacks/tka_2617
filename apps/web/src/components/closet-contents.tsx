"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GarmentView } from "@pitari/api";
import { CameraIcon, HangerIcon } from "@/components/icons";
import { requestJson } from "@/lib/request";
import { garmentPhotoUrl } from "@/lib/garment-photo";

export function ClosetContents() {
  const [garments, setGarments] = useState<GarmentView[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    requestJson<{ garments: GarmentView[] }>("/api/garments")
      .then((data) => {
        if (active) setGarments(data.garments);
      })
      .catch(() => {
        if (active)
          setError(
            "クローゼットを読み込めませんでした。APIとDBの起動を確認してください。",
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <main className="motion-safe:animate-fade-in">
      <div className="flex items-baseline justify-between px-4 pt-3 text-xs">
        <span className="text-sub">すべて</span>
        <span className="font-semibold">
          {garments === null ? "—" : `${String(garments.length)}件`}
        </span>
      </div>
      {error ? (
        <div role="alert" className="px-4 py-6 text-sm">
          <p>{error}</p>
          <button
            className="mt-3 min-h-11 rounded border border-main px-4"
            onClick={() => {
              setError("");
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
              <article key={garment.id} className="min-w-0">
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
                  {garment.category === "trousers" ? "パンツ" : "Tシャツ"}
                </p>
              </article>
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
