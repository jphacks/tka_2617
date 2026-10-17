import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avatarUrl,
  loadOutfit,
  outfitSlot,
  readOutfit,
  saveOutfit,
  wear,
} from "@/lib/outfit";

const shirtId = "11111111-1111-4111-8111-111111111111";
const trousersId = "22222222-2222-4222-8222-222222222222";
const otherShirtId = "33333333-3333-4333-8333-333333333333";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("pitari.outfit", initial);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
  return () => storage;
}

function deniedStorage(): never {
  throw new Error("サイトのデータを禁止したブラウザ");
}

void test("半袖と長袖は上、ズボンは下に入る", () => {
  assert.equal(outfitSlot("short_sleeve_top"), "top");
  assert.equal(outfitSlot("long_sleeve_top"), "top");
  assert.equal(outfitSlot("trousers"), "bottom");
});

void test("服を着せると、同じ側だけが入れ替わり、もう片方は残る", () => {
  const withTrousers = wear(
    { top: shirtId, bottom: null },
    { id: trousersId, category: "trousers" },
  );
  assert.deepEqual(withTrousers, { top: shirtId, bottom: trousersId });
  assert.deepEqual(
    wear(withTrousers, { id: otherShirtId, category: "long_sleeve_top" }),
    { top: otherShirtId, bottom: trousersId },
  );
});

void test("アバターのURLには、着せる服のIDだけを付ける", () => {
  assert.equal(
    avatarUrl({ top: shirtId, bottom: trousersId }),
    `/avatar?top=${shirtId}&bottom=${trousersId}`,
  );
  assert.equal(
    avatarUrl({ top: null, bottom: trousersId }),
    `/avatar?bottom=${trousersId}`,
  );
  assert.equal(avatarUrl({ top: null, bottom: null }), "/avatar");
});

void test("URLから読むとき、IDの形でない値は無視する", () => {
  assert.deepEqual(
    readOutfit(new URLSearchParams(`top=${shirtId}&bottom=../../etc`)),
    { top: shirtId, bottom: null },
  );
  assert.deepEqual(readOutfit(new URLSearchParams("")), {
    top: null,
    bottom: null,
  });
});

void test("覚えた服は、保存して読み戻せる", () => {
  const storage = memoryStorage();
  saveOutfit(storage, { top: shirtId, bottom: trousersId });
  assert.deepEqual(loadOutfit(storage), { top: shirtId, bottom: trousersId });
});

void test("保存した値が壊れていても、何も着ていない状態で始める", () => {
  assert.deepEqual(loadOutfit(memoryStorage("{壊れたJSON")), {
    top: null,
    bottom: null,
  });
  assert.deepEqual(loadOutfit(memoryStorage('{"top":"abc","bottom":1}')), {
    top: null,
    bottom: null,
  });
});

void test("localStorageを取り出せないブラウザでも、例外を出さずに着せられる", () => {
  assert.deepEqual(loadOutfit(deniedStorage), { top: null, bottom: null });
  assert.doesNotThrow(() => {
    saveOutfit(deniedStorage, { top: shirtId, bottom: null });
  });
});
