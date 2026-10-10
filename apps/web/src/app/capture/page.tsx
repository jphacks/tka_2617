import type { Metadata } from "next";
import { MeasurementStudio } from "@/components/measurement-studio";

export const metadata: Metadata = {
  title: "撮影 | Pitari",
};

export default function CapturePage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">撮影</h1>
        </div>
      </header>

      <MeasurementStudio />
    </>
  );
}
