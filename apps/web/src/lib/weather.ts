import type { Season } from "@pitari/api";

// 位置情報を許可しなかったときの場所（東京駅）
export const fallbackPlace = { latitude: 35.68, longitude: 139.77 };

// 朝・昼・夜として見る時刻（その土地の時刻）
export const dayPartHours = { morning: 7, noon: 13, night: 19 } as const;

export type DayPart = keyof typeof dayPartHours;

export type TodayWeather = {
  season: Season;
  // 天気のAPIにつながらなかったときはnull。画面は気温なしで出す
  temperatures: Record<DayPart, number | null> | null;
  place: "current" | "fallback";
};

// 位置は0.1度（約10km）に丸めて、住所が分からないようにする。
// クエリはホスティングのアクセスログに残るので、画面は送る前にこれで丸める
export function roundCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

// ブラウザから来た緯度・経度を確かめ、丸める。無いか不正なら決まった場所にする
export function placeFromQuery(params: URLSearchParams): {
  latitude: number;
  longitude: number;
  place: TodayWeather["place"];
} {
  const latitude = coordinateFrom(params.get("lat"));
  const longitude = coordinateFrom(params.get("lon"));
  if (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return {
      latitude: roundCoordinate(latitude),
      longitude: roundCoordinate(longitude),
      place: "current",
    };
  }
  return { ...fallbackPlace, place: "fallback" };
}

// Number("")は0になるので、空や空白だけの値は、数に直す前に弾く
function coordinateFrom(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const monthSeasons: Season[] = [
  "winter",
  "winter",
  "spring",
  "spring",
  "spring",
  "summer",
  "summer",
  "summer",
  "autumn",
  "autumn",
  "autumn",
  "winter",
];

// 月で決め、春と秋だけ、その日の平均気温が夏や冬なみなら寄せる。
// 夏・冬の月は、1日だけ涼しい・暖かい日があっても季節を変えない
export function seasonOf(
  month: number,
  meanTemperature: number | null,
): Season {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`月が不正です: ${String(month)}`);
  }
  const season = monthSeasons[month - 1];
  if (meanTemperature === null) return season;
  if (season === "spring" || season === "autumn") {
    if (meanTemperature >= 23) return "summer";
    if (meanTemperature <= 10) return "winter";
  }
  return season;
}

// Open-Meteoの1時間ごとの時刻（その土地の"YYYY-MM-DDTHH:MM"）と気温から、朝・昼・夜を取る
export function pickDayTemperatures(
  times: string[],
  temperatures: (number | null)[],
): Record<DayPart, number | null> {
  const at = (hour: number) => {
    const index = times.findIndex(
      (time) => Number(time.slice(11, 13)) === hour,
    );
    const value = index === -1 ? null : temperatures[index];
    return typeof value === "number" ? Math.round(value) : null;
  };
  return {
    morning: at(dayPartHours.morning),
    noon: at(dayPartHours.noon),
    night: at(dayPartHours.night),
  };
}

export function meanOf(values: (number | null)[]): number | null {
  const numbers = values.filter((value) => typeof value === "number");
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}
