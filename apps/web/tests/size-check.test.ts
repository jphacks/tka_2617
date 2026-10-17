import assert from "node:assert/strict";
import { test } from "node:test";
import { TOPS, trouserTable } from "@/components/try-on/use-try-on";
import { fitAt, MEASUREMENT_KEYS } from "@/lib/garment";
import { checkSizes, TOP_VERIFIED, TROUSER_VERIFIED } from "@/lib/size-check";
import { TROUSER_KEYS, trouserFitAt } from "@/lib/trousers";

const topBases = Object.entries(TOPS).map(([name, { table }]) => ({
  name,
  base: fitAt("standard", table.standard_cm, table).base,
}));
const trouserBase = trouserFitAt(
  "standard",
  trouserTable.standard_cm,
  trouserTable,
).base;

function inputs<K extends string>(
  keys: readonly K[],
  values: Record<K, number>,
): Record<K, string> {
  return Object.fromEntries(keys.map((k) => [k, String(values[k])])) as Record<
    K,
    string
  >;
}

void test("基準寸法の服は、どの服でもそのまま通る（Tシャツ・長そで・シャツ・ズボン）", () => {
  for (const { name, base } of topBases)
    assert.deepEqual(
      checkSizes(
        MEASUREMENT_KEYS,
        inputs(MEASUREMENT_KEYS, base),
        base,
        TOP_VERIFIED,
      ),
      { problems: {}, outside: [] },
      name,
    );
  assert.deepEqual(
    checkSizes(
      TROUSER_KEYS,
      inputs(TROUSER_KEYS, trouserBase),
      trouserBase,
      TROUSER_VERIFIED,
    ),
    { problems: {}, outside: [] },
  );
});

void test("0・負数・空欄・数値でない値は、モデルへ渡さない", () => {
  const { base } = topBases[0];
  for (const bad of ["0", "-1", "", "  ", "abc", "Infinity", "NaN"]) {
    const check = checkSizes(
      MEASUREMENT_KEYS,
      { ...inputs(MEASUREMENT_KEYS, base), width: bad },
      base,
      TOP_VERIFIED,
    );
    assert.deepEqual(
      check.problems,
      { width: "0より大きい数を入れてください" },
      `「${bad}」`,
    );
  }
});

void test("基準寸法の半分から2倍までを受け付け、その外は範囲を出して止める", () => {
  const { base } = topBases[0];
  const min = Math.ceil(base.length * 0.5);
  const max = Math.floor(base.length * 2);
  const check = (length: number) =>
    checkSizes(
      MEASUREMENT_KEYS,
      { ...inputs(MEASUREMENT_KEYS, base), length: String(length) },
      base,
      TOP_VERIFIED,
    ).problems;
  assert.deepEqual(check(min), {});
  assert.deepEqual(check(max), {});
  const message = `${String(min)}〜${String(max)}cmで入れてください`;
  assert.deepEqual(check(min - 0.5), { length: message });
  assert.deepEqual(check(max + 0.5), { length: message });
  assert.deepEqual(check(1000000), { length: message });
});

void test("Blenderで確かめた範囲の端までは案内を出さず、その外は案内だけ出して形は変える", () => {
  const { base } = topBases[0];
  const check = (width: number) =>
    checkSizes(
      MEASUREMENT_KEYS,
      { ...inputs(MEASUREMENT_KEYS, base), width: String(width) },
      base,
      TOP_VERIFIED,
    );
  assert.deepEqual(check(base.width + 10), { problems: {}, outside: [] });
  assert.deepEqual(check(base.width - 16), { problems: {}, outside: [] });
  assert.deepEqual(check(base.width + 10.5), {
    problems: {},
    outside: ["width"],
  });
  assert.deepEqual(check(base.width - 16.5), {
    problems: {},
    outside: ["width"],
  });

  const wide = checkSizes(
    TROUSER_KEYS,
    {
      ...inputs(TROUSER_KEYS, trouserBase),
      thigh: String(trouserBase.thigh + 5),
    },
    trouserBase,
    TROUSER_VERIFIED,
  );
  assert.deepEqual(wide, { problems: {}, outside: ["thigh"] });
});
