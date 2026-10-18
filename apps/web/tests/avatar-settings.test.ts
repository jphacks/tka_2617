import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAvatarSettingsStore,
  defaultAvatarSettings,
  heightFromInput,
  heightRangeOf,
  modelGenderOf,
  withGender,
  type AvatarSettings,
} from "@/lib/avatar-settings";

const registered: AvatarSettings = {
  ...defaultAvatarSettings,
  gender: "female",
  heightCm: 160,
  build: "slim",
  bodyFrame: "wave",
};

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("pitari.avatar", initial);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
  return () => storage;
}

function deniedStorage(): never {
  throw new Error("サイトのデータを禁止したブラウザ");
}

void test("骨格は女性のときだけ持ち、初めて女性を選んだときは「わからない」にする", () => {
  const female = withGender(defaultAvatarSettings, "female");
  assert.equal(female.bodyFrame, "unknown");
  assert.equal(withGender(registered, "female").bodyFrame, "wave");
  assert.equal(withGender(registered, "male").bodyFrame, null);
  assert.equal(withGender(registered, "unspecified").bodyFrame, null);
});

void test("身長は、3Dで変えられる範囲だけを受け付ける（男性と「選ばない」は150〜195cm、女性は140〜185cm）", () => {
  const male = heightRangeOf("male");
  assert.deepEqual(heightRangeOf("unspecified"), male);
  assert.equal(heightFromInput("150", male), 150);
  assert.equal(heightFromInput("172.5", male), 172.5);
  assert.equal(heightFromInput("195", male), 195);
  assert.equal(heightFromInput("149.5", male), null);
  assert.equal(heightFromInput("196", male), null);
  assert.equal(heightFromInput("", male), null);
  assert.equal(heightFromInput("abc", male), null);
  const female = heightRangeOf("female");
  assert.equal(heightFromInput("140", female), 140);
  assert.equal(heightFromInput("185", female), 185);
  assert.equal(heightFromInput("139.5", female), null);
  assert.equal(heightFromInput("190", female), null);
});

void test("女性は女性の3Dモデル、男性と「選ばない」は男性の3Dモデルを使う", () => {
  assert.equal(modelGenderOf("female"), "female");
  assert.equal(modelGenderOf("male"), "male");
  assert.equal(modelGenderOf("unspecified"), "male");
});

void test("性別を変えたら、身長をその性別で入力できる範囲に収める", () => {
  const tall = { ...registered, gender: "male" as const, heightCm: 192 };
  assert.equal(withGender(tall, "female").heightCm, 185);
  assert.equal(withGender(registered, "male").heightCm, 160);
  assert.equal(
    withGender({ ...registered, heightCm: 142 }, "male").heightCm,
    150,
  );
});

void test("まだ登録していなければnull、保存すると次に開いたときも読める", () => {
  const storage = memoryStorage();
  const store = createAvatarSettingsStore(storage);
  assert.equal(store.get(), null);
  store.save(registered);
  assert.deepEqual(createAvatarSettingsStore(storage).get(), registered);
});

void test("同じ設定は同じオブジェクトで返し、保存したら知らせる", () => {
  const store = createAvatarSettingsStore(
    memoryStorage(JSON.stringify(registered)),
  );
  assert.equal(store.get(), store.get());
  let notified = 0;
  const unsubscribe = store.subscribe(() => {
    notified += 1;
  });
  store.save({ ...registered, build: "broad" });
  unsubscribe();
  store.save(registered);
  assert.equal(notified, 1);
});

void test("壊れた値や、範囲の外の身長が保存されていたら、登録からやり直す", () => {
  for (const saved of [
    "{壊れたJSON",
    JSON.stringify({ ...registered, heightCm: 210 }),
    JSON.stringify({ ...registered, build: "heavy" }),
    JSON.stringify({ heightCm: 170 }),
  ])
    assert.equal(createAvatarSettingsStore(memoryStorage(saved)).get(), null);
});

void test("骨格が性別と食い違うか、一覧に無い髪なら、登録に戻さずに直して使う", () => {
  const load = (saved: AvatarSettings) =>
    createAvatarSettingsStore(memoryStorage(JSON.stringify(saved))).get();
  assert.equal(load({ ...registered, bodyFrame: null })?.bodyFrame, "unknown");
  assert.equal(load({ ...registered, gender: "male" })?.bodyFrame, null);
  assert.equal(
    load({ ...registered, hairId: "removed" })?.hairId,
    defaultAvatarSettings.hairId,
  );
  assert.equal(load({ ...registered, hairId: null })?.hairId, null);
  assert.deepEqual(load(registered), registered);
});

void test("localStorageを使えないブラウザでも、開いている間は登録した設定を使える", () => {
  const store = createAvatarSettingsStore(deniedStorage);
  assert.equal(store.get(), null);
  store.save(registered);
  assert.deepEqual(store.get(), registered);
});
