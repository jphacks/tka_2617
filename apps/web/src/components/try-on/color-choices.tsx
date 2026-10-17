"use client";

/** 色の候補を丸いボタンで並べ、1つを選ぶ */
export function ColorChoices({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0">{label}</span>
      <div className="flex gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={value === c}
            onClick={() => {
              onChange(c);
            }}
            style={{ backgroundColor: c }}
            className="size-7 rounded-full border border-line aria-pressed:ring-2 aria-pressed:ring-main aria-pressed:ring-offset-2"
          />
        ))}
      </div>
    </div>
  );
}
