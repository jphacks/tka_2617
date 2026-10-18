import { z } from "zod";
import type { Outfit } from "@/lib/outfit";

// 着た服の記録。ログインを入れるまでは、ブラウザのlocalStorageに保存する（docs/adr/0043-wear-log-in-browser.md）
const storageKey = "pitari.wear-log";

const dateKeyPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const WearLogSchema = z.record(
  z.string().regex(dateKeyPattern),
  z.object({ top: z.uuid().nullable(), bottom: z.uuid().nullable() }),
);
/** 日付（YYYY-MM-DD）ごとに、その日に着た上と下の服のID */
export type WearLog = Partial<Record<string, Outfit>>;

/** 端末の時刻での日付（YYYY-MM-DD）。月は1始まり */
export function dateKey(year: number, month: number, day: number): string {
  return `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayKey(now = new Date()): string {
  return dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** 月のカレンダーのマス。日曜はじまりで、1日より前の曜日はnullで埋める */
export function monthCells(year: number, month: number): (string | null)[] {
  const offset = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  return [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => dateKey(year, month, i + 1)),
  ];
}

/**
 * 記録を読み書きする。useSyncExternalStoreに渡せるよう、読んだ値を同じオブジェクトのまま返す。
 * サイトのデータを禁止したブラウザでは、window.localStorageを読むだけで例外になるので、storageは関数で受け取る
 */
export function createWearLogStore(
  storage: () => Pick<Storage, "getItem" | "setItem">,
) {
  let log: WearLog | undefined;
  const listeners = new Set<() => void>();

  function save(next: WearLog) {
    log = next;
    try {
      storage().setItem(storageKey, JSON.stringify(next));
    } catch {
      // 保存できなくても、開いている間は使える
    }
    for (const listener of listeners) listener();
  }

  const get = (): WearLog => (log ??= load(storage));

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get,
    /** その日に着た服を残す。上も下も無ければ、その日の記録を消す */
    record: (date: string, outfit: Outfit) => {
      const rest = Object.fromEntries(
        Object.entries(get()).filter(([key]) => key !== date),
      );
      save(outfit.top || outfit.bottom ? { ...rest, [date]: outfit } : rest);
    },
  };
}

function load(storage: () => Pick<Storage, "getItem">): WearLog {
  try {
    const value: unknown = JSON.parse(storage().getItem(storageKey) ?? "{}");
    const parsed = WearLogSchema.safeParse(value);
    return parsed.success ? parsed.data : {};
  } catch {
    // 壊れた値や、保存を禁止しているブラウザでは、記録の無い状態から始める
    return {};
  }
}
