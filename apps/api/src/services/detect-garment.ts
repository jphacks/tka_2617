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
  const form = new FormData();
  form.set("image", image);
  form.set("options", JSON.stringify(options));
  const result = inferenceResultSchema.parse(
    await requestInference("/detect", form),
  );
  const measurements = result.category
    ? calculateMeasurements(measurementInputSchema.parse(result))
    : measurementsSchema.parse({});
  return { ...result, measurements, measurementVersion };
}
