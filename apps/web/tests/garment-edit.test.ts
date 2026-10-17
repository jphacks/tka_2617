import assert from "node:assert/strict";
import { test } from "node:test";
import { editGarmentPath, editingGarmentId } from "@/lib/garment-edit";

const id = "3f2b8c1e-5a4d-4c6b-9e7f-0a1b2c3d4e5f";

void test("詳細から編集へ進むURLに、その服のIDを入れる", () => {
  const url = new URL(editGarmentPath(id), "http://localhost");
  assert.equal(url.pathname, "/capture");
  assert.equal(url.searchParams.get("edit"), id);
});

void test("編集へ渡したIDを、撮影画面で同じIDとして取り出せる", () => {
  const url = new URL(editGarmentPath(id), "http://localhost");
  assert.equal(editingGarmentId(url.searchParams.get("edit") ?? undefined), id);
});

void test("IDが無いか、服のIDの形でなければ、編集せずに撮影から始める", () => {
  assert.equal(editingGarmentId(undefined), null);
  assert.equal(editingGarmentId(""), null);
  assert.equal(editingGarmentId("../health"), null);
  assert.equal(editingGarmentId([id, id]), null);
});
