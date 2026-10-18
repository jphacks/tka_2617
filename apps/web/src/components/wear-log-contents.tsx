"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { GarmentView } from "@pitari/api";
import { categoryLabels } from "@/lib/garment-category";
import { garmentPhotoUrl } from "@/lib/garment-photo";
import { outfitSlot, type Outfit, type OutfitSlot } from "@/lib/outfit";
import { requestJson } from "@/lib/request";
import {
  createWearLogStore,
  monthCells,
  todayKey,
  type WearLog,
} from "@/lib/wear-log";

const wearLogStore = createWearLogStore(() => window.localStorage);
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const SLOT_LABELS: Record<OutfitSlot, string> = {
  top: "トップス",
  bottom: "ボトムス",
};
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main";
const secondary = `min-h-11 rounded border border-main px-4 text-sm ${focusRing}`;

/** 記録の画面：月のカレンダーと、選んだ日に着た服 */
export function WearLogContents() {
  // サーバーで描くときはlocalStorageも今日の日付も無いので、読み込み中として描く
  const log = useSyncExternalStore(
    wearLogStore.subscribe,
    wearLogStore.get,
    () => undefined,
  );
  const [garments, setGarments] = useState<GarmentView[] | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    requestJson<{ garments: GarmentView[] }>("/api/garments")
      .then((data) => {
        if (active) setGarments(data.garments);
      })
      .catch(() => {
        if (active) setLoadError("服を読み込めませんでした");
      });
    return () => {
      active = false;
    };
  }, []);

  if (log === undefined)
    return (
      <p role="status" className="px-4 py-6 text-sm text-description">
        読み込み中…
      </p>
    );
  return (
    <WearLogCalendar
      log={log}
      today={todayKey()}
      garments={garments}
      loadError={loadError}
    />
  );
}

function WearLogCalendar({
  log,
  today,
  garments,
  loadError,
}: {
  log: WearLog;
  today: string;
  garments: GarmentView[] | null;
  loadError: string;
}) {
  const [month, setMonth] = useState(() => {
    const [year, m] = today.split("-").map(Number);
    return { year, month: m };
  });
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState(false);

  const byId = new Map(garments?.map((garment) => [garment.id, garment]));
  const cells = monthCells(month.year, month.month);
  const recordedDays = cells.filter((date) => date && log[date]).length;
  const entry = log[selected];
  const [selectedYear, selectedMonth, selectedDay] = selected
    .split("-")
    .map(Number);
  // new Date("YYYY-MM-DD")は世界標準時の0時になり、日本より西の端末では曜日がずれる
  const weekday =
    WEEKDAYS[new Date(selectedYear, selectedMonth - 1, selectedDay).getDay()];

  function moveMonth(step: number) {
    const date = new Date(month.year, month.month - 1 + step, 1);
    setMonth({ year: date.getFullYear(), month: date.getMonth() + 1 });
  }

  return (
    <main className="pt-3 pb-8 motion-safe:animate-fade-in">
      <div className="flex items-center justify-between gap-3 px-2">
        <button
          type="button"
          aria-label="前の月"
          onClick={() => {
            moveMonth(-1);
          }}
          className={`flex size-11 items-center justify-center rounded-full text-lg ${focusRing}`}
        >
          ‹
        </button>
        <h2 className="text-[17px] font-bold tabular-nums">
          {month.year}年{month.month}月
        </h2>
        <button
          type="button"
          aria-label="次の月"
          onClick={() => {
            moveMonth(1);
          }}
          className={`flex size-11 items-center justify-center rounded-full text-lg ${focusRing}`}
        >
          ›
        </button>
      </div>
      <p className="px-4 text-right text-[13px] text-description tabular-nums">
        {recordedDays}日 記録
      </p>

      <div
        aria-hidden="true"
        className="mt-2 grid grid-cols-7 border-b border-line pb-1.5 text-center text-[11px] text-description"
      >
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      {/* 画面の端まで広げ、線で区切った縦長のマスに、その日のコーデの写真を大きく出す */}
      <div className="grid grid-cols-7 gap-px border-b border-line bg-line">
        {cells.map((date, index) => {
          if (!date)
            return (
              <span
                key={`blank-${String(index)}`}
                className="aspect-5/8 bg-surface"
              />
            );
          const day = Number(date.slice(8));
          const worn = log[date];
          // 上と下の切り抜きを縦に重ね、全身のコーデに見せる
          const photos = worn
            ? [worn.top, worn.bottom].flatMap((id) => {
                const garment = id ? byId.get(id) : undefined;
                const photo = garment && garmentPhotoUrl(garment);
                return photo ? [photo] : [];
              })
            : [];
          return (
            <button
              key={date}
              type="button"
              aria-pressed={date === selected}
              aria-label={`${String(month.month)}月${String(day)}日${worn ? "、記録あり" : ""}`}
              onClick={() => {
                setSelected(date);
                setEditing(false);
              }}
              className={`relative flex aspect-5/8 flex-col bg-white px-0.5 pt-4 pb-0.5 focus-visible:z-10 ${focusRing} ${date === selected ? "ring-2 ring-main ring-inset" : ""}`}
            >
              <span
                className={`absolute top-0.5 left-1 flex size-4.5 items-center justify-center text-[10px] tabular-nums ${date === today ? "rounded-full border border-main font-bold" : date > today ? "text-muted" : "text-description"}`}
              >
                {day}
              </span>
              {photos.map((photo, index) => (
                // eslint-disable-next-line @next/next/no-img-element -- 小さな切り抜きなので最適化しない
                <img
                  key={photo}
                  src={photo}
                  alt=""
                  // 上下がそろったときは、上の服を下端へ、下の服を上端へ寄せ、間を空けない
                  className={`min-h-0 w-full flex-1 object-contain ${photos.length === 2 ? (index === 0 ? "object-bottom" : "object-top") : ""}`}
                />
              ))}
              {worn && photos.length === 0 && (
                <span className="m-auto size-1.5 rounded-full bg-main" />
              )}
            </button>
          );
        })}
      </div>

      <section className="mt-5 px-4">
        <h3 className="border-b border-main pb-2 text-base font-bold">
          {selectedMonth}月{selectedDay}日（{weekday}）
        </h3>
        {editing ? (
          <WearForm
            entry={entry}
            garments={garments ?? []}
            onSave={(outfit) => {
              wearLogStore.record(selected, outfit);
              setEditing(false);
            }}
            onCancel={() => {
              setEditing(false);
            }}
          />
        ) : entry ? (
          <>
            <dl>
              {(["top", "bottom"] as const).map((slot) => {
                const id = entry[slot];
                if (!id) return null;
                const garment = byId.get(id);
                return (
                  <div key={slot} className="border-b border-line py-2">
                    <dt className="text-xs text-description">
                      {SLOT_LABELS[slot]}
                    </dt>
                    <dd className="mt-0.5 text-sm wrap-anywhere">
                      {garment
                        ? garment.name || categoryLabels[garment.category]
                        : garments
                          ? "クローゼットから消した服"
                          : "…"}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className={secondary}
                onClick={() => {
                  setEditing(true);
                }}
              >
                変える
              </button>
              <button
                type="button"
                className={secondary}
                onClick={() => {
                  wearLogStore.record(selected, { top: null, bottom: null });
                }}
              >
                記録を消す
              </button>
            </div>
          </>
        ) : selected > today ? (
          <p className="mt-4 text-sm text-description">
            まだ来ていない日です。
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-description">
              この日の記録はありません。
            </p>
            <button
              type="button"
              disabled={!garments?.length}
              className={`${secondary} mt-3 disabled:opacity-40`}
              onClick={() => {
                setEditing(true);
              }}
            >
              着た服を記録する
            </button>
          </>
        )}
        {loadError && (
          <p role="alert" className="mt-3 text-xs text-red-800">
            {loadError}
          </p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-description">
          記録はこの端末のブラウザに残ります。ほかの端末とは共有されません。
        </p>
      </section>
    </main>
  );
}

/** 上と下を1着ずつ選んで残す。片方だけでもよい */
function WearForm({
  entry,
  garments,
  onSave,
  onCancel,
}: {
  entry: Outfit | undefined;
  garments: GarmentView[];
  onSave: (outfit: Outfit) => void;
  onCancel: () => void;
}) {
  const [outfit, setOutfit] = useState<Outfit>(
    entry ?? { top: null, bottom: null },
  );
  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(outfit);
      }}
    >
      {(["top", "bottom"] as const).map((slot) => (
        <label key={slot} className="flex flex-col gap-1 text-sm">
          {SLOT_LABELS[slot]}
          <select
            value={outfit[slot] ?? ""}
            onChange={(event) => {
              setOutfit({ ...outfit, [slot]: event.target.value || null });
            }}
            className={`h-11 rounded-md bg-surface px-3 text-sm ${focusRing}`}
          >
            <option value="">なし</option>
            {garments
              .filter((garment) => outfitSlot(garment.category) === slot)
              .map((garment) => (
                <option key={garment.id} value={garment.id}>
                  {garment.name || categoryLabels[garment.category]}
                </option>
              ))}
          </select>
        </label>
      ))}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!outfit.top && !outfit.bottom}
          className={`min-h-11 flex-1 rounded bg-main px-4 text-sm font-semibold text-white disabled:opacity-40 ${focusRing}`}
        >
          記録する
        </button>
        <button type="button" className={secondary} onClick={onCancel}>
          やめる
        </button>
      </div>
    </form>
  );
}
