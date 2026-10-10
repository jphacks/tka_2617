"use client";

import { useState } from "react";
import type {
  Category,
  DetectionOptions,
  DetectionResult,
  Measurements,
  MeasurementKey,
  MeasurementDefinition,
  GarmentView,
} from "@pitari/api";
import { preparePhoto, jpegFile } from "@/lib/photo";
import { requestJson } from "@/lib/request";
import { garmentPhotoUrl } from "@/lib/garment-photo";
import { MeasurementImage } from "@/components/measurement-image";
import type { AdjustmentMode } from "@/components/measurement-image";

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
const button =
  "min-h-11 rounded bg-main px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:opacity-85";
const secondary =
  "min-h-11 rounded border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100 disabled:opacity-40";
const field = "rounded border border-stone-300 bg-white p-2 text-main";

export function MeasurementStudio() {
  const [definitions, setDefinitions] = useState<DefinitionResponse | null>(
    null,
  );
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [mode, setMode] = useState<AdjustmentMode | "dimensions">("dimensions");
  const [values, setValues] = useState<Measurements>({ ...emptyMeasurements });
  const [overrides, setOverrides] = useState<
    Partial<Record<MeasurementKey, boolean>>
  >({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    percent: number;
    label: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [garments, setGarments] = useState<GarmentView[]>([]);
  const [editing, setEditing] = useState<Pick<
    GarmentView,
    "id" | "category" | "measurements"
  > | null>(null);
  const category = editing?.category ?? result?.category;
  const fields =
    category && definitions ? definitions.definitions[category] : [];

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
      setProgress({ percent: 0, label: "A4を認識中" });
      await loadDefinitions();
      setOverrides({});
      setEditing(null);
      setValues({ ...emptyMeasurements });
      let next = await detect("paper");
      setResult(next);
      setProgress({ percent: 25, label: "服を認識中" });
      const garment = await detect("garment", next);
      next = {
        ...next,
        category: garment.category,
        bbox: garment.bbox,
        warnings: [...next.warnings, ...garment.warnings],
      };
      setResult(next);
      if (!next.category || !next.bbox) {
        setMode("bbox");
        return;
      }
      setProgress({ percent: 50, label: "寸法を測定中" });
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
      setProgress({ percent: 75, label: "背景を切り抜き中" });
      next = await cutout(next);
      setResult(next);
      setMode("dimensions");
      setProgress({ percent: 100, label: "完了" });
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
        setProgress({ percent: 0, label: "寸法を更新中" });
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
        setProgress({ percent: 50, label: "切り抜きを更新中" });
        updated = await cutout(updated);
      }
      setResult(updated);
    });
  }

  async function changeCategory(chosen: Category) {
    if (!result) return;
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
      if (editing) {
        await requestJson(`/api/garments/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, measurements: values }),
        });
      } else {
        if (!result?.category || !result.bbox)
          throw new Error("服の種類と範囲を指定してください");
        const ready = result.cutoutBase64 ? result : await cutout(result);
        setResult(ready);
        if (!ready.cutoutBase64)
          throw new Error("切り抜きに失敗しました。服の範囲を調整してください");
        const form = new FormData();
        form.set("image", jpegFile(ready.imageBase64));
        const bytes = Uint8Array.from(atob(ready.cutoutBase64), (character) =>
          character.charCodeAt(0),
        );
        form.set(
          "cutoutImage",
          new File([bytes], "garment.png", { type: "image/png" }),
        );
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
      }
      setMessage("保存しました");
      await loadGarments();
    });
  }

  return (
    <main className="mx-auto w-full px-4 py-5 text-main" aria-busy={busy}>
      {progress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="寸法を測定中"
        >
          <div
            className="min-w-56 rounded-2xl bg-white px-8 py-7 text-center shadow-xl"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label={progress.label}
          >
            <div
              className="flex h-12 items-center justify-center gap-3"
              aria-hidden="true"
            >
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="size-3 rounded-full bg-main motion-safe:animate-bounce"
                  style={{
                    animationDelay: `${String(index * 160)}ms`,
                    animationDuration: "900ms",
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {progress.percent}%
            </p>
            <p className="mt-2 text-sm text-description" aria-live="polite">
              {progress.label}
            </p>
          </div>
        </div>
      )}
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
      <fieldset disabled={busy} className="min-w-0 space-y-4">
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
                  setResult(null);
                  setEditing(null);
                  setValues({ ...emptyMeasurements });
                  setOverrides({});
                  setName("");
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
            onClick={() => {
              void analyze();
            }}
          >
            {result ? "最初から測定" : "寸法を測定"}
          </button>
        )}
        {result && !editing && (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-description">
                {mode === "dimensions" ? "測定結果" : "ドラッグで調整"}
              </p>
              <select
                aria-label="服の種類"
                className={field}
                value={result.category ?? ""}
                onChange={(event) => {
                  void changeCategory(event.target.value as Category);
                }}
              >
                <option value="" disabled>
                  種類を選択
                </option>
                <option value="short_sleeve_top">Tシャツ</option>
                <option value="trousers">パンツ</option>
              </select>
            </div>
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
              {editing ? "名前・寸法を更新" : "クローゼットに登録"}
            </button>
          </section>
        )}
      </fieldset>
      <section id="saved-garments" className="mt-10 scroll-mt-16">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">クローゼット</h2>
          <button
            className={secondary}
            disabled={busy}
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
                {garment.name ||
                  (garment.category === "trousers" ? "パンツ" : "Tシャツ")}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={secondary}
                  disabled={busy}
                  onClick={() => {
                    setEditing(garment);
                    setResult(null);
                    setPhoto(null);
                    setName(garment.name);
                    setValues(garment.measurements);
                    setOverrides({});
                    setError("");
                    setMessage("");
                  }}
                >
                  寸法を編集
                </button>
                <button
                  className={secondary}
                  disabled={busy}
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
    </main>
  );
}
