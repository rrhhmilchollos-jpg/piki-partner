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
  Upload,

  Trash2,
  X,
} from "lucide-react";
import "./MenuEditor.css";
import { partnerHeaders } from "./partnerApi";
import { bytesToBase64, MENU_IMAGE_ACCEPT, prepareMenuImage, sha256File, validateMenuFile, MAX_MENU_IMAGE_BYTES } from "./menuAsset";

type Modifier = {
  id: string;
  name: string;
  price: number;
  required: boolean;
  options: string[];
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
const blankModifier = (): Modifier => ({
  id: `modifier-${Date.now()}`,
  name: "",
  price: 0,
  required: false,
  options: [],
});
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
  const [filter, setFilter] = useState("Todos");
  const headers = useMemo(() => partnerHeaders(token, locationId), [token, locationId]);
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
          fileName: preparedFile.name,
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
        updateDraft({ image: body.asset.url });
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
      setItems(((await response.json()) as { menu?: Item[] }).menu || []);
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
      setItems(Array.isArray(body.menu) ? body.menu : next);
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
  const save = async () => {
    if (!draft || !draft.name.trim() || !Number.isFinite(draft.price) || draft.price < 0)
      return setMessage("Completa el nombre y un precio válido.");
    const next = items.some((item) => item.id === draft.id)
      ? items.map((item) => (item.id === draft.id ? draft : item))
      : [...items, draft];
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
          <button className="primary-button" onClick={() => setDraft(blank())}>
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </div>
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
                <a className="secondary-button compact-button" href={asset.url} target="_blank" rel="noreferrer">Abrir</a>
                <button type="button" className="icon-action danger" onClick={() => void removeAsset(asset)} disabled={uploading || saving} aria-label={`Eliminar ${asset.fileName}`}><Trash2 size={15} /></button>
              </article>
            ))}
          </div>
        ) : <p className="assets-empty">Todavía no hay un PDF de carta subido. El producto puede seguir usando su propia imagen.</p>}
      </section>
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
                    />
                    <button
                      className="icon-action danger"
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
                      Precio extra (€)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={modifier.price}
                        onChange={(event) =>
                          updateModifier(modifier.id, {
                            price: Number(event.target.value),
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
                          })
                        }
                      />{" "}
                      Obligatorio
                    </label>
                  </div>
                  <input
                    value={modifier.options.join(", ")}
                    onChange={(event) =>
                      updateModifier(modifier.id, {
                        options: event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Opciones separadas por coma"
                  />
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
