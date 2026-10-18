import type { NextRequest } from "next/server";
import {
  meanOf,
  pickDayTemperatures,
  placeFromQuery,
  seasonOf,
  type TodayWeather,
} from "@/lib/weather";
import { fetchTodayHourlyTemperatures } from "@/server/weather";

// 天気はapiを通さず、webのサーバーからOpen-Meteoを呼ぶ（DBに触れないため）。
// 緯度・経度は丸めてから使い、保存しない
export async function GET(request: NextRequest) {
  const { latitude, longitude, place } = placeFromQuery(
    request.nextUrl.searchParams,
  );
  const hourly = await fetchTodayHourlyTemperatures(latitude, longitude);
  const body: TodayWeather = hourly
    ? {
        season: seasonOf(
          Number(hourly.times[0]?.slice(5, 7)) || tokyoMonth(),
          meanOf(hourly.temperatures),
        ),
        temperatures: pickDayTemperatures(hourly.times, hourly.temperatures),
        place,
      }
    : { season: seasonOf(tokyoMonth(), null), temperatures: null, place };
  // 取れなかった答えをブラウザに残すと、Open-Meteoが戻っても気温なしのままになる
  return Response.json(body, {
    headers: {
      "Cache-Control": hourly ? "private, max-age=600" : "no-store",
    },
  });
}

// 天気が取れなかったときの今日の月。サーバー（Vercel）はUTCで動くので、日本の時刻で数える
function tokyoMonth(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
    }).format(new Date()),
  );
}
