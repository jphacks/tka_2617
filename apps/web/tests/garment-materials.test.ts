import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultMaterialRows,
  materialRows,
  materialsFromRows,
  materialsSummary,
} from "@/lib/garment-materials";

void test("混率の入力欄を、APIに送る形にする", () => {
  assert.deepEqual(
    materialsFromRows([
      { materialId: "cotton", percent: "98" },
      { materialId: "polyurethane", percent: " 2 " },
    ]),
    {
      materials: [
        { materialId: "cotton", percent: 98 },
        { materialId: "polyurethane", percent: 2 },
      ],
    },
  );
});

void test("合計が100%でないときは、今の合計を出して止める", () => {
  assert.deepEqual(
    materialsFromRows([
      { materialId: "cotton", percent: "80" },
      { materialId: "polyester", percent: "10" },
    ]),
    { error: "割合の合計を100%にしてください（今は90%）" },
  );
});

void test("空欄・小数・範囲外の割合と、同じ素材の重なりは止める", () => {
  for (const percent of ["", "50.5", "0", "101", "abc"])
    assert.deepEqual(
      materialsFromRows([
        { materialId: "cotton", percent },
        { materialId: "polyester", percent: "50" },
      ]),
      { error: "割合は1〜100の整数で入れてください" },
    );
  assert.deepEqual(
    materialsFromRows([
      { materialId: "cotton", percent: "50" },
      { materialId: "cotton", percent: "50" },
    ]),
    { error: "同じ素材が2つあります" },
  );
  assert.deepEqual(materialsFromRows([]), {
    error: "素材を1つ以上入れてください",
  });
});

void test("APIの素材から入力欄を作り、素材が無ければ綿100%で始める", () => {
  assert.deepEqual(
    materialRows([
      { materialId: "wool", percent: 70 },
      { materialId: "nylon", percent: 30 },
    ]),
    [
      { materialId: "wool", percent: "70" },
      { materialId: "nylon", percent: "30" },
    ],
  );
  assert.deepEqual(materialRows([]), defaultMaterialRows);
});

void test("素材は「綿98% ポリウレタン2%」のように並べて出す", () => {
  assert.equal(
    materialsSummary([
      { label: "綿", percent: 98 },
      { label: "ポリウレタン", percent: 2 },
    ]),
    "綿98% ポリウレタン2%",
  );
});
