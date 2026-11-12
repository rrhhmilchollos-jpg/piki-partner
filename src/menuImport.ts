export type ModifierOption = {
  [key: string]: unknown;
  id: string;
  name: string;
  price: number;
  available: boolean;
};

export type Modifier = {
  [key: string]: unknown;
  id: string;
  name: string;
  /** Campos antiguos, conservados si ya existen. */
  price: number;
  required: boolean;
  options: (string | Partial<ModifierOption>)[];
  optionItems: ModifierOption[];
  minSelections: number;
  maxSelections: number;
};

export type Item = {
  [key: string]: unknown;
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  /** null = desconocido; [] = declaración explícita vacía. */
  allergens: string[] | null;
  modifiers: Modifier[];
  available: boolean;
  vegetarian: boolean;
  popular: boolean;
};

export const safePrice = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

/** Adapta los grupos legacy sin borrar metadatos ni reinterpretar restricciones. */
export function normalizeModifier(raw: Partial<Modifier>, fallbackId: string): Modifier {
  const id = typeof raw.id === "string" && raw.id ? raw.id : fallbackId;
  const groupPrice = safePrice(raw.price);
  const source: unknown[] = Array.isArray(raw.optionItems)
    ? raw.optionItems
    : Array.isArray(raw.options) ? raw.options : [];
  const optionItems = source.map((entry, position): ModifierOption => {
    const optionId = `${id}-opt-${position + 1}`;
    if (typeof entry === "string") {
      return { id: optionId, name: entry, price: groupPrice, available: true };
    }
    const record = (entry ?? {}) as Partial<ModifierOption>;
    return {
      ...record,
      id: typeof record.id === "string" && record.id ? record.id : optionId,
      name: String(record.name ?? ""),
      price: safePrice(record.price, groupPrice),
      available: record.available !== false,
    };
  });
  const minSelections = Number.isInteger(raw.minSelections) && (raw.minSelections as number) >= 0
    ? raw.minSelections as number : raw.required ? 1 : 0;
  const maxSelections = Number.isInteger(raw.maxSelections) && (raw.maxSelections as number) >= 0
    ? raw.maxSelections as number
    : minSelections > 0 ? Math.max(1, minSelections) : Math.max(1, optionItems.length);
  return {
    ...raw,
    id,
    name: raw.name ?? "",
    price: groupPrice,
    required: typeof raw.required === "boolean" ? raw.required : minSelections > 0,
    options: Array.isArray(raw.options)
      ? raw.options : optionItems.filter((option) => option.available).map((option) => option.name),
    optionItems,
    minSelections,
    maxSelections,
  };
}

/** Leer o abrir una ficha nunca constituye una declaración de alérgenos. */
export function normalizeItem(item: Item): Item {
  return {
    ...item,
    allergens: Array.isArray(item.allergens) ? item.allergens : null,
    modifiers: Array.isArray(item.modifiers)
      ? item.modifiers.map((modifier, index) => normalizeModifier(modifier, `${item.id}-modifier-${index + 1}`))
      : [],
  };
}

/** Sólo un cambio explícito del usuario convierte el estado desconocido en una lista. */
export function setAllergenDeclaration(item: Item, declared: boolean): Item {
  return { ...item, allergens: declared ? item.allergens ?? [] : null };
}

export function allergenSummary(allergens: Item["allergens"]): string {
  return allergens === null ? "Alérgenos desconocidos"
    : allergens.length ? `${allergens.length} alérgenos` : "Declaración de alérgenos vacía";
}

/** Limpia exclusivamente un grupo editado, conservando campos adicionales. */
export function sanitizeModifier(modifier: Modifier): Modifier {
  const optionItems = modifier.optionItems
    .map((option) => ({ ...option, name: option.name.trim(), price: safePrice(option.price) }))
    .filter((option) => option.name);
  // Availability and option cleanup are not edits to the group's contractual bounds.
  // Even an unsatisfiable group must retain its requirements for the central API to enforce.
  const availablePrices = optionItems.filter((option) => option.available).map((option) => option.price);
  return {
    ...modifier,
    name: modifier.name.trim(),
    optionItems,
    options: optionItems.filter((option) => option.available).map((option) => option.name),
    price: availablePrices.length ? Math.min(...availablePrices) : 0,
  };
}

// Orden de claves irrelevante; orden de arrays y todos los valores sí son relevantes.
function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${fingerprint((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** Guardar nombre/precio/alérgenos no recalcula los grupos no editados. */
export function sanitizeEditedModifiers(draft: Item, original?: Item): Modifier[] {
  return draft.modifiers
    .flatMap((modifier) => {
      const previous = original?.modifiers.find((entry) => entry.id === modifier.id);
      if (previous && fingerprint(previous) === fingerprint(modifier)) return [previous];
      if (!modifier.name.trim() && !modifier.optionItems.some((option) => option.name.trim())) return [];
      return [sanitizeModifier(modifier)];
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Arrays explícitos sustituyen su lista; las entradas del mismo ID conservan campos omitidos. */
function mergeModifiers(previous: Modifier[] = [], supplied: Record<string, unknown>[]): Modifier[] {
  return supplied.map((group) => {
    const old = typeof group.id === "string" ? previous.find((entry) => entry.id === group.id) : undefined;
    const merged: Record<string, unknown> = { ...old, ...group };
    for (const key of ["options", "optionItems"] as const) {
      if (!Array.isArray(group[key])) continue;
      const oldOptions = old?.[key] ?? [];
      merged[key] = group[key].map((option) => {
        if (!isRecord(option) || typeof option.id !== "string") return option;
        const matched = oldOptions.filter((entry) => isRecord(entry) && entry.id === option.id);
        return Object.assign({}, ...matched, option);
      });
    }
    // Una lista nueva legacy o moderna no debe dejar una representación antigua desfasada.
    if (group.options !== undefined && group.optionItems === undefined) delete merged.optionItems;
    if (group.optionItems !== undefined && group.options === undefined) delete merged.options;
    return merged as Modifier;
  });
}

/** Metadatos JSON sí; claves que puedan modificar prototipos, no. */
function assertSafeJson(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(assertSafeJson); return; }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) {
        throw new Error(`Campo JSON no permitido: ${key}. No se ha importado ningún producto.`);
      }
      assertSafeJson(entry);
    }
  }
}

function validateModifiers(value: unknown, row: number): void {
  if (!Array.isArray(value)) throw new Error(`Producto ${row}: los grupos deben ser una lista.`);
  for (const group of value) {
    if (!isRecord(group)) throw new Error(`Producto ${row}: grupo de opciones inválido.`);
    for (const key of ["price", "minSelections", "maxSelections"]) {
      if (group[key] !== undefined && (typeof group[key] !== "number" || !Number.isFinite(group[key])
        || group[key] < 0 || (key !== "price" && !Number.isInteger(group[key])))) {
        throw new Error(`Producto ${row}: revisa la restricción ${key} del grupo.`);
      }
    }
    if (group.required !== undefined && typeof group.required !== "boolean") {
      throw new Error(`Producto ${row}: required debe ser booleano.`);
    }
    for (const key of ["options", "optionItems"]) {
      if (group[key] === undefined) continue;
      if (!Array.isArray(group[key])) throw new Error(`Producto ${row}: ${key} debe ser una lista.`);
      for (const option of group[key]) {
        if (key === "options" && typeof option === "string") continue;
        if (!isRecord(option) || typeof option.name !== "string" || !option.name.trim()
          || (option.price !== undefined && (typeof option.price !== "number" || !Number.isFinite(option.price) || option.price < 0))) {
          throw new Error(`Producto ${row}: opción inválida.`);
        }
      }
    }
  }
}

export type MenuImportResult = { items: Item[]; added: number; updated: number; unchanged: number };

/**
 * Upsert puro y atómico del lote por ID exacto: nunca infiere nombres/sabores/tamaños.
 * Un ID ausente se rechaza (no hay IDs temporales); duplicados idénticos se colapsan,
 * duplicados conflictivos abortan antes de producir un menú. No muta sus argumentos.
 */
export function prepareMenuJsonImport(current: Item[], parsed: unknown): MenuImportResult {
  const rows = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.items : undefined;
  if (!Array.isArray(rows) || !rows.length) throw new Error("El archivo no contiene productos.");
  const existing = new Map<string, Item>();
  for (const item of current) {
    if (!item.id || existing.has(item.id)) {
      throw new Error("La carta actual contiene IDs ausentes o repetidos. Revisa la carta antes de importar.");
    }
    existing.set(item.id, item);
  }
  const incoming = new Map<string, Record<string, unknown>>();
  rows.forEach((row, index) => {
    const position = index + 1;
    if (!isRecord(row)) throw new Error(`Producto ${position}: debe ser un objeto JSON.`);
    assertSafeJson(row);
    if (typeof row.id !== "string" || !row.id.trim() || row.id !== row.id.trim()) {
      throw new Error(`Producto ${position}: se necesita un ID explícito estable, sin espacios exteriores.`);
    }
    if (typeof row.name !== "string" || !row.name.trim()
      || (typeof row.price !== "number" && typeof row.price !== "string")
      || String(row.price).trim() === "" || !Number.isFinite(Number(row.price)) || Number(row.price) < 0) {
      throw new Error(`Producto ${position}: revisa el nombre y el precio.`);
    }
    for (const key of ["description", "category", "image"]) {
      if (row[key] !== undefined && typeof row[key] !== "string") {
        throw new Error(`Producto ${position}: ${key} debe ser texto.`);
      }
    }
    for (const key of ["available", "vegetarian", "popular"]) {
      if (row[key] !== undefined && typeof row[key] !== "boolean") {
        throw new Error(`Producto ${position}: ${key} debe ser booleano.`);
      }
    }
    if (row.allergens !== undefined && row.allergens !== null
      && (!Array.isArray(row.allergens) || row.allergens.some((entry) => typeof entry !== "string"))) {
      throw new Error(`Producto ${position}: allergens debe ser null (desconocido) o una lista de texto.`);
    }
    if (row.modifiers !== undefined) validateModifiers(row.modifiers, position);
    const previous = incoming.get(row.id);
    if (previous && fingerprint(previous) !== fingerprint(row)) {
      throw new Error(`ID repetido conflictivo «${row.id}». No se ha importado ningún producto.`);
    }
    if (!previous) incoming.set(row.id, row);
  });

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const prepared = new Map<string, Item>();
  for (const [id, raw] of incoming) {
    const previous = existing.get(id);
    const item = normalizeItem({
      ...{
        description: "", category: "General", image: "", allergens: null, modifiers: [],
        available: true, vegetarian: false, popular: false,
      },
      ...previous,
      ...raw,
      id,
      name: (raw.name as string).trim(),
      price: Number(raw.price),
      modifiers: Array.isArray(raw.modifiers)
        ? mergeModifiers(previous?.modifiers, raw.modifiers as Record<string, unknown>[])
        : previous?.modifiers ?? [],
      category: typeof raw.category === "string" ? raw.category.trim() || "General" : previous?.category || "General",
      // Un hueco de imagen del catálogo fuente no borra un asset existente.
      image: typeof raw.image === "string" && raw.image.trim() ? raw.image : previous?.image || "",
    } as Item);
    prepared.set(id, item);
    if (!previous) added += 1;
    else if (fingerprint(previous) === fingerprint(item)) unchanged += 1;
    else updated += 1;
  }
  return {
    items: [
      ...current.map((item) => prepared.get(item.id) ?? item),
      ...[...prepared.values()].filter((item) => !existing.has(item.id)),
    ],
    added, updated, unchanged,
  };
}
