"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { GarmentView } from "@pitari/api";
import { AvatarPlaceholder } from "@/components/avatar-placeholder";
import { CameraIcon } from "@/components/icons";
import { TodayAvatar } from "@/components/today-avatar";
import { categoryLabels } from "@/lib/garment-category";
import { garmentPhotoUrl } from "@/lib/garment-photo";
import { avatarUrl } from "@/lib/outfit";
import { suggestOutfit } from "@/lib/outfit-suggestion";
import { requestJson } from "@/lib/request";
import { dayNumberOf, todayLabel, wardrobeNeeds } from "@/lib/today";
import type { DayPart, TodayWeather } from "@/lib/weather";
import { wornTop, wornTrousers } from "@/lib/worn-garment";

const dayParts: { part: DayPart; label: string }[] = [
  { part: "morning", label: "朝" },
  { part: "noon", label: "昼" },
  { part: "night", label: "夜" },
];

const noSubscription = () => () => undefined;

// 寸法が足りずアバターに着せられない服は、提案に使わない
function isWearable(garment: GarmentView) {
  return (
    "worn" in
    (garment.category === "trousers" ? wornTrousers(garment) : wornTop(garment))
  );
}

export function TodayContents() {
  // 天気と服は別々に読み、片方が失敗しても、もう片方は出す
  const [weather, setWeather] = useState<TodayWeather | "failed" | null>(null);
  const [garments, setGarments] = useState<GarmentView[] | "failed" | null>(
    null,
  );
  // このページはbuildのときに静的に作られるので、日付はブラウザでだけ出す
  const date = useSyncExternalStore(
    noSubscription,
    () => todayLabel(new Date()),
    () => "",
  );
  const dayNumber = useSyncExternalStore(
    noSubscription,
    () => dayNumberOf(new Date()),
    () => null,
  );

  useEffect(() => {
    const controller = new AbortController();
    // 位置はまだ送らず、仮に東京駅の天気を出す。場所の名前は画面に出さない（ADR 0040）
    requestJson<TodayWeather>("/api/weather", { signal: controller.signal })
      .then(setWeather)
      .catch(() => {
        if (!controller.signal.aborted) setWeather("failed");
      });
    requestJson<{ garments: GarmentView[] }>("/api/garments", {
      signal: controller.signal,
    })
      .then((data) => {
        setGarments(data.garments);
      })
      .catch(() => {
        if (!controller.signal.aborted) setGarments("failed");
      });
    return () => {
      controller.abort();
    };
  }, []);

  const temperatures =
    weather && weather !== "failed" ? weather.temperatures : null;
  const needs = Array.isArray(garments)
    ? wardrobeNeeds(garments.map((garment) => garment.category))
    : null;
  const remaining = needs?.filter((need) => !need.registered).length;
  // 天気を読み終わってから選ぶ。気温が後から届くと、別の服に着せ替わってしまう
  const suggestion =
    Array.isArray(garments) &&
    remaining === 0 &&
    weather !== null &&
    dayNumber !== null
      ? suggestOutfit(garments.filter(isWearable), {
          season: weather === "failed" ? null : weather.season,
          temperatures,
          dayNumber,
        })
      : null;
  const outfit = suggestion && !("missing" in suggestion) ? suggestion : null;

  return (
    <main className="px-6 pb-6 motion-safe:animate-fade-in">
      <div className="pt-3.5 pb-2.5 text-[13px] text-description">
        <span>{date}</span>
      </div>
      <dl className="grid grid-cols-3 border-y border-t-main border-b-line text-[15px] tabular-nums">
        {dayParts.map(({ part, label }) => (
          <div key={part} className="flex gap-1 py-2.5">
            <dt>{label}</dt>
            <dd>
              {temperatures?.[part] != null
                ? `${String(temperatures[part])}°C`
                : "—"}
            </dd>
          </div>
        ))}
      </dl>
      {(weather === "failed" || (weather && !weather.temperatures)) && (
        <p className="mt-1.5 text-[11px] text-sub">
          気温を取得できませんでした。
        </p>
      )}

      <div className="mt-4">
        {outfit ? (
          // 別の服を提案したら、試着の状態をその服の寸法で作り直す
          <TodayAvatar
            key={`${outfit.top.id} ${outfit.bottom.id}`}
            top={outfit.top}
            bottom={outfit.bottom}
          />
        ) : (
          <div className="flex h-57.5 items-end justify-center rounded-xl bg-surface pt-4 pb-1.5">
            <AvatarPlaceholder />
          </div>
        )}
      </div>

      {garments === "failed" && (
        <p role="alert" className="mt-5 text-sm text-description">
          クローゼットを読み込めませんでした。APIとDBの起動を確認してください。
        </p>
      )}
      {(garments === null || (remaining === 0 && suggestion === null)) && (
        <p role="status" className="mt-5 text-sm text-muted">
          読み込み中…
        </p>
      )}
      {needs && remaining !== 0 && (
        <>
          <h2 className="mt-5 text-[19px] leading-normal font-bold">
            あと{remaining}着で、コーデの提案が始まります
          </h2>
          <p className="mt-2 text-sm leading-[1.8] text-description">
            トップスとボトムスが1着ずつそろうと、気温に合わせた組み合わせを毎朝提案します。
          </p>
          <ul className="mt-3">
            {needs.map((need) => (
              <li
                key={need.label}
                className="flex min-h-13 items-center justify-between gap-3 border-b border-line"
              >
                <span className="flex items-center gap-3 text-[15px]">
                  <span
                    aria-hidden="true"
                    className={`flex size-5.5 items-center justify-center border border-main text-[13px] ${need.registered ? "bg-main text-white" : "bg-white"}`}
                  >
                    {need.registered && "✓"}
                  </span>
                  {need.label}
                </span>
                <span
                  className={`text-[13px] ${need.registered ? "text-main" : "text-description"}`}
                >
                  {need.registered ? "登録済み" : "未登録"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {suggestion && "missing" in suggestion && (
        <>
          <h2 className="mt-5 text-[19px] leading-normal font-bold">
            今日に合う服が足りません
          </h2>
          <p className="mt-2 text-sm leading-[1.8] text-description">
            {suggestion.missing}
          </p>
        </>
      )}
      {outfit && (
        <>
          <h2 className="mt-5 text-[19px] leading-normal font-bold">
            今日はこの組み合わせ
          </h2>
          <p className="mt-2 text-sm leading-[1.8] text-description">
            {outfit.reason}
            {outfit.note && <br />}
            {outfit.note}
          </p>
          <ul className="mt-3">
            {[outfit.top, outfit.bottom].map((garment) => {
              const photo = garmentPhotoUrl(garment);
              return (
                <li key={garment.id} className="border-b border-line">
                  <Link
                    href={`/garments/${encodeURIComponent(garment.id)}`}
                    className="flex min-h-13 items-center gap-3 py-1.5 transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main"
                  >
                    <svg
                      viewBox="0 0 300 360"
                      className="w-10 shrink-0 rounded bg-surface"
                      aria-hidden="true"
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
                    <span className="text-[15px] wrap-anywhere">
                      {garment.name || categoryLabels[garment.category]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href={avatarUrl({ top: outfit.top.id, bottom: outfit.bottom.id })}
            className="mt-4 flex h-12 w-full items-center justify-center rounded border border-main text-[15px] font-semibold transition hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main"
          >
            マイで着せ替える
          </Link>
        </>
      )}
      <Link
        href="/capture"
        className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded bg-main text-base font-bold text-white transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main active:scale-[0.98]"
      >
        <CameraIcon className="size-4.5" strokeWidth={1.8} />
        服を登録する
      </Link>
      {/* Open-Meteoのデータは出典の表示が要る（ADR 0040） */}
      <p className="mt-6 text-center text-[11px] text-sub">
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Weather data by Open-Meteo.com
        </a>
      </p>
    </main>
  );
}
