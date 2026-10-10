import type { ReactNode } from "react";

type IconProps = {
  className?: string;
  strokeWidth: number;
};

// パスはデザイン（docs/design_handoff_app_shell/の案3a）から写した
function LineIcon({
  className,
  strokeWidth,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function HangerIcon(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 7.6a2 2 0 1 1 2-2" />
      <path d="M12 7.6v1.1L3.7 14.9a1.6 1.6 0 0 0 .9 2.9h14.8a1.6 1.6 0 0 0 .9-2.9L12 8.7" />
    </LineIcon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M4.5 8.6c0-1.1.9-2 2-2h1.8l1.5-2.1h4.4l1.5 2.1h1.8c1.1 0 2 .9 2 2v8.4c0 1.1-.9 2-2 2h-11c-1.1 0-2-.9-2-2z" />
      <circle cx="12" cy="12.7" r="3.1" />
    </LineIcon>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.5 19.5c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
    </LineIcon>
  );
}
