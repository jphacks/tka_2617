import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { AVATAR_MODELS } from "@/lib/avatar-models";
import {
  categoryChoices,
  categoryLabels,
  categoryModels,
} from "@/lib/garment-category";

void test("撮影の画面では、シャツ・長そで・Tシャツ・ズボンの順に選べる", () => {
  assert.deepEqual(
    categoryChoices.map((category) => categoryLabels[category]),
    ["シャツ", "長そで", "Tシャツ", "ズボン"],
  );
});

void test("服の種類ごとに、着せる3Dモデルのglbがある", () => {
  const urls = categoryChoices.map((category) => {
    const model = categoryModels[category];
    return model === "trousers"
      ? AVATAR_MODELS.male.trousers
      : AVATAR_MODELS.male.tops[model].url;
  });
  assert.deepEqual(urls, [
    "/models/shirt_male.glb",
    "/models/longsleeve_male.glb",
    "/models/tshirt_male.glb",
    "/models/trousers_male.glb",
  ]);
  for (const url of urls)
    assert.ok(
      existsSync(new URL(`../public${url}`, import.meta.url)),
      `${url}がない`,
    );
});
