"use client";

import { categoryChoices, categoryLabels } from "@/lib/garment-category";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import type {
  Category,
  DetectionOptions,
  DetectionResult,
  Measurements,
  MeasurementKey,
  MeasurementDefinition,
  GarmentView,
} from "@pitari/api";
import { preparePhoto, jpegFile, pngFile } from "@/lib/photo";
import { requestJson } from "@/lib/request";
import { garmentPhotoUrl } from "@/lib/garment-photo";
import { textureRequestMessage } from "@/lib/garment-texture";
import {
  prepareBackPhoto,
  uploadBackPhoto,
  type BackPhoto,
} from "@/lib/back-photo";
import { MeasurementProgress } from "@/components/measurement-progress";
import { MaterialsEditor } from "@/components/materials-editor";
import {
  defaultMaterialRows,
  materialRows,
  materialsFromRows,
  type MaterialRow,
} from "@/lib/garment-materials";
import type { MeasurementProgressState } from "@/lib/measurement-progress";
import { GarmentMeasurements } from "@/components/garment-measurements";
import { MeasurementImage } from "@/components/measurement-image";
import type { AdjustmentMode } from "@/components/measurement-image";
import { SimilarGarmentsSheet } from "@/components/similar-garments-sheet";
import { cutoutColorFamily, type AddedGarment } from "@/lib/color-family";

type DefinitionResponse = {
  definitions: Record<Category, MeasurementDefinition[]>;
  measurementVersion: DetectionResult["measurementVersion"];
};
type Photo = Awaited<ReturnType<typeof preparePhoto>>;
const emptyMeasurements: Measurements = {
  shoulderWidthCm: null,
  sleeveLengthCm: null,
  bodyWidthCm: null,
  bodyLengthCm: null,
  waistCm: null,
  hipCm: null,
  thighWidthCm: null,
  riseCm: null,
  inseamCm: null,
  hemWidthCm: null,
};
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main";
const button = `min-h-12 rounded bg-main px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-85 active:scale-[0.98] disabled:opacity-40 ${focusRing}`;
const secondary = `min-h-11 rounded border border-main bg-white px-3 py-2 text-sm font-semibold transition hover:bg-surface active:scale-[0.98] disabled:opacity-40 ${focusRing}`;
const field = `rounded-md bg-surface px-3 py-2 text-sm text-main ${focusRing}`;

export function MeasurementStudio({ editId }: { editId: string | null }) {
  const [definitions, setDefinitions] = useState<DefinitionResponse | null>(
    null,
  );
  // 着せる3Dモデルを決めるため、測定の前に選んでもらう。シャツと長そでは写真から見分けない
  const [chosenCategory, setChosenCategory] = useState<Category | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [back, setBack] = useState<BackPhoto | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [mode, setMode] = useState<AdjustmentMode | "dimensions">("dimensions");
  const [values, setValues] = useState<Measurements>({ ...emptyMeasurements });
  const [overrides, setOverrides] = useState<
    Partial<Record<MeasurementKey, boolean>>
  >({});
  const [name, setName] = useState("");
  const [materialInput, setMaterialInput] =
    useState<MaterialRow[]>(defaultMaterialRows);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<MeasurementProgressState | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [garments, setGarments] = useState<GarmentView[]>([]);
  // 足したばかりの服。同じ系統の服を数えて、下から出す
  const [added, setAdded] = useState<AddedGarment | null>(null);
  const similarSheet = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Pick<
    GarmentView,
    "id" | "category" | "measurements"
  > | null>(null);
  // 服の詳細から来たときは、その服を読み込んでから編集欄を開く
  const [editLoad, setEditLoad] = useState<"loading" | "failed" | "done">(
    editId ? "loading" : "done",
  );
  const [editAttempt, setEditAttempt] = useState(0);
  // 読み込みの途中で写真や別の服を選ぶと、遅れて届いた服で上書きされるので、
  // 頼まれた服を開けるまでは、読み込み直す以外の操作をさせない
  const locked = busy || editLoad !== "done";
  const category = editing?.category ?? result?.category;
  const fields =
    category && definitions ? definitions.definitions[category] : [];

  useEffect(() => {
    if (!editId) return;
    let active = true;
    Promise.all([
      requestJson<DefinitionResponse>("/api/measurements"),
      requestJson<GarmentView>(`/api/garments/${encodeURIComponent(editId)}`),
    ])
      .then(([loadedDefinitions, garment]) => {
        if (!active) return;
        setDefinitions(loadedDefinitions);
        startEditing(garment);
        setEditLoad("done");
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "服を読み込めませんでした",
        );
        setEditLoad("failed");
      });
    return () => {
      active = false;
    };
  }, [editId, editAttempt]);

  function startEditing(garment: GarmentView) {
    setEditing(garment);
    setChosenCategory(garment.category);
    setResult(null);
    setPhoto(null);
    setBack(null);
    setName(garment.name);
    setMaterialInput(materialRows(garment.materials));
    setValues(garment.measurements);
    setOverrides({});
    setError("");
    setMessage("");
  }

  function showProgress(
    percent: number,
    nextPercent: number,
    label: string,
    estimatedMs = 10000,
  ) {
    setProgress({
      percent,
      nextPercent,
      label,
      estimatedMs,
      startedAt: performance.now(),
    });
  }

  async function work(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "処理に失敗しました",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function loadDefinitions() {
    const data =
      definitions ??
      (await requestJson<DefinitionResponse>("/api/measurements"));
    setDefinitions(data);
    return data;
  }

  async function detect(
    stage: DetectionOptions["stage"],
    current?: DetectionResult,
    chosen?: Category | "auto",
  ) {
    if (!photo) throw new Error("写真を選んでください");
    const form = new FormData();
    const selectedCategory = chosen ?? current?.category ?? "auto";
    form.set("image", photo.file);
    form.set(
      "options",
      JSON.stringify({
        stage,
        category: selectedCategory,
        paperCorners:
          current?.paperCorners.length === 4 ? current.paperCorners : [],
        bbox:
          selectedCategory !== "auto"
            ? (current?.bbox ?? undefined)
            : undefined,
        points: stage === "cutout" ? (current?.points ?? []) : [],
      }),
    );
    return requestJson<DetectionResult>("/api/detections", {
      method: "POST",
      body: form,
    });
  }

  function applyValues(measurements: Measurements, preserveManual = true) {
    setValues((previous) => {
      const next = { ...measurements };
      if (preserveManual)
        for (const key of Object.keys(overrides) as MeasurementKey[])
          if (overrides[key]) next[key] = previous[key];
      return next;
    });
  }

  async function recalculate(next: DetectionResult, preserveManual = true) {
    if (!next.category) {
      applyValues(emptyMeasurements);
      return next;
    }
    const data = await requestJson<{ measurements: Measurements }>(
      "/api/measurements",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: next.imageId,
          category: next.category,
          widthPx: next.widthPx,
          heightPx: next.heightPx,
          points: next.points,
          pixelsPerCm: next.pixelsPerCm,
        }),
      },
    );
    applyValues(data.measurements, preserveManual);
    return { ...next, measurements: data.measurements };
  }

  async function cutout(next: DetectionResult) {
    if (!next.bbox || !next.category) return next;
    const data = await detect("cutout", next);
    return {
      ...next,
      cutoutBase64: data.cutoutBase64,
      cutoutWidthPx: data.cutoutWidthPx,
      cutoutHeightPx: data.cutoutHeightPx,
      warnings: [...new Set([...next.warnings, ...data.warnings])],
    };
  }

  async function analyze() {
    await work(async () => {
      showProgress(0, 25, "写真を確認しています", 5000);
      await loadDefinitions();
      setOverrides({});
      setEditing(null);
      setValues({ ...emptyMeasurements });
      let next = await detect("paper");
      setResult(next);
      showProgress(25, 50, "服を見つけています", 20000);
      const garment = await detect("garment", next, chosenCategory ?? "auto");
      next = {
        ...next,
        category: garment.category ?? chosenCategory,
        bbox: garment.bbox,
        warnings: [...next.warnings, ...garment.warnings],
      };
      setResult(next);
      if (!next.category || !next.bbox) {
        setMode("bbox");
        return;
      }
      showProgress(50, 75, "サイズを測っています", 15000);
      const landmarks = await detect("landmarks", next);
      next = {
        ...next,
        points: landmarks.points,
        modelVersion: landmarks.modelVersion,
        measurements: landmarks.measurements,
        warnings: [...new Set([...next.warnings, ...landmarks.warnings])],
      };
      setResult(next);
      applyValues(next.measurements, false);
      showProgress(75, 100, "仕上げています", 5000);
      next = await cutout(next);
      setResult(next);
      setMode("dimensions");
      showProgress(100, 100, "測定できました");
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
  }

  function geometryChanged(next: DetectionResult) {
    setResult({ ...next, measurements: { ...emptyMeasurements } });
    // 再計算が終わるまで、前の座標から算出した数値を見せない。
    applyValues(emptyMeasurements);
  }

  async function adjust(
    next: DetectionResult,
    adjustedMode: AdjustmentMode,
    preserveManual = true,
  ) {
    await work(async () => {
      let updated: DetectionResult = { ...next, warnings: [] };
      if (adjustedMode === "paper") {
        const paper = await detect("paper", next);
        updated = {
          ...updated,
          pixelsPerCm: paper.pixelsPerCm,
          warnings: paper.warnings,
        };
      }
      if (adjustedMode === "bbox" && next.category) {
        showProgress(0, 50, "サイズを測っています", 15000);
        const data = await detect("landmarks", next);
        updated = {
          ...updated,
          bbox: data.bbox,
          points: data.points,
          modelVersion: data.modelVersion,
          warnings: data.warnings,
        };
      }
      updated = await recalculate(updated, preserveManual);
      setResult(updated);
      if (updated.bbox && updated.category) {
        showProgress(50, 100, "仕上げています", 5000);
        updated = await cutout(updated);
      }
      setResult(updated);
    });
  }

  async function changeCategory(chosen: Category) {
    if (!result) return;
    setBack(null);
    const next = {
      ...result,
      category: chosen,
      points: [],
      cutoutBase64: null,
    };
    setOverrides({});
    setValues({ ...emptyMeasurements });
    setResult(next);
    await adjust(next, "bbox", false);
  }

  async function loadGarments() {
    await loadDefinitions();
    setGarments(
      (await requestJson<{ garments: GarmentView[] }>("/api/garments"))
        .garments,
    );
  }

  async function save() {
    await work(async () => {
      let backFailed = false;
      let textureMessage = "";
      let newlyAdded: AddedGarment | null = null;
      const checked = materialsFromRows(materialInput);
      if ("error" in checked) throw new Error(checked.error);
      if (editing) {
        await requestJson(`/api/garments/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            measurements: values,
            materials: checked.materials,
          }),
        });
        setEditing({ ...editing, measurements: { ...values } });
      } else {
        if (!result?.category || !result.bbox)
          throw new Error("服の種類と範囲を指定してください");
        const ready = result.cutoutBase64 ? result : await cutout(result);
        setResult(ready);
        if (!ready.cutoutBase64)
          throw new Error("切り抜きに失敗しました。服の範囲を調整してください");
        // 色を決められなくても登録は止めず、色の分からない服として保存する
        const colorFamily = await cutoutColorFamily(ready.cutoutBase64).catch(
          () => null,
        );
        const form = new FormData();
        form.set("image", jpegFile(ready.imageBase64));
        form.set("cutoutImage", pngFile(ready.cutoutBase64));
        form.set(
          "metadata",
          JSON.stringify({
            imageId: ready.imageId,
            category: ready.category,
            widthPx: ready.widthPx,
            heightPx: ready.heightPx,
            points: ready.points,
            pixelsPerCm: ready.pixelsPerCm,
            paperCorners:
              ready.paperCorners.length === 4 ? ready.paperCorners : [],
            modelVersion: ready.modelVersion,
            measurementVersion: ready.measurementVersion,
            name,
            measurements: values,
            materials: checked.materials,
            colorFamily,
          }),
        );
        const saved = await requestJson<{ id: string }>("/api/garments", {
          method: "POST",
          body: form,
        });
        setEditing({
          id: saved.id,
          category: result.category,
          measurements: values,
        });
        newlyAdded = { id: saved.id, category: result.category, colorFamily };
        if (back) {
          try {
            const backSaved = await uploadBackPhoto(saved.id, back);
            textureMessage = textureRequestMessage(backSaved.texture);
          } catch {
            backFailed = true;
          }
          // 登録後は裏面の欄を出さないので、送れなかった裏面も持ち続けない
          setBack(null);
        }
      }
      setMessage(
        (editing
          ? "名前・寸法・素材を更新しました"
          : Object.values(values).some((value) => value !== null)
            ? "服と寸法をクローゼットに登録しました"
            : "服を登録しました。寸法はあとから入力できます。") +
          (backFailed
            ? "裏面は保存できなかったため、服の詳細から撮り直してください。"
            : textureMessage),
      );
      await loadGarments();
      if (newlyAdded) {
        const shown = newlyAdded;
        // 中身を描き終えてから開く。先に開くと、見出しが無いまま読み上げられ、フォーカスも中の操作に入らない
        flushSync(() => {
          setAdded(shown);
        });
        similarSheet.current?.showModal();
      }
    });
  }

  return (
    <main className="mx-auto w-full px-4 py-5 text-main" aria-busy={busy}>
      {progress && <MeasurementProgress progress={progress} />}
      {error && (
        <p
          role="alert"
          className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-4 text-sm">
          {message}
        </p>
      )}
      {editLoad === "loading" && (
        <p role="status" className="mb-4 text-sm text-description">
          編集する服を読み込んでいます…
        </p>
      )}
      {editLoad === "failed" && (
        <button
          className={`${secondary} mb-4 w-full`}
          onClick={() => {
            setError("");
            setEditLoad("loading");
            setEditAttempt((previous) => previous + 1);
          }}
        >
          編集する服を読み込み直す
        </button>
      )}
      <fieldset disabled={locked} className="min-w-0 space-y-4">
        <fieldset disabled={editing !== null} className="min-w-0">
          <legend className="mb-2 text-sm font-semibold">服の種類</legend>
          <div className="grid grid-cols-4 gap-2">
            {categoryChoices.map((choice) => (
              <label key={choice} className="cursor-pointer">
                <input
                  type="radio"
                  name="category"
                  value={choice}
                  checked={chosenCategory === choice}
                  onChange={() => {
                    setChosenCategory(choice);
                    if (result) void changeCategory(choice);
                  }}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 items-center justify-center rounded border border-main bg-white px-1 text-sm font-semibold transition peer-checked:bg-main peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-main peer-disabled:opacity-40">
                  {categoryLabels[choice]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {!chosenCategory && (
          <p className="text-xs text-description">
            服の種類を選んでから寸法を測定します。アバターでは、選んだ種類の3Dモデルで着せます。
          </p>
        )}
        <label
          className={`${secondary} flex cursor-pointer items-center justify-center`}
        >
          写真を選ぶ・撮影
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file)
                void work(async () => {
                  const prepared = await preparePhoto(file);
                  setPhoto(prepared);
                  setBack(null);
                  setResult(null);
                  setEditing(null);
                  setValues({ ...emptyMeasurements });
                  setOverrides({});
                  setName("");
                  setMaterialInput(defaultMaterialRows);
                  setMode("dimensions");
                });
            }}
          />
        </label>
        {photo && !result && (
          <svg
            viewBox={`0 0 ${String(photo.widthPx)} ${String(photo.heightPx)}`}
            className="w-full rounded bg-surface"
            role="img"
            aria-label="選択した写真"
          >
            <image
              href={`data:image/jpeg;base64,${photo.imageBase64}`}
              width={photo.widthPx}
              height={photo.heightPx}
            />
          </svg>
        )}
        {photo && !editing && (
          <button
            className={`${button} w-full`}
            disabled={!chosenCategory}
            onClick={() => {
              void analyze();
            }}
          >
            {result ? "最初から測定" : "寸法を測定"}
          </button>
        )}
        {result && !editing && (
          <>
            <p className="text-sm text-description">
              {mode === "dimensions" ? "測定結果" : "ドラッグで調整"}
            </p>
            <div className="flex gap-2" role="group" aria-label="調整対象">
              {(
                [
                  ["dimensions", "寸法"],
                  ["paper", "A4"],
                  ["bbox", "服の範囲"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={mode === value ? button : secondary}
                  aria-pressed={mode === value}
                  onClick={() => {
                    setMode(value);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <MeasurementImage
              key={`${result.imageId}-${mode}`}
              result={result}
              mode={mode}
              definitions={fields}
              disabled={busy}
              onChange={geometryChanged}
              onCommit={(next, target) => {
                void adjust(next, target);
              }}
            />
            {mode === "paper" && (
              <button
                className={secondary}
                onClick={() => {
                  geometryChanged({
                    ...result,
                    paperCorners: [],
                    pixelsPerCm: null,
                    cutoutBase64: null,
                  });
                }}
              >
                四隅を指定し直す
              </button>
            )}
            {mode === "paper" && result.paperCorners.length < 4 && (
              <p className="text-xs text-description">
                外周順に4点をタップ（{result.paperCorners.length}/4）
              </p>
            )}
            {mode === "bbox" && !result.bbox && (
              <p className="text-xs text-description">
                服を囲む対角の2点をタップ
              </p>
            )}
            {result.warnings.map((warning, index) => (
              <p key={index} role="status" className="text-xs text-amber-800">
                {warning}
              </p>
            ))}
            {result.cutoutBase64 && (
              <div className="rounded bg-surface p-4">
                <svg
                  viewBox={`0 0 ${String(result.cutoutWidthPx)} ${String(result.cutoutHeightPx)}`}
                  className="mx-auto h-48 w-full"
                  role="img"
                  aria-label="登録する切り抜き画像"
                >
                  <image
                    href={`data:image/png;base64,${result.cutoutBase64}`}
                    width={result.cutoutWidthPx ?? 1}
                    height={result.cutoutHeightPx ?? 1}
                  />
                </svg>
              </div>
            )}
            <section className="space-y-3 rounded border border-line p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  裏面
                  <span className="ml-1 text-xs font-normal text-description">
                    任意
                  </span>
                </h2>
                {back && (
                  <button
                    className="min-h-8 text-xs text-description underline"
                    onClick={() => {
                      setBack(null);
                    }}
                  >
                    外す
                  </button>
                )}
              </div>
              {back ? (
                <div className="rounded bg-surface p-4">
                  <svg
                    viewBox={`0 0 ${String(back.previewWidthPx)} ${String(back.previewHeightPx)}`}
                    className="mx-auto h-48 w-full"
                    role="img"
                    aria-label="登録する裏面の画像"
                  >
                    <image
                      href={back.previewUrl}
                      width={back.previewWidthPx}
                      height={back.previewHeightPx}
                    />
                  </svg>
                </div>
              ) : (
                <p className="text-xs leading-[1.7] text-description">
                  表と裏を登録すると、テクスチャを生成してPC内に保存します。
                  {result.category === "trousers"
                    ? "ズボンは脚を重ねずに平置きし、ウエストから裾まで写してください。"
                    : result.category === "long_sleeve_top" ||
                        result.category === "shirt"
                      ? "袖と身頃が重ならないように広げ、両方の袖口と裾まで写してください。"
                      : "表と同じように平置きして撮ってください。"}
                </p>
              )}
              <label
                className={`${secondary} flex cursor-pointer items-center justify-center ${result.category ? "" : "pointer-events-none opacity-40"}`}
              >
                {back ? "裏面を撮り直す" : "裏面を撮影"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  disabled={!result.category}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    const chosen = result.category;
                    event.target.value = "";
                    if (file && chosen)
                      void work(async () => {
                        const prepared = await prepareBackPhoto(
                          file,
                          chosen,
                          showProgress,
                        );
                        setBack(prepared);
                        if (!prepared.cutoutImage)
                          setMessage(
                            "裏面の服を切り抜けなかったため、写真のまま登録します",
                          );
                      });
                  }}
                />
              </label>
            </section>
          </>
        )}
        {(result || editing) && (
          <section className="space-y-4 rounded border border-line p-4">
            <label className="block text-sm">
              服の名前
              <input
                className={`${field} mt-1 w-full`}
                maxLength={100}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </label>
            <MaterialsEditor rows={materialInput} onChange={setMaterialInput} />
            <div className="grid grid-cols-2 gap-4">
              {fields.map((definition) => (
                <label className="block text-sm" key={definition.key}>
                  <span>{definition.label}（cm）</span>
                  <input
                    className={`${field} mt-1 w-full`}
                    type="number"
                    min="0.1"
                    max="1000"
                    step="0.1"
                    value={values[definition.key] ?? ""}
                    onChange={(event) => {
                      const value =
                        event.target.value === ""
                          ? null
                          : Number(event.target.value);
                      setValues((previous) => ({
                        ...previous,
                        [definition.key]: value,
                      }));
                      setOverrides((previous) => ({
                        ...previous,
                        [definition.key]: true,
                      }));
                    }}
                  />
                  {overrides[definition.key] && (
                    <span className="text-xs text-description">
                      手入力{" "}
                      <button
                        className="min-h-8 underline"
                        onClick={() => {
                          setOverrides((previous) => ({
                            ...previous,
                            [definition.key]: false,
                          }));
                          setValues((previous) => ({
                            ...previous,
                            [definition.key]:
                              (editing?.measurements ?? result?.measurements)?.[
                                definition.key
                              ] ?? null,
                          }));
                        }}
                      >
                        推定値に戻す
                      </button>
                    </span>
                  )}
                </label>
              ))}
            </div>
            <button
              className={`${button} w-full`}
              disabled={
                !category || !definitions || (!editing && !result?.bbox)
              }
              onClick={() => {
                void save();
              }}
            >
              {editing ? "名前・寸法・素材を更新" : "クローゼットに登録"}
            </button>
            {editing && (
              <div className="flex flex-wrap justify-center gap-x-4">
                <Link
                  href={`/garments/${encodeURIComponent(editing.id)}`}
                  className="flex min-h-11 items-center text-xs text-description underline"
                >
                  服の詳細で裏面・購入時期・時期を設定する
                </Link>
                <Link
                  href="/closet"
                  className="flex min-h-11 items-center text-xs text-description underline"
                >
                  クローゼットに戻る
                </Link>
              </div>
            )}
          </section>
        )}
      </fieldset>
      <section id="saved-garments" className="mt-10 scroll-mt-16">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">クローゼット</h2>
          <button
            className={secondary}
            disabled={locked}
            onClick={() => {
              void work(loadGarments);
            }}
          >
            一覧を読み込む
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {garments.map((garment) => (
            <article
              key={garment.id}
              className="rounded border border-line p-3"
            >
              <svg
                viewBox="0 0 300 240"
                className="w-full rounded bg-surface"
                role="img"
                aria-label={garment.name || "登録した服"}
              >
                <image
                  href={garmentPhotoUrl(garment)}
                  width="300"
                  height="240"
                  preserveAspectRatio="xMidYMid meet"
                />
              </svg>
              <h3 className="mt-3 text-sm font-medium wrap-anywhere">
                {garment.name || categoryLabels[garment.category]}
              </h3>
              <GarmentMeasurements
                category={garment.category}
                measurements={garment.measurements}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={secondary}
                  disabled={locked}
                  onClick={() => {
                    startEditing(garment);
                  }}
                >
                  寸法を編集
                </button>
                <button
                  className={secondary}
                  disabled={locked}
                  onClick={() => {
                    if (window.confirm("この服と画像を削除しますか？"))
                      void work(async () => {
                        const response = await fetch(
                          `/api/garments/${garment.id}`,
                          { method: "DELETE" },
                        );
                        if (!response.ok)
                          throw new Error("削除できませんでした");
                        if (editing?.id === garment.id) setEditing(null);
                        await loadGarments();
                      });
                  }}
                >
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <SimilarGarmentsSheet
        ref={similarSheet}
        added={added}
        garments={garments}
        onColorChange={(colorFamily) => {
          setAdded((current) => current && { ...current, colorFamily });
        }}
      />
    </main>
  );
}
