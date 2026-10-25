/* oxlint-disable react/preserve-manual-memoization -- headers/load are intentionally stable for API effects. */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  GripVertical,
  FileText,
  Image as ImageIcon,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,

  Trash2,
  X,
} from "lucide-react";
import "./MenuEditor.css";
import { partnerHeaders } from "./partnerApi";
import { bytesToBase64, MENU_IMAGE_ACCEPT, prepareMenuImage, sha256File, validateMenuFile, MAX_MENU_IMAGE_BYTES } from "./menuAsset";
import { usePwaUpdateBlocker } from "./pwaUpdateRuntime";
import { connectCatalogRealtime } from "./catalogRealtime";

type ModifierOption = {
  id: string;
  name: string;
  price: number;
  available: boolean;
};
type Modifier = {
  id: string;
  name: string;
  /** Campo antiguo: precio único del grupo. Se sigue enviando por compatibilidad. */
  price: number;
  required: boolean;
  /** Campo antiguo: solo los nombres de las opciones disponibles. */
  options: string[];
  /** Opciones con precio y disponibilidad propios. */
  optionItems: ModifierOption[];
  minSelections: number;
  maxSelections: number;
};
type MenuAsset = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "menu_image" | "menu_file";
  scanStatus?: string;
  scanEngine?: string;
  scannedAt?: string | null;
  url: string;
};
type Item = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  allergens: string[];
  modifiers: Modifier[];
  available: boolean;
  vegetarian: boolean;
  popular: boolean;
};
type ImportDraft = {
  id: string;
  sourceFileName: string;
  extractionMethod: "pdf-text" | "ocr";
  extractedLines: number;
  warnings: string[];
  textPreview: string;
  items: Item[];
  status: "draft" | "published" | "rejected";
};
const blank = (): Item => ({
  id: `item-${Date.now()}`,
  name: "",
  description: "",
  price: 0,
  category: "General",
  image: "",
  allergens: [],
  modifiers: [],
  available: true,
  vegetarian: false,
  popular: false,
});
let idCounter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter += 1)}`;
const blankOption = (): ModifierOption => ({
  id: uid("option"),
  name: "",
  price: 0,
  available: true,
});
const blankModifier = (): Modifier => ({
  id: uid("modifier"),
  name: "",
  price: 0,
  required: false,
  options: [],
  optionItems: [blankOption()],
  minSelections: 0,
  maxSelections: 1,
});
const safePrice = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

/** Convierte un grupo guardado (formato antiguo o nuevo) al formato del editor. */
function normalizeModifier(raw: Partial<Modifier>): Modifier {
  const id = typeof raw.id === "string" && raw.id ? raw.id : uid("modifier");
  const groupPrice = safePrice(raw.price);
  const source: unknown[] =
    Array.isArray(raw.optionItems) && raw.optionItems.length
      ? raw.optionItems
      : Array.isArray(raw.options)
        ? raw.options
        : [];
  const optionItems = source
    .map((entry, position): ModifierOption => {
      const fallbackId = `${id}-opt-${position + 1}`;
      if (typeof entry === "string") {
        return { id: fallbackId, name: entry, price: groupPrice, available: true };
      }
      const record = (entry ?? {}) as Partial<ModifierOption>;
      return {
        id: typeof record.id === "string" && record.id ? record.id : fallbackId,
        name: String(record.name ?? ""),
        price: safePrice(record.price, groupPrice),
        available: record.available !== false,
      };
    })
    .filter((option) => option.name.trim());
  const minSelections =
    Number.isInteger(raw.minSelections) && (raw.minSelections as number) >= 0
      ? (raw.minSelections as number)
      : raw.required
        ? 1
        : 0;
  // Grupo antiguo sin máximo: si es obligatorio se elige solo una opción;
  // si es opcional se permite elegir varias.
  const maxSelections =
    Number.isInteger(raw.maxSelections) && (raw.maxSelections as number) >= Math.max(1, minSelections)
      ? (raw.maxSelections as number)
      : minSelections > 0
        ? Math.max(1, minSelections)
        : Math.max(1, optionItems.length);
  return {
    id,
    name: raw.name ?? "",
    price: groupPrice,
    required: minSelections > 0,
    options: optionItems.filter((option) => option.available).map((option) => option.name),
    optionItems,
    minSelections,
    maxSelections,
  };
}

/** Limpia un grupo antes de guardarlo y rellena los campos antiguos. */
function sanitizeModifier(modifier: Modifier): Modifier {
  const optionItems = modifier.optionItems
    .map((option) => ({
      ...option,
      name: option.name.trim(),
      price: safePrice(option.price),
    }))
    .filter((option) => option.name);
  const count = optionItems.length;
  const minSelections = Math.min(
    modifier.required ? Math.max(1, modifier.minSelections) : 0,
    count,
  );
  const maxSelections = Math.min(
    Math.max(1, minSelections, Math.floor(modifier.maxSelections) || 1),
    Math.max(1, count),
  );
  const availablePrices = optionItems
    .filter((option) => option.available)
    .map((option) => option.price);
  return {
    ...modifier,
    name: modifier.name.trim(),
    required: minSelections > 0,
    minSelections,
    maxSelections,
    optionItems,
    options: optionItems.filter((option) => option.available).map((option) => option.name),
    price: availablePrices.length ? Math.min(...availablePrices) : 0,
  };
}

function normalizeItem(item: Item): Item {
  return {
    ...item,
    allergens: Array.isArray(item.allergens) ? item.allergens : [],
    modifiers: Array.isArray(item.modifiers) ? item.modifiers.map(normalizeModifier) : [],
  };
}

/** Nombre único por contenido: una foto nueva nunca pisa a otra con el mismo nombre. */
function uniqueImageName(fileName: string, sha256: string): string {
  const extension = (fileName.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "jpg").toLowerCase();
  const base =
    fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "producto";
  return `${base}-${sha256.slice(0, 10)}.${extension}`;
}

/** Cambia la dirección cuando cambia la foto, para que navegador y CDN no sirvan la antigua. */
function withCacheVersion(url: string, version: string): string {
  // Si la dirección ya trae parámetros (p. ej. una URL firmada) no se toca: añadir uno la invalidaría.
  if (!url || /[?#]/.test(url) || url.startsWith("data:")) return url;
  return `${url}?v=${version.slice(0, 12)}`;
}
const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export default function MenuEditor({
  apiOrigin,
  token,
  locationId,
  onUnauthorized,
}: {
  apiOrigin: string;
  token: string;
  locationId: string;
  onUnauthorized: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Item | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState<MenuAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const [internalDemo, setInternalDemo] = useState(false);
  const [filter, setFilter] = useState("Todos");
  const headers = useMemo(() => partnerHeaders(token, locationId), [token, locationId]);
  usePwaUpdateBlocker("partner-menu-editor", Boolean(draft) || saving || uploading);
  const uploadAsset = async (file: File, kind: "menu_image" | "menu_file") => {
    setUploading(true);
    setMessage(kind === "menu_file" ? "Comprobando y analizando el PDF…" : "Optimizando y analizando la imagen…");
    try {
      const preparedFile = kind === "menu_image" ? await prepareMenuImage(file) : file;
      if (kind === "menu_file") validateMenuFile(preparedFile);
      const bytes = new Uint8Array(await preparedFile.arrayBuffer());
      const contentBase64 = bytesToBase64(bytes);
      const sha256 = await sha256File(preparedFile);
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu/assets`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: kind === "menu_image" ? uniqueImageName(preparedFile.name, sha256) : preparedFile.name,
          mimeType: preparedFile.type || (kind === "menu_file" ? "application/pdf" : "image/jpeg"),
          sizeBytes: preparedFile.size,
          sha256,
          contentBase64,
          kind,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string; asset?: MenuAsset & { folderKey?: string } };
      if (response.status === 401) { onUnauthorized(); return; }
      if (response.status === 403) { setMessage("Este perfil no tiene permiso para subir archivos a la carta del local activo."); return; }
      if (!response.ok) {
        const messages: Record<string, string> = {
          MENU_IMAGE_TOO_LARGE: `La imagen supera el límite de ${MAX_MENU_IMAGE_BYTES / 1024} KB tras optimizarla.`,
          MENU_FILE_TOO_LARGE: "El PDF supera el límite de 4 MB.",
          MALWARE_DETECTED: "El archivo ha sido rechazado por el analizador antivirus.",
          MALWARE_SCANNER_UNAVAILABLE: "La subida está temporalmente bloqueada hasta que el antivirus esté disponible.",
          MENU_ASSET_CONTENT_TYPE_MISMATCH: "El contenido no coincide con el formato declarado.",
        };
        throw new Error(messages[body.error || ""] || body.message || body.error || "No se pudo subir el archivo.");
      }
      if (!body.asset?.url) throw new Error("La API no devolvió la dirección del archivo.");
      setAssets((current) => [body.asset as MenuAsset, ...current.filter((asset) => asset.id !== body.asset?.id)]);
      if (kind === "menu_image") {
        updateDraft({ image: withCacheVersion(body.asset.url, sha256) });
        const result = file.size > preparedFile.size
          ? `Foto optimizada de ${Math.ceil(file.size / 1024)} KB a ${Math.ceil(preparedFile.size / 1024)} KB.`
          : `Imagen subida (${Math.ceil(preparedFile.size / 1024)} KB).`;
        setMessage(`${result} Analizada por ClamAV.`);
      } else {
        setMessage(`PDF de carta subido (${Math.ceil(preparedFile.size / 1024)} KB). Analizado por ClamAV.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
    }
  };
  const categories = useMemo(
    () => [
      "Todos",
      ...Array.from(new Set(items.map((item) => item.category || "General"))),
    ],
    [items],
  );
  const visibleItems =
    filter === "Todos"
      ? items
      : items.filter((item) => item.category === filter);
  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu/assets`, { headers, cache: "no-store" });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error(`No se pudieron cargar los archivos (HTTP ${response.status}).`);
      setAssets(((await response.json()) as { assets?: MenuAsset[] }).assets || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar los archivos de carta.");
    } finally {
      setAssetsLoading(false);
    }
  }, [apiOrigin, headers, onUnauthorized]);
  const startImport = async (asset: MenuAsset) => {
    setImporting(true);
    setMessage(`Extrayendo productos de «${asset.fileName}»…`);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu/imports`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id }),
      });
      const body = await response.json().catch(() => ({})) as { draft?: ImportDraft; message?: string; error?: string };
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok || !body.draft) throw new Error(body.message || body.error || "No se pudo analizar la carta.");
      setImportDraft(body.draft);
      setMessage(`Borrador creado: ${body.draft.items.length} productos detectados. Revisa y publica cuando todo sea correcto.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo analizar la carta.");
    } finally { setImporting(false); }
  };
  const updateImportedItem = (id: string, patch: Partial<Item>) => {
    setImportDraft((current) => current ? { ...current, items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item) } : current);
  };
  const removeImportedItem = (id: string) => {
    setImportDraft((current) => current ? { ...current, items: current.items.filter((item) => item.id !== id) } : current);
  };
  const publishImport = async () => {
    if (!importDraft || !importDraft.items.length) return setMessage("Añade al menos un producto antes de publicar.");
    setImporting(true);
    try {
      const update = await fetch(`${apiOrigin}/api/v1/partners/menu/imports/${encodeURIComponent(importDraft.id)}`, {
        method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ items: importDraft.items }),
      });
      const updatedBody = await update.json().catch(() => ({})) as { draft?: ImportDraft; error?: string };
      if (update.status === 401) { onUnauthorized(); return; }
      if (!update.ok || !updatedBody.draft) throw new Error(updatedBody.error || "No se pudo guardar el borrador.");
      const publish = await fetch(`${apiOrigin}/api/v1/partners/menu/imports/${encodeURIComponent(importDraft.id)}/publish`, { method: "POST", headers });
      const publishBody = await publish.json().catch(() => ({})) as { draft?: ImportDraft; error?: string };
      if (!publish.ok) throw new Error(publishBody.error || "No se pudo publicar la carta.");
      setImportDraft(null);
      await load();
      setMessage("Carta importada y publicada correctamente. Los productos ya están disponibles según su estado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo publicar la carta.");
    } finally { setImporting(false); }
  };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu`, {
        headers,
        cache: "no-store",
      });
      if (response.status === 401) { onUnauthorized(); return; }
      if (response.status === 403) { setItems([]); throw new Error("Este perfil no tiene permiso para consultar la carta del local activo."); }
      if (!response.ok) throw new Error(`No se pudo cargar la carta (HTTP ${response.status}).`);
      const body = (await response.json()) as { menu?: Item[]; restaurant?: { internalDemo?: boolean } };
      setItems((body.menu || []).map(normalizeItem));
      setInternalDemo(Boolean(body.restaurant?.internalDemo));
      await loadAssets();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo cargar la carta.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiOrigin, headers, loadAssets, onUnauthorized]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = window.setInterval(() => {
      if (!draft && !saving && !uploading && !importing) void load();
    }, 30_000);
    return () => window.clearInterval(refresh);
  }, [draft, importing, load, saving, uploading]);
  useEffect(() => {
    if (!token || !locationId) return undefined;
    return connectCatalogRealtime(apiOrigin, () => {
      if (!draft && !saving && !uploading && !importing) void load();
    });
  }, [apiOrigin, draft, importing, load, locationId, saving, token, uploading]);
  const persistMenu = async (next: Item[], successMessage: string): Promise<boolean> => {
    setSaving(true);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ items: next }),
      });
      if (response.status === 401) { onUnauthorized(); return false; }
      if (response.status === 403) { setMessage("Este perfil no tiene permiso para modificar la carta del local activo."); return false; }
      const body = await response.json().catch(() => ({})) as { error?: string; menu?: Item[] };
      if (!response.ok) throw new Error(body.error || `No se pudo guardar la carta (HTTP ${response.status}).`);
      setItems(Array.isArray(body.menu) ? body.menu.map(normalizeItem) : next);
      setMessage(successMessage);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la carta.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const removeAsset = async (asset: MenuAsset) => {
    if (!window.confirm(`¿Eliminar «${asset.fileName}» de los archivos de carta?`)) return;
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE", headers });
      if (response.status === 401) { onUnauthorized(); return; }
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.message || body.error || `No se pudo eliminar el archivo (HTTP ${response.status}).`);
      setAssets((current) => current.filter((entry) => entry.id !== asset.id));
      setMessage("Archivo eliminado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar el archivo.");
    }
  };
  const importMenuJson = async (file: File) => {
    setImporting(true);
    try {
      if (file.size > 1_000_000) throw new Error("El archivo es demasiado grande (máximo 1 MB).");
      const parsed = JSON.parse(await file.text()) as unknown;
      const rows = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown })?.items;
      if (!Array.isArray(rows) || !rows.length) throw new Error("El archivo no contiene productos.");
      const stamp = Date.now().toString(36);
      const prepared = rows.map((row, index): Item => {
        const raw = (row ?? {}) as Partial<Item>;
        const name = String(raw.name ?? "").trim();
        const price = Number(raw.price);
        if (!name || !Number.isFinite(price) || price < 0) {
          throw new Error(`Producto ${index + 1}: revisa el nombre y el precio.`);
        }
        return normalizeItem({
          id: `item-${stamp}-${index}`,
          name,
          description: String(raw.description ?? "").trim(),
          price,
          category: String(raw.category ?? "").trim() || "General",
          // Las fotos se suben una a una desde la ficha del producto.
          image: "",
          allergens: Array.isArray(raw.allergens) ? raw.allergens.map(String) : [],
          modifiers: Array.isArray(raw.modifiers) ? (raw.modifiers as Modifier[]) : [],
          available: raw.available !== false,
          vegetarian: Boolean(raw.vegetarian),
          popular: Boolean(raw.popular),
        });
      });
      const known = new Set(items.map((item) => `${item.category.toLowerCase()}|${item.name.toLowerCase()}`));
      const fresh = prepared.filter((item) => !known.has(`${item.category.toLowerCase()}|${item.name.toLowerCase()}`));
      if (!fresh.length) return setMessage("Todos los productos del archivo ya están en la carta.");
      const skipped = prepared.length - fresh.length;
      if (!window.confirm(`Se añadirán ${fresh.length} productos a la carta del local activo${skipped ? ` (${skipped} ya existentes se omiten)` : ""}. ¿Continuar?`)) return;
      await persistMenu([...items, ...fresh], `${fresh.length} productos importados. Revisa extras, alérgenos y fotos antes de dar por buena la carta.`);
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "El archivo no es un JSON válido." : error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally {
      setImporting(false);
    }
  };
  const save = async () => {
    if (!draft || !draft.name.trim() || !Number.isFinite(draft.price) || draft.price < 0)
      return setMessage("Completa el nombre y un precio válido.");
    const modifiers = draft.modifiers
      .filter((modifier) => modifier.name.trim() || modifier.optionItems.some((option) => option.name.trim()))
      .map(sanitizeModifier);
    const incomplete = modifiers.find((modifier) => !modifier.name || !modifier.optionItems.length);
    if (incomplete) return setMessage("Cada grupo de extras necesita un nombre y al menos una opción.");
    const cleaned = { ...draft, modifiers };
    const next = items.some((item) => item.id === cleaned.id)
      ? items.map((item) => (item.id === cleaned.id ? cleaned : item))
      : [...items, cleaned];
    if (await persistMenu(next, "Carta guardada correctamente.")) setDraft(null);
  };
  const remove = async (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || !window.confirm(`¿Eliminar «${item.name}» de la carta? Esta acción no se puede deshacer.`)) return;
    const next = items.filter((item) => item.id !== id);
    if (await persistMenu(next, "Producto eliminado.")) setDraft((current) => current?.id === id ? null : current);
  };
  const toggleAvailability = async (item: Item) => {
    if (saving || uploading) return;
    const updated = { ...item, available: !item.available };
    const next = items.map((candidate) => candidate.id === item.id ? updated : candidate);
    const status = updated.available ? "disponible" : "pausado";
    if (await persistMenu(next, `${item.name} está ${status}.`)) {
      setDraft((current) => current?.id === item.id ? { ...current, available: updated.available } : current);
    }
  };
  const updateDraft = (patch: Partial<Item>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const updateModifier = (id: string, patch: Partial<Modifier>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            modifiers: current.modifiers.map((modifier) =>
              modifier.id === id ? { ...modifier, ...patch } : modifier,
            ),
          }
        : current,
    );
  const updateOption = (modifierId: string, optionId: string, patch: Partial<ModifierOption>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            modifiers: current.modifiers.map((modifier) =>
              modifier.id === modifierId
                ? {
                    ...modifier,
                    optionItems: modifier.optionItems.map((option) =>
                      option.id === optionId ? { ...option, ...patch } : option,
                    ),
                  }
                : modifier,
            ),
          }
        : current,
    );
  const duplicate = (item: Item) =>
    setDraft({
      ...item,
      // This timestamp is generated only from the duplicate button handler.
      // oxlint-disable-next-line react/purity
      id: `item-${Date.now()}`,
      name: `${item.name} (copia)`,
    });
  return (
    <section className="menu-workspace">
      <div className="menu-toolbar">
        <div>
          <p className="eyebrow">CATÁLOGO PROFESIONAL</p>
          <h2>Gestiona tu carta</h2>
          <p className="menu-subtitle">
            Organiza productos, precios, alérgenos y extras tal como los verá el
            cliente.
          </p>
        </div>
        <div className="menu-toolbar-actions">
          <button
            className="secondary-button"
            onClick={() => void load()}
            disabled={loading}
          >
            Actualizar
          </button>
          <label className="secondary-button asset-upload-button">
            <Upload size={16} /> Importar productos (.json)
            <input
              type="file"
              accept=".json,application/json"
              disabled={importing || saving || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importMenuJson(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button className="primary-button" onClick={() => setDraft(blank())}>
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </div>
      {internalDemo && (
        <aside className="menu-demo-notice" role="note">
          <strong>Entorno de demostración interno</strong>
          <span>Esta carta sirve para mostrar el flujo de Partner de PIKI. No representa una afiliación comercial ni se publica para pedidos de clientes.</span>
        </aside>
      )}
      {message && (
        <p className="menu-message" role="status">
          <Check size={16} /> {message}
        </p>
      )}
      <section className="menu-assets-panel" aria-label="Archivos de carta y menús">
        <div className="menu-assets-header">
          <div>
            <p className="eyebrow">ARCHIVOS DE CARTA</p>
            <h3>Menú digital del local</h3>
            <p>Sube el PDF que verá tu equipo o comparte una carta visual. Se valida el formato, el peso, el hash y el antivirus antes de guardarlo.</p>
          </div>
          <label className="primary-button asset-upload-button">
            <Upload size={16} /> Subir PDF de carta
            <input type="file" accept=".pdf,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, "menu_file"); event.currentTarget.value = ""; }} disabled={uploading || saving} />
          </label>
        </div>
        {assetsLoading ? <div className="assets-loading">Cargando archivos seguros…</div> : assets.filter((asset) => asset.kind === "menu_file").length ? (
          <div className="menu-assets-list">
            {assets.filter((asset) => asset.kind === "menu_file").map((asset) => (
              <article className="menu-asset-row" key={asset.id}>
                <span className="menu-asset-icon"><FileText size={19} /></span>
                <div><strong>{asset.fileName}</strong><small>{Math.ceil(asset.sizeBytes / 1024)} KB · {asset.scanEngine || "ClamAV"} · limpio</small></div>
                <span className="asset-clean"><ShieldCheck size={15} /> Analizado</span>
                <button type="button" className="secondary-button compact-button" onClick={() => void startImport(asset)} disabled={importing || uploading || saving}><Sparkles size={13} /> Importar</button>
                <a className="secondary-button compact-button" href={asset.url} target="_blank" rel="noreferrer">Abrir</a>
                <button type="button" className="icon-action danger" onClick={() => void removeAsset(asset)} disabled={uploading || saving} aria-label={`Eliminar ${asset.fileName}`}><Trash2 size={15} /></button>
              </article>
            ))}
          </div>
        ) : <p className="assets-empty">Todavía no hay un PDF de carta subido. El producto puede seguir usando su propia imagen.</p>}
      </section>
      {importDraft && (
        <section className="menu-import-review" aria-label="Revisión de importación de carta">
          <div className="menu-import-header">
            <div>
              <p className="eyebrow">REVISIÓN OBLIGATORIA</p>
              <h3><Sparkles size={18} /> {importDraft.sourceFileName}</h3>
              <p>Se han detectado {importDraft.items.length} productos mediante {importDraft.extractionMethod === "ocr" ? "OCR" : "texto del PDF"}. Nada se publicará hasta que lo revises.</p>
            </div>
            <div className="menu-import-actions"><button type="button" className="secondary-button" onClick={() => setImportDraft(null)} disabled={importing}>Descartar borrador</button><button type="button" className="primary-button" onClick={() => void publishImport()} disabled={importing || !importDraft.items.length}><Save size={15} /> Revisar y publicar</button></div>
          </div>
          {importDraft.warnings.length > 0 && <div className="menu-import-warning"><strong>Revisa estos avisos:</strong><ul>{importDraft.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          <div className="menu-import-list">
            {importDraft.items.map((item) => <div className="menu-import-row" key={item.id}>
              <input value={item.name} onChange={(event) => updateImportedItem(item.id, { name: event.target.value })} aria-label="Nombre importado" />
              <input value={item.category} onChange={(event) => updateImportedItem(item.id, { category: event.target.value })} aria-label="Categoría importada" />
              <input type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateImportedItem(item.id, { price: Number(event.target.value) })} aria-label="Precio importado" />
              <button type="button" className="icon-action danger" onClick={() => removeImportedItem(item.id)} aria-label={`Eliminar ${item.name}`}><Trash2 size={15} /></button>
            </div>)}
          </div>
          <details className="menu-import-source"><summary>Ver texto extraído para comprobar la carta</summary><pre>{importDraft.textPreview || "Sin texto extraído"}</pre></details>
        </section>
      )}
      <div className="menu-kpis">
        <div>
          <span>Productos</span>
          <strong>{items.length}</strong>
          <small>en la carta</small>
        </div>
        <div>
          <span>Categorías</span>
          <strong>{Math.max(0, categories.length - 1)}</strong>
          <small>organizadas</small>
        </div>
        <div>
          <span>Disponibles</span>
          <strong>{items.filter((item) => item.available).length}</strong>
          <small>para pedidos</small>
        </div>
        <div>
          <span>Extras</span>
          <strong>
            {items.reduce((total, item) => total + item.modifiers.length, 0)}
          </strong>
          <small>configurados</small>
        </div>
      </div>
      <div className="menu-layout">
        <div className="menu-list-panel">
          <div className="menu-list-header">
            <div>
              <strong>{items.length} productos</strong>
              <span>Activos en tu catálogo</span>
            </div>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filtrar por categoría"
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
          {loading ? (
            <div className="menu-loading">Cargando carta…</div>
          ) : visibleItems.length ? (
            <div className="menu-product-list">
              {visibleItems.map((item) => (
                <article
                  className={`menu-product-row ${draft?.id === item.id ? "menu-product-selected" : ""}`}
                  key={item.id}
                >
                  <div className="drag-handle">
                    <GripVertical size={17} />
                  </div>
                  <div className="product-thumb">
                    {item.image ? (
                      <img src={item.image} alt="" />
                    ) : (
                      <ImageIcon size={20} />
                    )}
                  </div>
                  <div className="product-main">
                    <div className="product-title">
                      <strong>{item.name}</strong>
                      {item.popular && <span className="product-tag">TOP</span>}
                      {item.vegetarian && <span className="diet-tag">VEG</span>}
                    </div>
                    <span>
                      {item.category} · {money.format(item.price)}
                    </span>
                    <small>
                      {item.available ? "Disponible para pedidos" : "Pausado"} ·{" "}
                      {item.modifiers.length} extras · {item.allergens.length}{" "}
                      alérgenos
                    </small>
                  </div>
                  <div className="product-actions">
                    <button
                      type="button"
                      className={`availability-toggle ${item.available ? "is-on" : ""}`}
                      onClick={() => void toggleAvailability(item)}
                      disabled={saving}
                      role="switch"
                      aria-checked={item.available}
                      aria-label={
                        item.available ? "Pausar producto" : "Activar producto"
                      }
                    >
                      <span />
                    </button>
                    <button
                      className="icon-action"
                      onClick={() => duplicate(item)}
                      title="Duplicar"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="secondary-button compact-button"
                      onClick={() => setDraft(item)}
                    >
                      Editar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="menu-empty">
              <ImageIcon size={28} />
              <strong>Aún no tienes productos</strong>
              <span>Añade el primer producto para empezar tu carta.</span>
              <button
                className="primary-button"
                onClick={() => setDraft(blank())}
              >
                <Plus size={16} /> Añadir producto
              </button>
            </div>
          )}
        </div>
        {draft && (
          <aside className="product-editor">
            <div className="editor-header">
              <div>
                <p className="eyebrow">FICHA DEL PRODUCTO</p>
                <h3>
                  {items.some((item) => item.id === draft.id)
                    ? "Editar producto"
                    : "Nuevo producto"}
                </h3>
              </div>
              <button
                className="icon-action"
                onClick={() => setDraft(null)}
                aria-label="Cerrar editor"
              >
                <X size={19} />
              </button>
            </div>
            <div className="editor-form">
              <label>
                Nombre del producto
                <input
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft({ name: event.target.value })
                  }
                  placeholder="Ej. Bowl de temporada"
                  autoFocus
                />
              </label>
              <div className="form-columns">
                <label>
                  Categoría
                  <input
                    value={draft.category}
                    onChange={(event) =>
                      updateDraft({ category: event.target.value })
                    }
                    placeholder="Entrantes, hamburguesas…"
                  />
                </label>
                <label>
                  Precio (€)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.price}
                    onChange={(event) =>
                      updateDraft({ price: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                Descripción
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    updateDraft({ description: event.target.value })
                  }
                  placeholder="Ingredientes, ración y lo que debe saber el cliente…"
                  rows={3}
                />
              </label>
              <label>
                Imagen del producto{" "}
                <span className="field-hint">
                  WEBP, JPG, JPEG, PNG o GIF · máximo 200 KB tras optimizar
                </span>
                <input
                  type="file"
                  accept={MENU_IMAGE_ACCEPT}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAsset(file, "menu_image");
                    event.currentTarget.value = "";
                  }}
                  disabled={uploading || saving}
                />
                {draft.image && (
                  <span className="image-uploaded">
                    <img src={draft.image} alt="Vista previa" />
                    <span>
                      {uploading
                        ? "Subiendo…"
                        : "Imagen guardada en la carpeta del establecimiento"}
                    </span>
                  </span>
                )}
              </label>
              <label>
                Alérgenos <span className="field-hint">separados por coma</span>
                <input
                  value={draft.allergens.join(", ")}
                  onChange={(event) =>
                    updateDraft({
                      allergens: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Gluten, leche, frutos secos"
                />
              </label>
              <div className="checkbox-grid">
                <label>
                  <input
                    type="checkbox"
                    checked={draft.available}
                    onChange={(event) =>
                      updateDraft({ available: event.target.checked })
                    }
                  />{" "}
                  Disponible
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.vegetarian}
                    onChange={(event) =>
                      updateDraft({ vegetarian: event.target.checked })
                    }
                  />{" "}
                  Vegetariano
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.popular}
                    onChange={(event) =>
                      updateDraft({ popular: event.target.checked })
                    }
                  />{" "}
                  Destacado
                </label>
              </div>
              <div className="modifier-heading">
                <div>
                  <strong>Extras y modificadores</strong>
                  <span>Opciones que el cliente puede añadir</span>
                </div>
                <button
                  className="secondary-button compact-button"
                  onClick={() =>
                    updateDraft({
                      modifiers: [...draft.modifiers, blankModifier()],
                    })
                  }
                >
                  <Plus size={14} /> Añadir grupo
                </button>
              </div>
              {draft.modifiers.map((modifier) => (
                <div className="modifier-box" key={modifier.id}>
                  <div className="modifier-box-top">
                    <input
                      value={modifier.name}
                      onChange={(event) =>
                        updateModifier(modifier.id, {
                          name: event.target.value,
                        })
                      }
                      placeholder="Ej. Elige tu salsa"
                      aria-label="Nombre del grupo"
                    />
                    <button
                      type="button"
                      className="icon-action danger"
                      aria-label="Eliminar grupo"
                      onClick={() =>
                        updateDraft({
                          modifiers: draft.modifiers.filter(
                            (entry) => entry.id !== modifier.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="form-columns">
                    <label>
                      Máximo de opciones a elegir
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={modifier.maxSelections}
                        onChange={(event) =>
                          updateModifier(modifier.id, {
                            maxSelections: Math.max(1, Math.floor(Number(event.target.value)) || 1),
                          })
                        }
                      />
                    </label>
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={modifier.required}
                        onChange={(event) =>
                          updateModifier(modifier.id, {
                            required: event.target.checked,
                            minSelections: event.target.checked
                              ? Math.max(1, modifier.minSelections)
                              : 0,
                          })
                        }
                      />{" "}
                      Obligatorio
                    </label>
                  </div>
                  <div className="modifier-options">
                    <span className="field-hint">
                      Nombre de la opción y precio extra en euros (0 = incluido)
                    </span>
                    {modifier.optionItems.map((option) => (
                      <div className="modifier-option-row" key={option.id}>
                        <input
                          className="modifier-option-name"
                          value={option.name}
                          placeholder="Nombre de la opción"
                          aria-label="Nombre de la opción"
                          onChange={(event) =>
                            updateOption(modifier.id, option.id, { name: event.target.value })
                          }
                        />
                        <span className="modifier-option-price">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={option.price}
                            title="Precio extra (€). 0 = incluido"
                            aria-label="Precio extra (€)"
                            onChange={(event) =>
                              updateOption(modifier.id, option.id, {
                                price: safePrice(event.target.value),
                              })
                            }
                          />
                        </span>
                        <label className="checkbox-inline modifier-option-available">
                          <input
                            type="checkbox"
                            checked={option.available}
                            onChange={(event) =>
                              updateOption(modifier.id, option.id, {
                                available: event.target.checked,
                              })
                            }
                          />{" "}
                          Disponible
                        </label>
                        <button
                          type="button"
                          className="icon-action danger"
                          aria-label="Eliminar opción"
                          onClick={() =>
                            updateModifier(modifier.id, {
                              optionItems: modifier.optionItems.filter(
                                (entry) => entry.id !== option.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() =>
                        updateModifier(modifier.id, {
                          optionItems: [...modifier.optionItems, blankOption()],
                        })
                      }
                    >
                      <Plus size={14} /> Añadir opción
                    </button>
                  </div>
                </div>
              ))}
              <div className="editor-footer">
                <button
                  className="secondary-button"
                  onClick={() => setDraft(null)}
                >
                  Cancelar
                </button>
                {items.some((item) => item.id === draft.id) && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void remove(draft.id)}
                    disabled={saving || uploading}
                  >
                    <Trash2 size={15} /> Eliminar
                  </button>
                )}
                <button
                  className="primary-button save-button"
                  onClick={() => void save()}
                  disabled={saving || uploading}
                >
                  <Save size={16} />{" "}
                  {saving ? "Guardando…" : "Guardar producto"}
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
