import type { Category } from "@pitari/api";

// アバターには、上の服と下の服を1着ずつ着せる（docs/3d-handoff.mdの「クローゼットからアバターへの服の渡し方」）
export type OutfitSlot = "top" | "bottom";
export type Outfit = Record<OutfitSlot, string | null>;

// 服の種類を足したら、ここも足さないと型エラーになる
const slotOfCategory: Record<Category, OutfitSlot> = {
  short_sleeve_top: "top",
  long_sleeve_top: "top",
  trousers: "bottom",
};

const noOutfit: Outfit = { top: null, bottom: null };
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 最後に着せた服を覚えておき、別の服を選んだときに、もう片方をそのまま残す
const storageKey = "pitari.outfit";

export function outfitSlot(category: Category): OutfitSlot {
  return slotOfCategory[category];
}

export function wear(
  outfit: Outfit,
  garment: { id: string; category: Category },
): Outfit {
  return { ...outfit, [outfitSlot(garment.category)]: garment.id };
}

export function avatarUrl(outfit: Outfit): string {
  const params = new URLSearchParams();
  if (outfit.top) params.set("top", outfit.top);
  if (outfit.bottom) params.set("bottom", outfit.bottom);
  const query = params.toString();
  return query ? `/avatar?${query}` : "/avatar";
}

// アバターの画面で、URLから着せる服のIDを読む。IDの形でない値は、指定されていないものとして扱う
export function readOutfit(params: {
  get(name: string): string | null;
}): Outfit {
  return {
    top: garmentId(params.get("top")),
    bottom: garmentId(params.get("bottom")),
  };
}

export function loadOutfit(storage: Pick<Storage, "getItem">): Outfit {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) ?? "null");
    if (typeof value !== "object" || value === null) return noOutfit;
    const saved = value as Record<string, unknown>;
    return { top: garmentId(saved.top), bottom: garmentId(saved.bottom) };
  } catch {
    // 壊れた値や、保存を禁止しているブラウザでは、何も着ていない状態から始める
    return noOutfit;
  }
}

export function saveOutfit(
  storage: Pick<Storage, "setItem">,
  outfit: Outfit,
): void {
  try {
    storage.setItem(storageKey, JSON.stringify(outfit));
  } catch {
    // 保存できなくても、URLで服を渡せば着せられる
  }
}

function garmentId(value: unknown): string | null {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}
