import type { GarmentView } from "@pitari/api";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { AvatarErrorBoundary } from "@/components/avatar-error-boundary";
import { AvatarFrame } from "@/components/avatar-frame";
import { AvatarPlaceholder } from "@/components/avatar-placeholder";
import { useGarmentTexture } from "@/components/try-on/use-garment-texture";
import { useTryOn } from "@/components/try-on/use-try-on";
import {
  avatarSettingsStore,
  type AvatarSettings,
} from "@/lib/avatar-settings";
import { wornTop, wornTrousers } from "@/lib/worn-garment";

// three.jsはブラウザでだけ動かす。読み込み中も同じ大きさの枠を出す
const TryOnScene = dynamic(() => import("@/components/try-on/try-on-scene"), {
  ssr: false,
  loading: () => <AvatarFrame loading />,
});

/**
 * 登録した服を着せたアバター。nullの側は見本の服を着せる。
 * アバターをまだ登録していなければ、仮の絵と登録への案内を出す
 */
export function OutfitAvatar({
  top,
  bottom,
}: {
  top: GarmentView | null;
  bottom: GarmentView | null;
}) {
  // サーバーで描くときはlocalStorageが無いので、読み込み中として描く
  const settings = useSyncExternalStore(
    avatarSettingsStore.subscribe,
    avatarSettingsStore.get,
    () => undefined,
  );
  if (settings === undefined) return <AvatarFrame loading />;
  if (settings === null)
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-surface pt-4 pb-3">
        <div className="h-50">
          <AvatarPlaceholder />
        </div>
        <Link href="/avatar" className="text-[13px] text-main underline">
          アバターを登録すると、服を着せて見せます
        </Link>
      </div>
    );
  return <DressedAvatar settings={settings} top={top} bottom={bottom} />;
}

function DressedAvatar({
  settings,
  top,
  bottom,
}: {
  settings: AvatarSettings;
  top: GarmentView | null;
  bottom: GarmentView | null;
}) {
  // 着せる服は着せられる服から選ぶが、型の上では着せられない場合も残るので、そのときは見本の服にする
  const wornTopResult = top && wornTop(top);
  const wornBottomResult = bottom && wornTrousers(bottom);
  const tryOn = useTryOn(settings, {
    top: wornTopResult && "worn" in wornTopResult ? wornTopResult.worn : null,
    bottom:
      wornBottomResult && "worn" in wornBottomResult
        ? wornBottomResult.worn
        : null,
  });
  const shirtTextureUrl = useGarmentTexture(top?.id ?? null);
  const trouserTextureUrl = useGarmentTexture(bottom?.id ?? null);
  // 着ていない側は見本の服を着せる。男性の体には下着が無く、何も着せないと裸になるため。
  // 見本の服は利用者の服ではないので、「タイト」「小さすぎる」には出さない（ズボン以外は上の服の名前）
  const worn = (name: string) => (name === "ズボン" ? bottom : top) !== null;
  const tooSmall = tryOn.tooSmall.filter(worn);
  const tight = tryOn.tight.filter(worn);

  return (
    <div className="relative">
      <AvatarErrorBoundary>
        <div className="aspect-3/4 w-full touch-none overflow-hidden rounded-xl bg-surface">
          <TryOnScene
            {...tryOn.sceneProps}
            shirtTextureUrl={shirtTextureUrl}
            trouserTextureUrl={trouserTextureUrl}
          />
        </div>
      </AvatarErrorBoundary>
      {tooSmall.length > 0 && (
        <p className="absolute inset-x-4 top-4 rounded bg-white/90 px-3 py-2 text-center text-[13px] font-semibold">
          {tooSmall.join("と")}が小さすぎて着られません
        </p>
      )}
      {tight.length > 0 && (
        <span className="absolute top-3 left-3 rounded border border-main bg-white/90 px-2 py-0.5 text-[11px] font-semibold">
          {tight.join("・")}がタイト
        </span>
      )}
    </div>
  );
}
