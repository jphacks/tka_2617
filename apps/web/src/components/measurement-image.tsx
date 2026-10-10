"use client";

import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { DetectionResult, MeasurementDefinition } from "@pitari/api";
import { MeasurementArrows } from "@/components/measurement-arrows";

export type AdjustmentMode = "paper" | "bbox";
type Point = [number, number];
type Handle = { mode: AdjustmentMode; index: number };

export function MeasurementImage({
  result,
  mode,
  definitions,
  disabled,
  onChange,
  onCommit,
}: {
  result: DetectionResult;
  mode: AdjustmentMode | "dimensions";
  definitions: MeasurementDefinition[];
  disabled: boolean;
  onChange: (next: DetectionResult) => void;
  onCommit: (next: DetectionResult, mode: AdjustmentMode) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    handle: Handle;
    next: DetectionResult;
    pointerId: number;
  } | null>(null);
  const [boxStart, setBoxStart] = useState<Point | null>(null);
  const radius = result.widthPx / 65;

  function position(event: PointerEvent): Point {
    const matrix = svg.current?.getScreenCTM();
    const point = matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
          matrix.inverse(),
        )
      : new DOMPoint();
    return [
      Math.max(0, Math.min(result.widthPx - 1, point.x)),
      Math.max(0, Math.min(result.heightPx - 1, point.y)),
    ];
  }

  function move(
    next: DetectionResult,
    handle: Handle,
    [x, y]: Point,
  ): DetectionResult {
    if (handle.mode === "paper")
      return {
        ...next,
        cutoutBase64: null,
        pixelsPerCm: null,
        paperCorners: next.paperCorners.map((point, index) =>
          index === handle.index ? [x, y] : point,
        ),
      };
    if (!next.bbox) return next;
    const [left, top, right, bottom] = next.bbox;
    const bbox: [number, number, number, number] = [
      handle.index === 0 || handle.index === 3 ? Math.min(x, right - 1) : left,
      handle.index < 2 ? Math.min(y, bottom - 1) : top,
      handle.index === 1 || handle.index === 2 ? Math.max(x, left + 1) : right,
      handle.index > 1 ? Math.max(y, top + 1) : bottom,
    ];
    return { ...next, bbox, points: [], cutoutBase64: null };
  }

  function handle(
    point: Point,
    descriptor: Handle,
    label: string,
    color: string,
  ) {
    const active = mode === descriptor.mode && !disabled;
    return (
      <g key={`${descriptor.mode}-${String(descriptor.index)}`}>
        <circle
          cx={point[0]}
          cy={point[1]}
          r={radius}
          fill={color}
          stroke="white"
          strokeWidth={radius / 4}
          opacity={active ? 1 : 0.55}
        />
        <text
          x={point[0] + radius}
          y={point[1] - radius}
          fontSize={radius * 1.6}
          fill={color}
          stroke="white"
          strokeWidth={radius / 7}
          paintOrder="stroke"
          pointerEvents="none"
        >
          {label}
        </text>
        <circle
          aria-label={label}
          cx={point[0]}
          cy={point[1]}
          r={radius * 2.2}
          fill="transparent"
          className={
            active
              ? "cursor-grab active:cursor-grabbing"
              : "pointer-events-none"
          }
          onPointerDown={(event) => {
            if (!active) return;
            event.stopPropagation();
            event.preventDefault();
            svg.current?.setPointerCapture(event.pointerId);
            drag.current = {
              handle: descriptor,
              next: result,
              pointerId: event.pointerId,
            };
          }}
        />
      </g>
    );
  }

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${String(result.widthPx)} ${String(result.heightPx)}`}
      role="img"
      aria-label="服の寸法。矢印が測定区間を示します"
      className={`w-full rounded bg-surface ${mode === "dimensions" ? "touch-pan-y" : "touch-none"}`}
      style={{
        aspectRatio: `${String(result.widthPx)}/${String(result.heightPx)}`,
      }}
      onPointerDown={(event) => {
        if (disabled || drag.current) return;
        const point = position(event);
        if (mode === "paper" && result.paperCorners.length < 4) {
          const next = {
            ...result,
            cutoutBase64: null,
            pixelsPerCm: null,
            paperCorners: [...result.paperCorners, point],
          };
          onChange(next);
          if (next.paperCorners.length === 4) onCommit(next, mode);
        } else if (mode === "bbox" && !result.bbox) {
          if (!boxStart) setBoxStart(point);
          else {
            const first = boxStart;
            const bbox: [number, number, number, number] = [
              Math.min(first[0], point[0]),
              Math.min(first[1], point[1]),
              Math.max(first[0], point[0]),
              Math.max(first[1], point[1]),
            ];
            setBoxStart(null);
            if (bbox[2] - bbox[0] < 2 || bbox[3] - bbox[1] < 2) return;
            const next = { ...result, bbox, points: [], cutoutBase64: null };
            onChange(next);
            onCommit(next, mode);
          }
        }
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.next = move(current.next, current.handle, position(event));
        onChange(current.next);
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        drag.current = null;
        svg.current?.releasePointerCapture(event.pointerId);
        onCommit(current.next, current.handle.mode);
      }}
      onPointerCancel={() => {
        const current = drag.current;
        drag.current = null;
        if (current) onCommit(current.next, current.handle.mode);
      }}
    >
      <image
        href={`data:image/jpeg;base64,${result.imageBase64}`}
        width={result.widthPx}
        height={result.heightPx}
      />
      {boxStart && (
        <circle
          cx={boxStart[0]}
          cy={boxStart[1]}
          r={radius}
          fill="#d97706"
          pointerEvents="none"
        />
      )}
      {mode === "paper" && (
        <polygon
          points={result.paperCorners.map((point) => point.join(",")).join(" ")}
          fill="none"
          stroke="#0f766e"
          strokeWidth={radius / 3}
          pointerEvents="none"
        />
      )}
      {mode === "bbox" && result.bbox && (
        <rect
          x={result.bbox[0]}
          y={result.bbox[1]}
          width={result.bbox[2] - result.bbox[0]}
          height={result.bbox[3] - result.bbox[1]}
          fill="none"
          stroke="#d97706"
          strokeWidth={radius / 3}
          pointerEvents="none"
        />
      )}
      <MeasurementArrows result={result} definitions={definitions} />
      {mode === "paper" &&
        result.paperCorners.map((point, index) =>
          handle(
            point,
            { mode: "paper", index },
            `A4-${String(index + 1)}`,
            "#0f766e",
          ),
        )}
      {mode === "bbox" &&
        result.bbox &&
        (
          [
            [result.bbox[0], result.bbox[1]],
            [result.bbox[2], result.bbox[1]],
            [result.bbox[2], result.bbox[3]],
            [result.bbox[0], result.bbox[3]],
          ] as Point[]
        ).map((point, index) =>
          handle(point, { mode: "bbox", index }, "", "#d97706"),
        )}
    </svg>
  );
}
