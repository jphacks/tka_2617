"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { GarmentView } from "@pitari/api";
import { AvatarPlaceholder } from "@/components/avatar-placeholder";
import { CameraIcon } from "@/components/icons";
import { requestJson } from "@/lib/request";
import { todayLabel, wardrobeNeeds } from "@/lib/today";
import type { DayPart, TodayWeather } from "@/lib/weather";

const dayParts: { part: DayPart; label: string }[] = [
  { part: "morning", label: "朝" },
  { part: "noon", label: "昼" },
  { part: "night", label: "夜" },
];

const noSubscription = () => () => undefined;

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
      <p className="mt-1.5 text-[11px] text-sub">
        {(weather === "failed" || (weather && !weather.temperatures)) &&
          "気温を取得できませんでした。"}
        {/* Open-Meteoのデータは出典の表示が要る（ADR 0040） */}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Weather data by Open-Meteo.com
        </a>
      </p>

      <div className="mt-4 flex h-57.5 items-end justify-center rounded-xl bg-surface pt-4 pb-1.5">
        <AvatarPlaceholder />
      </div>

      {garments === "failed" && (
        <p role="alert" className="mt-5 text-sm text-description">
          クローゼットを読み込めませんでした。APIとDBの起動を確認してください。
        </p>
      )}
      {garments === null && (
        <p role="status" className="mt-5 text-sm text-muted">
          読み込み中…
        </p>
      )}
      {needs && (
        <>
          <h2 className="mt-5 text-[19px] leading-normal font-bold">
            あと{remaining}着で、コーデの提案が始まります
          </h2>
          <p className="mt-2 text-sm leading-[1.8] text-description">
            トップス・ボトムス・靴が1着ずつそろうと、気温に合わせた組み合わせを毎朝提案します。
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
      <Link
        href="/capture"
        className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded bg-main text-base font-bold text-white transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main active:scale-[0.98]"
      >
        <CameraIcon className="size-4.5" strokeWidth={1.8} />
        服を登録する
      </Link>
    </main>
  );
}
