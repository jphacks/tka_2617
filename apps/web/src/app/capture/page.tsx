import type { Metadata } from "next";
import { MeasurementStudio } from "@/components/measurement-studio";
import { editingGarmentId } from "@/lib/garment-edit";

export const metadata: Metadata = {
  title: "撮影 | Pitari",
};

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const editId = editingGarmentId((await searchParams).edit);
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">
            {editId ? "名前・寸法・素材の編集" : "撮影"}
          </h1>
        </div>
      </header>

      <MeasurementStudio key={editId} editId={editId} />
    </>
  );
}
