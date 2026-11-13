export const ACCOUNT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const ACCOUNT_PHOTO_MAX_CHARS = 220_000;
export const ACCOUNT_PHOTO_MAX_SIDE = 256;
const rasterDataUrl = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Only a supplied raster photo, never a generated avatar or executable image. */
export function accountPhotoUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim();
  if (url.startsWith("data:")) return url.length <= ACCOUNT_PHOTO_MAX_CHARS && rasterDataUrl.test(url) ? url : null;
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    if (/(^|\.)dicebear\./i.test(parsed.hostname) || /\.svg(?:$|[?#])/i.test(url)) return null;
    return url;
  } catch { return null; }
}

export function accountPhotoDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("La foto no tiene dimensiones válidas.");
  const scale = Math.min(1, ACCOUNT_PHOTO_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

function hasRasterSignature(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return type === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export async function prepareAccountPhoto(file: File): Promise<string> {
  if (!ACCOUNT_PHOTO_ACCEPT.split(",").includes(file.type)) throw new Error("Selecciona una foto JPEG, PNG o WebP.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasRasterSignature(bytes, file.type)) throw new Error("El archivo no es una foto JPEG, PNG o WebP válida.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("No se pudo leer la foto. Elige otra imagen."));
      candidate.src = objectUrl;
    });
    const dimensions = accountPhotoDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la foto en este dispositivo.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const photoUrl = canvas.toDataURL("image/jpeg", 0.8);
    if (photoUrl.length > ACCOUNT_PHOTO_MAX_CHARS) throw new Error("La foto preparada supera el tamaño permitido. Elige otra foto.");
    if (!photoUrl.startsWith("data:image/jpeg;base64,") || !rasterDataUrl.test(photoUrl)) throw new Error("No se pudo preparar una foto JPEG válida.");
    return photoUrl;
  } finally { URL.revokeObjectURL(objectUrl); }
}

/** ACK may return a normalised photo; it cannot update roles, names or ACLs. */
export function acknowledgedAccountPhoto(payload: unknown, submitted: string | null): string | null {
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (data.success === false || data.ok === false) throw new Error("PIKI rechazó la foto. Se conserva la foto anterior.");
  const employee = data.employee && typeof data.employee === "object" ? data.employee as Record<string, unknown> : {};
  const source = Object.hasOwn(employee, "photoUrl") ? employee : data;
  if (!Object.hasOwn(source, "photoUrl")) return submitted;
  if (source.photoUrl === null) return null;
  const photoUrl = accountPhotoUrl(source.photoUrl);
  if (!photoUrl) throw new Error("PIKI no confirmó una foto válida. Se conserva la foto anterior.");
  return photoUrl;
}
