import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChefHat, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { apiOrigin, partnerHeaders } from "./partnerApi";
import { usePwaUpdateBlocker } from "./pwaUpdateRuntime";
import { connectCatalogRealtime } from "./catalogRealtime";
import { patchPartnerMenuAvailability, PartnerMenuRequestError } from "./partnerMenuContract";
import { usePartnerMenuRequests } from "./usePartnerMenuRequests";

/* oxlint-disable react/set-state-in-effect -- effects synchronise the remote partner menu. */

type MenuItem = {
  id: string;
  name: string;
  category?: string;
  price?: number;
  image?: string;
  available?: boolean;
  description?: string;
  allergens?: string[] | null;
  modifiers?: unknown[];
  vegetarian?: boolean;
  popular?: boolean;
};

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export default function MenuAvailability({ token, locationId, identityKey = "", canRead, canEdit, onUnauthorized }: { token: string; locationId?: string; identityKey?: string; canRead: boolean; canEdit: boolean; onUnauthorized: () => void }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const operationLock = useRef(false);
  const requestVersion = useRef(0);
  const headers = useMemo(() => partnerHeaders(token, locationId), [token, locationId]);
  const beginRequest = usePartnerMenuRequests(token, locationId, apiOrigin, onUnauthorized, `${identityKey}:${canRead}:${canEdit}`);
  usePwaUpdateBlocker("partner-menu-availability", Boolean(saving));

  const load = useCallback(async () => {
    if (operationLock.current) return;
    const request = beginRequest();
    if (!request.current()) { request.finish(); return; }
    const version = ++requestVersion.current;
    const current = () => request.current() && version === requestVersion.current;
    if (!canRead) {
      setItems([]);
      setMessage("Este perfil no tiene permiso para consultar la carta de este local.");
      setLoading(false);
      request.finish();
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/menu`, { headers, cache: "no-store", signal: request.signal });
      if (!current()) return;
      if (response.status === 401) { onUnauthorized(); return; }
      if (response.status === 403) { setItems([]); setMessage("No tienes permiso para consultar la carta de este local."); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { menu?: MenuItem[] };
      if (!current()) return;
      setItems((data.menu ?? []).map((item) => ({ ...item, available: item.available !== false })));
    } catch (error) {
      if (current()) setMessage(error instanceof Error ? `No se ha podido cargar la carta (${error.message}).` : "No se ha podido cargar la carta.");
    } finally { if (current()) setLoading(false); request.finish(); }
  }, [beginRequest, canRead, headers, onUnauthorized]);

  useEffect(() => {
    operationLock.current = false;
    setItems([]); setMessage(""); setSaving("");
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);
  useEffect(() => {
    if (!canRead || !token || !locationId) return undefined;
    return connectCatalogRealtime(apiOrigin, () => { void load(); });
  }, [canRead, load, locationId, token]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(items.map((item) => item.category || "General")))], [items]);
  const visible = items.filter((item) => (filter === "Todos" || (item.category || "General") === filter) && item.name.toLowerCase().includes(query.toLowerCase()));
  const available = items.filter((item) => item.available).length;

  const toggle = async (item: MenuItem) => {
    if (!canRead || !canEdit || operationLock.current || loading) return;
    const request = beginRequest();
    if (!request.current()) { request.finish(); return; }
    let unauthorized = false;
    operationLock.current = true;
    requestVersion.current += 1;
    setSaving(item.id);
    try {
      const result = await patchPartnerMenuAvailability({
        apiOrigin, headers, restaurantId: locationId || "", itemId: item.id, available: !(item.available !== false),
        signal: request.signal, isCurrent: request.current,
      });
      if (!request.current()) return;
      setItems((current) => current.map((candidate) => candidate.id === result.itemId ? { ...candidate, available: result.available } : candidate));
      setMessage(`${item.name} está ${result.available ? "disponible" : "pausado"}.`);
    } catch (error) {
      if (!request.current()) return;
      if (error instanceof PartnerMenuRequestError && error.status === 401) { unauthorized = true; onUnauthorized(); return; }
      if (error instanceof PartnerMenuRequestError && error.status === 403) { setMessage("No tienes permiso para modificar la carta de este local."); return; }
      setMessage(error instanceof Error ? `No se han guardado los cambios (${error.message}).` : "No se han guardado los cambios.");
    } finally {
      if (request.current()) {
        operationLock.current = false;
        setSaving("");
        // Recover only the still-current context; never replay a write or reload a revoked session.
        if (!unauthorized) await load();
      }
      request.finish();
    }
  };

  return <section className="availability-workspace" aria-label="Disponibilidad de carta">
    <header className="availability-heading">
      <div><p className="section-kicker">CONTROL DE STOCK</p><h1>Disponibilidad de menú</h1><p>Apaga un producto en cuanto no puedas prepararlo. Los clientes dejarán de verlo al sincronizar.</p></div>
      <button type="button" className="secondary-control" onClick={() => void load()}><RefreshCw size={17} />Actualizar</button>
    </header>

    <div className="availability-stat"><ChefHat size={24} /><div><span>Productos disponibles</span><strong>{available} de {items.length}</strong></div><p>Los cambios se guardan directamente en la carta del local.</p></div>
    {message && <p className="orders-message" role="status"><CheckCircle2 size={17} />{message}</p>}

    <div className="menu-filters"><label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto" /></label><label><SlidersHorizontal size={17} /><select value={filter} onChange={(event) => setFilter(event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label></div>
    {loading ? <div className="orders-loading">Cargando productos…</div> : <div className="availability-list">
      {visible.map((item) => <article key={item.id} className={`availability-row ${item.available ? "is-available" : "is-paused"}`}>
        <div className="menu-thumb">{item.image ? <img src={item.image} alt="" /> : <ChefHat size={21} />}</div>
        <div className="menu-item-copy"><span>{item.category || "General"}</span><h2>{item.name}</h2><p>{item.description || "Sin descripción"}</p></div>
        <div className="menu-price">{money.format(item.price ?? 0)}</div>
        <button type="button" className={`availability-switch ${item.available ? "is-on" : ""}`} role="switch" aria-checked={Boolean(item.available)} aria-label={`${item.available ? "Pausar" : "Activar"} ${item.name}`} disabled={!canEdit || Boolean(saving) || loading} onClick={() => void toggle(item)}><span /></button>
        <strong className="availability-label">{saving === item.id ? "Guardando" : item.available ? "Disponible" : "Pausado"}</strong>
      </article>)}
      {!visible.length && <div className="empty-panel">No hay productos que coincidan con este filtro.</div>}
    </div>}
    {!canEdit && <p className="permission-note">Este perfil puede consultar disponibilidad, pero no modificar la carta.</p>}
  </section>;
}
