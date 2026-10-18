import assert from "node:assert/strict";
import { test } from "node:test";
import { dayNumberOf, todayLabel, wardrobeNeeds } from "@/lib/today";

const registered = (categories: Parameters<typeof wardrobeNeeds>[0]) =>
  wardrobeNeeds(categories).map((need) => [need.label, need.registered]);

void test("服が無ければ、トップスとボトムスが未登録", () => {
  assert.deepEqual(registered([]), [
    ["トップス", false],
    ["ボトムス", false],
  ]);
});

void test("Tシャツ・長そで・シャツはトップス、ズボンはボトムスとして数える", () => {
  for (const top of ["short_sleeve_top", "long_sleeve_top", "shirt"] as const) {
    assert.deepEqual(registered([top]), [
      ["トップス", true],
      ["ボトムス", false],
    ]);
  }
  assert.deepEqual(registered(["trousers", "trousers"]), [
    ["トップス", false],
    ["ボトムス", true],
  ]);
});

void test("靴は数えないので、上と下があればそろう", () => {
  assert.deepEqual(registered(["shirt", "trousers"]), [
    ["トップス", true],
    ["ボトムス", true],
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

void test("日ごとの数は、日本の0時に1つ進み、同じ日の間は変わらない", () => {
  const morning = dayNumberOf(new Date("2026-10-18T00:00:00+09:00"));
  assert.equal(dayNumberOf(new Date("2026-10-18T23:59:59+09:00")), morning);
  // UTCではまだ10月18日だが、日本では10月19日
  assert.equal(dayNumberOf(new Date("2026-10-18T15:00:00Z")), morning + 1);
});
