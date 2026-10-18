// 今日の画面の仮のアバター。コーデを提案できないときと、アバターを登録する前に、three.jsを読まずに人の形だけ出す。
// 形は初回体験のモック（#108）のアバター部品から写した
export function AvatarPlaceholder() {
  const part = { fill: "#e4e1db", stroke: "#b7b2a8", strokeWidth: 1 };
  return (
    <svg
      viewBox="40 0 120 360"
      role="img"
      aria-label="アバター（仮の絵）"
      className="h-full"
    >
      <ellipse cx="100" cy="346" rx="50" ry="8" fill="#ece9e3" />
      <rect x="77" y="188" width="22" height="146" rx="4" {...part} />
      <rect x="101" y="188" width="22" height="146" rx="4" {...part} />
      <rect x="74" y="330" width="25" height="12" rx="4" {...part} />
      <rect x="101" y="330" width="25" height="12" rx="4" {...part} />
      <rect x="62" y="78" width="12" height="124" rx="5" {...part} />
      <rect x="126" y="78" width="12" height="124" rx="5" {...part} />
      <path d="M71 76 Q100 68 129 76 L123 194 L77 194 Z" {...part} />
      <rect x="93" y="58" width="14" height="14" fill={part.fill} />
      <circle cx="100" cy="38" r="22" {...part} />
    </svg>
  );
}
