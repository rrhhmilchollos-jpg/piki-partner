export const MAX_MENU_IMAGE_BYTES = 200 * 1024;

const ACCEPTED_IMAGE_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

function outputName(fileName: string, mimeType: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "producto";
  return `${base}.${mimeType === "image/webp" ? "webp" : "jpg"}`;
}

export async function prepareMenuImage(file: File): Promise<File> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Solo se permiten archivos WEBP, JPG, JPEG o PNG.");
  }
  if (file.size <= MAX_MENU_IMAGE_BYTES) return file;
  if (typeof createImageBitmap !== "function") {
    throw new Error("No se pudo optimizar esta foto en el navegador. Prueba a subirla en JPG, PNG o WEBP con menos de 200 KB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo abrir la foto. Prueba a guardarla como JPG, PNG o WEBP.");
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la foto en este navegador.");

    for (const mimeType of ["image/webp", "image/jpeg"]) {
      for (const maxEdge of [1440, 1200, 960, 720]) {
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (mimeType === "image/jpeg") {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        for (const quality of [0.82, 0.68, 0.54]) {
          const blob = await canvasBlob(canvas, mimeType, quality);
          if (!blob) continue;
          if (blob.type !== mimeType) break;
          if (blob.size <= MAX_MENU_IMAGE_BYTES) {
            return new File([blob], outputName(file.name, mimeType), {
              type: mimeType,
              lastModified: file.lastModified,
            });
          }
        }
      }
    }
    throw new Error("La foto sigue superando 200 KB tras optimizarla. Prueba con una imagen más pequeña.");
  } finally {
    bitmap.close();
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}
