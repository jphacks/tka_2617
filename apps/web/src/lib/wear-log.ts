import { z } from "zod";
import type { Outfit } from "@/lib/outfit";

// 着た服の記録。ログインを入れるまでは、ブラウザのlocalStorageに保存する（docs/adr/0046-wear-log-in-browser.md）
const storageKey = "pitari.wear-log";

const dateKeyPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const OutfitSchema = z.object({
  top: z.uuid().nullable(),
  bottom: z.uuid().nullable(),
});
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

  const get = (): WearLog => (log ??= load(storage) ?? {});

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      // 別のタブで記録したら、読み直して出す
      const onStorage = (event: StorageEvent) => {
        if (event.key !== storageKey && event.key !== null) return;
        log = undefined;
        listener();
      };
      if (typeof window !== "undefined")
        window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined")
          window.removeEventListener("storage", onStorage);
      };
    },
    get,
    /**
     * その日に着た服を残す。上も下も無ければ、その日の記録を消す。
     * 日付や服のIDの形が違うときは、保存せずにfalseを返す
     */
    record: (date: string, outfit: Outfit): boolean => {
      if (!isEntry(date, outfit)) return false;
      // 別のタブで足した記録を消さないよう、保存されている最新の記録に足す
      const latest = load(storage) ?? get();
      const rest = Object.fromEntries(
        Object.entries(latest).filter(([key]) => key !== date),
      );
      save(outfit.top || outfit.bottom ? { ...rest, [date]: outfit } : rest);
      return true;
    },
  };
}

function isEntry(date: string, outfit: unknown): outfit is Outfit {
  return dateKeyPattern.test(date) && OutfitSchema.safeParse(outfit).success;
}

/** 保存されている記録。形の違う日だけを捨て、ほかの日は残す。読めないブラウザではnull */
function load(storage: () => Pick<Storage, "getItem">): WearLog | null {
  let text: string | null;
  try {
    text = storage().getItem(storageKey);
  } catch {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return {};
    return Object.fromEntries(
      Object.entries(value).filter(([date, outfit]) => isEntry(date, outfit)),
    );
  } catch {
    return {};
  }
}
