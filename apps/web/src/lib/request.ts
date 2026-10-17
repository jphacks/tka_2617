export async function requestJson<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, options);
  if (!response.ok) {
    const value: unknown = await response.json();
    throw new Error(
      typeof value === "object" &&
        value !== null &&
        "error" in value &&
        typeof value.error === "string"
        ? value.error
        : "処理に失敗しました",
    );
  }
  return (await response.json()) as T;
}
