import assert from "node:assert/strict";
import { test } from "node:test";
import {
  meanOf,
  pickDayTemperatures,
  placeFromQuery,
  roundCoordinate,
  seasonOf,
} from "@/lib/weather";

void test("季節は月で決まる", () => {
  assert.equal(seasonOf(1, null), "winter");
  assert.equal(seasonOf(4, null), "spring");
  assert.equal(seasonOf(7, null), "summer");
  assert.equal(seasonOf(10, null), "autumn");
  assert.equal(seasonOf(12, null), "winter");
});

void test("春と秋は、夏や冬なみの気温なら寄せる", () => {
  assert.equal(seasonOf(5, 24), "summer");
  assert.equal(seasonOf(9, 23), "summer");
  assert.equal(seasonOf(9, 22.9), "autumn");
  assert.equal(seasonOf(11, 10), "winter");
  assert.equal(seasonOf(3, 10.1), "spring");
});

void test("夏と冬の月は、気温で季節を変えない", () => {
  assert.equal(seasonOf(8, 5), "summer");
  assert.equal(seasonOf(1, 25), "winter");
});

void test("1〜12以外の月は断る", () => {
  assert.throws(() => seasonOf(0, null), RangeError);
  assert.throws(() => seasonOf(13, null), RangeError);
});

void test("朝7時・昼13時・夜19時の気温を、四捨五入して取る", () => {
  const times = Array.from(
    { length: 24 },
    (_, hour) => `2026-10-17T${String(hour).padStart(2, "0")}:00`,
  );
  const temperatures = times.map((_, hour) => hour + 0.4);
  assert.deepEqual(pickDayTemperatures(times, temperatures), {
    morning: 7,
    noon: 13,
    night: 19,
  });
});

void test("その時刻が無いか、気温が欠けていればnullにする", () => {
  assert.deepEqual(
    pickDayTemperatures(["2026-10-17T07:00", "2026-10-17T13:00"], [12.6, null]),
    { morning: 13, noon: null, night: null },
  );
});

void test("平均は欠けた値を除いて出し、全部欠けていればnull", () => {
  assert.equal(meanOf([10, null, 20]), 15);
  assert.equal(meanOf([null, null]), null);
});

void test("緯度・経度は0.1度に丸める", () => {
  assert.equal(roundCoordinate(35.6895), 35.7);
  assert.equal(roundCoordinate(139.6917), 139.7);
  assert.equal(roundCoordinate(-33.86), -33.9);
});

void test("位置があれば丸めて使い、無いか不正なら決まった場所にする", () => {
  assert.deepEqual(
    placeFromQuery(new URLSearchParams({ lat: "35.6512", lon: "139.5446" })),
    { latitude: 35.7, longitude: 139.5, place: "current" },
  );
  const queries: Record<string, string>[] = [
    {},
    { lat: "35.6" },
    { lat: "abc", lon: "139" },
    { lat: "91", lon: "139" },
    { lat: "35", lon: "-181" },
  ];
  for (const query of queries) {
    assert.equal(placeFromQuery(new URLSearchParams(query)).place, "fallback");
  }
});
