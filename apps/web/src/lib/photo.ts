export async function preparePhoto(file: File) {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)
    throw new Error("20MiB以下の写真を選んでください");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("画像を変換できませんでした");
  }
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return {
    file: jpegFile(dataUrl.split(",")[1]),
    imageBase64: dataUrl.split(",")[1],
    widthPx: canvas.width,
    heightPx: canvas.height,
  };
}

export function jpegFile(base64: string) {
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  return new File([bytes], "garment.jpg", { type: "image/jpeg" });
}
