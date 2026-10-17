import "server-only";
import { z } from "zod";

const forecastSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()).max(48),
    temperature_2m: z.array(z.number().nullable()).max(48),
  }),
});

// 鍵の要らないOpen-Meteoから、その土地の今日1日分の気温を取る。
// つながらない・形が違うときはnullを返し、呼び出し側は気温なしで続ける
export async function fetchTodayHourlyTemperatures(
  latitude: number,
  longitude: number,
): Promise<{ times: string[]; temperatures: (number | null)[] } | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "temperature_2m",
    timezone: "auto",
    forecast_days: "1",
  }).toString();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const parsed = forecastSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return {
      times: parsed.data.hourly.time,
      temperatures: parsed.data.hourly.temperature_2m,
    };
  } catch {
    return null;
  }
}
