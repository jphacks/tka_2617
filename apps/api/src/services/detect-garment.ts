import { requestInference } from "#src/lib/inference-client";
import { readJpeg } from "#src/lib/jpeg";
import {
  inferenceResultSchema,
  measurementInputSchema,
  measurementsSchema,
  measurementVersion,
} from "#src/lib/measurement-schema";
import { calculateMeasurements } from "#src/lib/measurements";
import type {
  DetectionOptions,
  DetectionResult,
} from "#src/lib/measurement-schema";

export async function detectGarment(
  image: File,
  options: DetectionOptions,
): Promise<DetectionResult> {
  await readJpeg(image);
  const shirt = options.category === "shirt";
  const form = new FormData();
  form.set("image", image);
  form.set(
    "options",
    JSON.stringify(
      shirt ? { ...options, category: "long_sleeve_top" } : options,
    ),
  );
  const detected = inferenceResultSchema.parse(
    await requestInference("/detect", form),
  );
  const result =
    shirt && detected.category === "long_sleeve_top"
      ? { ...detected, category: "shirt" as const }
      : detected;
  const measurements = result.category
    ? calculateMeasurements(measurementInputSchema.parse(result))
    : measurementsSchema.parse({});
  return { ...result, measurements, measurementVersion };
}
