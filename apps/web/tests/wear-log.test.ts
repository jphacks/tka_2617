import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWearLogStore,
  dateKey,
  monthCells,
  todayKey,
} from "@/lib/wear-log";

const top = "11111111-1111-4111-8111-111111111111";
const bottom = "22222222-2222-4222-8222-222222222222";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}

void test("日付は端末の時刻でYYYY-MM-DDにする", () => {
  assert.equal(dateKey(2026, 1, 5), "2026-01-05");
  assert.equal(todayKey(new Date(2026, 9, 18, 23, 59)), "2026-10-18");
});

void test("月のマスは日曜はじまりで、1日より前をnullで埋める", () => {
  // 2026年10月1日は木曜日
  const cells = monthCells(2026, 10);
  assert.deepEqual(cells.slice(0, 5), [null, null, null, null, "2026-10-01"]);
  assert.equal(cells.length, 4 + 31);
  assert.equal(cells.at(-1), "2026-10-31");
  assert.equal(monthCells(2028, 2).at(-1), "2028-02-29");
});

void test("記録は日ごとに残し、読み直しても残る", () => {
  const storage = memoryStorage();
  const store = createWearLogStore(() => storage);
  let changes = 0;
  store.subscribe(() => {
    changes += 1;
  });
  store.record("2026-10-18", { top, bottom });
  store.record("2026-10-17", { top: null, bottom });
  assert.equal(changes, 2);
  assert.deepEqual(createWearLogStore(() => storage).get(), {
    "2026-10-18": { top, bottom },
    "2026-10-17": { top: null, bottom },
  });
});

void test("上も下も無い記録は、その日の記録を消す", () => {
  const storage = memoryStorage();
  const store = createWearLogStore(() => storage);
  store.record("2026-10-18", { top, bottom: null });
  store.record("2026-10-18", { top: null, bottom: null });
  assert.deepEqual(store.get(), {});
});

void test("壊れた値や、保存を禁止したブラウザでは、記録の無い状態から始める", () => {
  for (const value of [
    "{",
    '{"2026-13-01":{"top":null,"bottom":null}}',
    '{"2026-10-18":{"top":"not-a-uuid","bottom":null}}',
  ])
    assert.deepEqual(
      createWearLogStore(() =>
        memoryStorage({ "pitari.wear-log": value }),
      ).get(),
      {},
    );
  const blocked = createWearLogStore(() => {
    throw new Error("SecurityError");
  });
  assert.deepEqual(blocked.get(), {});
  // 保存できなくても、開いている間は使える
  blocked.record("2026-10-18", { top, bottom: null });
  assert.deepEqual(blocked.get(), { "2026-10-18": { top, bottom: null } });
});
