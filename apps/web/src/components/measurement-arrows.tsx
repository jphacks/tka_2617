"use client";

import { useId } from "react";
import type { DetectionResult, MeasurementDefinition } from "@pitari/api";

export function MeasurementArrows({
  result,
  definitions,
}: {
  result: DetectionResult;
  definitions: MeasurementDefinition[];
}) {
  const arrowId = useId();
  const fontSize = Math.min(result.widthPx / 30, result.heightPx / 14);
  const strokeWidth = fontSize / 6;
  const labels: { x: number; y: number; width: number; height: number }[] = [];
  const dimensions = definitions.flatMap((definition) => {
    const start = result.points.find((point) => point.id === definition.start);
    const ends = (
      typeof definition.end === "number" ? [definition.end] : definition.end
    ).map((id) => result.points.find((point) => point.id === id));
    if (!start || ends.some((point) => !point)) return [];
    const end = {
      x: ends.reduce((sum, point) => sum + (point?.x ?? 0), 0) / ends.length,
      y: ends.reduce((sum, point) => sum + (point?.y ?? 0), 0) / ends.length,
    };
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length < 1) return [];
    const label = definition.label.split("（")[0];
    const width = fontSize * (label.length + 0.9);
    const height = fontSize * 1.5;
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const normal = {
      x: -(end.y - start.y) / length,
      y: (end.x - start.x) / length,
    };
    let box = { x: 0, y: 0, width, height };
    // 近い区間の名称を重ねず、画像の端でも読める位置に置く。
    for (const offset of [-1.1, 1.1, -2.8, 2.8, -4.5, 4.5]) {
      box = {
        x: Math.max(
          0,
          Math.min(
            result.widthPx - width,
            midpoint.x + normal.x * fontSize * offset - width / 2,
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            result.heightPx - height,
            midpoint.y + normal.y * fontSize * offset - height / 2,
          ),
        ),
        width,
        height,
      };
      if (
        !labels.some(
          (other) =>
            box.x < other.x + other.width &&
            box.x + width > other.x &&
            box.y < other.y + other.height &&
            box.y + height > other.y,
        )
      )
        break;
    }
    labels.push(box);
    return [{ key: definition.key, start, end, label, box }];
  });

  return (
    <g pointerEvents="none">
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 6 6"
          refX="6"
          refY="3"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 6 3 L 0 6 Z" fill="#2563eb" />
        </marker>
      </defs>
      {dimensions.map(({ key, start, end, label }) => (
        <g key={key} aria-label={`${label}の測定区間`}>
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="white"
            strokeWidth={strokeWidth * 2.5}
          />
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="#2563eb"
            strokeWidth={strokeWidth}
            markerStart={`url(#${arrowId})`}
            markerEnd={`url(#${arrowId})`}
          />
        </g>
      ))}
      {dimensions.map(({ key, label, box }) => (
        <g key={key}>
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx={fontSize / 3}
            fill="white"
            fillOpacity="0.94"
            stroke="#2563eb"
            strokeWidth={strokeWidth / 2}
          />
          <text
            x={box.x + box.width / 2}
            y={box.y + box.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#1d4ed8"
            fontSize={fontSize}
            fontWeight="600"
          >
            {label}
          </text>
        </g>
      ))}
    </g>
  );
}
