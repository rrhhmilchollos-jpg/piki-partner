/* oxlint-disable react/preserve-manual-memoization -- headers/load are intentionally stable for API effects. */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

type Modifier = {
  id: string;
  name: string;
  price: number;
  required: boolean;
  options: string[];
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
}: {
  apiOrigin: string;
  token: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Item | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("Todos");
  const MAX_IMAGE_BYTES = 200 * 1024;
  const ACCEPTED_IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"];
  const encodeFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
      reader.readAsDataURL(file);
    });
  const uploadImage = async (file: File) => {
    if (!draft) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type))
      return setMessage("Solo se permiten archivos .webp, .jpg, .jpeg o .png.");
    if (file.size > MAX_IMAGE_BYTES)
      return setMessage(
        "La imagen supera el límite máximo de 200 KB por archivo.",
      );
    setUploading(true);
    setMessage("");
    try {
      const contentBase64 = await encodeFile(file);
      const bytes = Uint8Array.from(atob(contentBase64), (character) =>
        character.charCodeAt(0),
      );
      const digestBuffer = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digestBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu/assets`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          sha256,
          contentBase64,
          kind: "menu_image",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error === "MENU_IMAGE_TOO_LARGE"
            ? "La imagen supera el límite de 200 KB."
            : body.error || "No se pudo subir la imagen",
        );
      updateDraft({ image: body.asset.url });
      setMessage(`Imagen subida: ${body.asset.folderKey}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo subir la imagen.",
      );
    } finally {
      setUploading(false);
    }
  };
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );
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
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu`, {
        headers,
      });
      if (!response.ok) throw new Error("No se pudo cargar la carta");
      setItems(((await response.json()) as { menu?: Item[] }).menu || []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo cargar la carta.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiOrigin, headers]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);
  const save = async () => {
    if (!draft?.name.trim() || draft.price < 0)
      return setMessage("Completa el nombre y un precio válido.");
    setSaving(true);
    try {
      const next = items.some((item) => item.id === draft.id)
        ? items.map((item) => (item.id === draft.id ? draft : item))
        : [...items, draft];
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ items: next }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "No se pudo guardar la carta");
      }
      setItems(next);
      setDraft(null);
      setMessage("Carta guardada correctamente.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo guardar la carta.",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: string) => {
    const next = items.filter((item) => item.id !== id);
    setSaving(true);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ items: next }),
      });
      if (!response.ok) throw new Error("No se pudo eliminar el producto");
      setItems(next);
      setMessage("Producto eliminado.");
      if (draft?.id === id) setDraft(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el producto.",
      );
    } finally {
      setSaving(false);
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
                      className={`availability-toggle ${item.available ? "is-on" : ""}`}
                      onClick={() => {
                        setDraft({ ...item, available: !item.available });
                      }}
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
                  WEBP, JPG, JPEG o PNG · máximo 200 KB
                </span>
                <input
                  type="file"
                  accept=".webp,.jpg,.jpeg,.png,image/webp,image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.currentTarget.value = "";
                  }}
                  disabled={uploading}
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
                    className="danger-button"
                    onClick={() => void remove(draft.id)}
                  >
                    <Trash2 size={15} /> Eliminar
                  </button>
                )}
                <button
                  className="primary-button save-button"
                  onClick={() => void save()}
                  disabled={saving}
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
