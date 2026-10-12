import type { Metadata } from "next";
import TryOnClient from "@/app/dev/tryon/tryon-client";

export const metadata: Metadata = { title: "試着確認 | Pitari" };

export default function Page() {
  return <TryOnClient />;
}
