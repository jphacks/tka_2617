"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GarmentView } from "@pitari/api";
import { OutfitAvatar } from "@/components/outfit-avatar";
import { categoryLabels } from "@/lib/garment-category";
import { garmentPhotoUrl } from "@/lib/garment-photo";
import { loadOutfit, outfitSlot, saveOutfit, type Outfit } from "@/lib/outfit";
import { requestJson } from "@/lib/request";
import { todayKey, wearLogStore } from "@/lib/wear-log";
import { isWearable } from "@/lib/worn-garment";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main";
const storage = () => window.localStorage;

/**
 * クローゼットの着せ替え：服をタップして、アバターに着せたり脱がせたりする。
 * 着ている服は「アバターに着せる」と同じく覚えておき、アバターの画面とそろえる
 */
export function ClosetDressUp() {
  const [garments, setGarments] = useState<GarmentView[] | null>(null);
  const [loadError, setLoadError] = useState("");
  // 着せ替えはタブを押してから描くので、最初からブラウザの保存を読める
  const [outfit, setOutfit] = useState<Outfit>(() => loadOutfit(storage));
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    requestJson<{ garments: GarmentView[] }>("/api/garments", {
      signal: controller.signal,
    })
      .then((data) => {
        if (active) setGarments(data.garments);
      })
      .catch(() => {
        if (active)
          setLoadError(
            "クローゼットを読み込めませんでした。APIとDBの起動を確認してください。",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  function change(next: Outfit) {
    setOutfit(next);
    saveOutfit(storage, next);
    setRecorded(false);
  }

  if (loadError)
    return (
      <p role="alert" className="px-4 py-6 text-sm">
        {loadError}
      </p>
    );
  if (garments === null)
    return (
      <p role="status" className="px-4 py-6 text-sm text-description">
        読み込み中…
      </p>
    );

  const wearable = garments.filter(isWearable);
  const byId = new Map(wearable.map((garment) => [garment.id, garment]));
  // 消した服や、寸法が足りない服は着ていないものとして扱う
  const top = outfit.top ? (byId.get(outfit.top) ?? null) : null;
  const bottom = outfit.bottom ? (byId.get(outfit.bottom) ?? null) : null;
  const worn = [top, bottom].filter((garment) => garment !== null);
  const wearing = { top: top?.id ?? null, bottom: bottom?.id ?? null };

  if (wearable.length === 0)
    return (
      <section className="flex flex-col items-center gap-3 px-6 pt-10 pb-9 text-center">
        <p className="text-sm text-description">
          寸法のある服を登録すると、ここでアバターに着せられます。
        </p>
        <Link
          href="/capture"
          className={`flex min-h-11 items-center rounded bg-main px-6 text-sm font-semibold text-white ${focusRing}`}
        >
          服を登録する
        </Link>
      </section>
    );

  return (
    <section className="px-4 pt-4 pb-8">
      {/* 服を替えたら、試着の状態をその服の寸法で作り直す */}
      <OutfitAvatar
        key={`${String(top?.id)} ${String(bottom?.id)}`}
        top={top}
        bottom={bottom}
      />

      <div className="mt-3 flex min-h-9 flex-wrap gap-2">
        {worn.map((garment) => (
          <button
            key={garment.id}
            type="button"
            aria-label={`${garment.name || categoryLabels[garment.category]}を脱ぐ`}
            onClick={() => {
              change({ ...wearing, [outfitSlot(garment.category)]: null });
            }}
            className={`flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] ${focusRing}`}
          >
            {garment.name || categoryLabels[garment.category]}
            <span aria-hidden="true">×</span>
          </button>
        ))}
        {worn.length < 2 && (
          <p className="self-center text-[13px] text-description">
            {worn.length === 0 ? "何も着ていません。" : ""}
            着ていない側は、見本の服を着せています
          </p>
        )}
      </div>

      <h2 className="mt-4 text-[13px] font-semibold">タップで着せる・脱ぐ</h2>
      <div className="mt-2 grid grid-cols-3 gap-2.5">
        {wearable.map((garment) => {
          const slot = outfitSlot(garment.category);
          const selected = wearing[slot] === garment.id;
          const photo = garmentPhotoUrl(garment);
          return (
            <button
              key={garment.id}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                change({ ...wearing, [slot]: selected ? null : garment.id });
              }}
              className={`min-w-0 overflow-hidden rounded-md bg-white text-left transition active:scale-[0.97] ${focusRing} ${selected ? "border-2 border-main" : "border border-line"}`}
            >
              <span className="block aspect-square bg-surface p-1.5">
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element -- 小さな切り抜きなので最適化しない
                  <img
                    src={photo}
                    alt=""
                    className="size-full object-contain"
                  />
                )}
              </span>
              <span className="block px-1.5 pt-1.5 pb-2 text-xs leading-snug wrap-anywhere">
                {garment.name || categoryLabels[garment.category]}
              </span>
            </button>
          );
        })}
      </div>
      {wearable.length < garments.length && (
        <p className="mt-2 text-xs text-description">
          寸法の足りない服は、着せられないので出していません。
        </p>
      )}

      {recorded && (
        <p role="status" className="mt-4 text-center text-sm">
          今日の記録に残しました。「記録」で見られます。
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={worn.length === 0}
          onClick={() => {
            change({ top: null, bottom: null });
          }}
          className={`min-h-12 flex-1 rounded border border-main text-sm font-semibold disabled:opacity-40 ${focusRing}`}
        >
          ぜんぶ脱ぐ
        </button>
        <button
          type="button"
          disabled={worn.length === 0}
          onClick={() => {
            setRecorded(wearLogStore.record(todayKey(), wearing));
          }}
          className={`min-h-12 flex-1 rounded bg-main text-sm font-semibold text-white disabled:opacity-40 ${focusRing}`}
        >
          これを着る
        </button>
      </div>
    </section>
  );
}
