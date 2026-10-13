export type MeasurementProgressState = {
  percent: number;
  nextPercent: number;
  estimatedMs: number;
  startedAt: number;
  label: string;
};

export function estimateMeasurementProgress(
  progress: MeasurementProgressState,
  now: number,
) {
  if (progress.percent === 100) return 100;
  const elapsed = Math.max(0, now - progress.startedAt);
  // サーバーから途中経過は届かないため目安で補間し、次の工程の完了には進めない。
  const fraction = 1 - Math.exp(-elapsed / progress.estimatedMs);
  return Math.min(
    progress.nextPercent - 1,
    progress.percent +
      Math.floor((progress.nextPercent - progress.percent) * fraction),
  );
}
