import assert from "node:assert/strict";
import { test } from "node:test";
import { todayLabel, wardrobeNeeds } from "@/lib/today";

const registered = (categories: Parameters<typeof wardrobeNeeds>[0]) =>
  wardrobeNeeds(categories).map((need) => [need.label, need.registered]);

void test("服が無ければ、トップス・ボトムス・靴のすべてが未登録", () => {
  assert.deepEqual(registered([]), [
    ["トップス", false],
    ["ボトムス", false],
    ["靴", false],
  ]);
});

void test("Tシャツ・長そで・シャツはトップス、ズボンはボトムスとして数える", () => {
  for (const top of ["short_sleeve_top", "long_sleeve_top", "shirt"] as const) {
    assert.deepEqual(registered([top]), [
      ["トップス", true],
      ["ボトムス", false],
      ["靴", false],
    ]);
  }
  assert.deepEqual(registered(["trousers", "trousers"]), [
    ["トップス", false],
    ["ボトムス", true],
    ["靴", false],
  ]);
});

void test("靴の種類はまだ無いので、全部の種類があっても靴は未登録", () => {
  assert.deepEqual(registered(["shirt", "trousers"]), [
    ["トップス", true],
    ["ボトムス", true],
    ["靴", false],
  ]);
});

void test("日付は日本の日付で、曜日を全角の括弧で囲む", () => {
  // UTCでは10月17日の夜だが、日本では10月18日（日）
  assert.equal(todayLabel(new Date("2026-10-17T15:30:00Z")), "10月18日（日）");
  assert.equal(
    todayLabel(new Date("2026-01-05T00:00:00+09:00")),
    "1月5日（月）",
  );
});
