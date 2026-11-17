import { describe, expect, it } from "vitest";
import {
  allergenSummary, normalizeItem, prepareMenuJsonImport,
  sanitizeEditedModifiers, setAllergenDeclaration,
} from "./menuImport";
import type { Item, Modifier } from "./menuImport";

const product = (id: string, patch: Partial<Item> = {}): Item => ({
  id, name: `Producto ${id}`, description: "Descripción original", price: 7.5,
  category: "Carta", image: `https://assets.example.invalid/${id}.webp`,
  allergens: ["Gluten"], modifiers: [], available: true, vegetarian: false, popular: false,
  ...patch,
});

const group = (): Modifier => ({
  id: "group-1", name: "Acompañante", price: 0, required: false,
  minSelections: 0, maxSelections: 2,
  conditionalMinSelections: 1, sourceRestriction: { repeatAllowed: true, maximumPerOption: 2 },
  description: "Seleccionar sólo si se solicita acompañante",
  options: [{ id: "option-1", name: "Patatas", price: 0, available: true, description: "Una unidad" }],
  optionItems: [{ id: "option-1", name: "Patatas", price: 0, available: true, description: "Una unidad", sourceId: "ola-option-1" }],
});

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function replayFixture() {
  const current = Array.from({ length: 100 }, (_, index) => product(`legacy-${index}`, {
    available: index % 2 === 0, sourceEvidence: { storageOnly: index }, modifiers: [group()],
  }));
  const incoming = Array.from({ length: 119 }, (_, index) => ({
    id: index < 39 ? `legacy-${index}` : `mr-ola-${index}`,
    name: `Ficha Ola ${index}`, price: 5 + index / 100, category: "OlaClick EUR",
    image: `https://assets.example.invalid/ola-${index}.webp`, allergens: null,
    modifiers: [group()], source: { productId: `ola-${index}`, currency: "EUR", checksum: `sha-${index}` },
  }));
  return { current, incoming };
}

describe("Partner JSON upsert puro por ID exacto (sin API ni DB)", () => {
  it("119 fichas sobre 100: 39 updates + 80 altas + 61 legacy intactos = 180 IDs, replay idempotente", () => {
    const { current, incoming } = replayFixture();
    freezeDeep(current);
    freezeDeep(incoming);
    const result = prepareMenuJsonImport(current, { items: incoming });
    expect(result).toMatchObject({ added: 80, updated: 39, unchanged: 0 });
    expect(result.items).toHaveLength(180);
    expect(new Set(result.items.map((item) => item.id)).size).toBe(180);
    for (const row of incoming) {
      const stored = result.items.find((item) => item.id === row.id)!;
      expect(stored.allergens).toBeNull();
      expect(stored.image).toBe(row.image);
      expect(stored.modifiers).toEqual(row.modifiers);
      expect(stored.source).toEqual(row.source);
    }
    for (const original of current.slice(39)) {
      expect(result.items.find((item) => item.id === original.id)).toBe(original);
    }
    expect(result.items[0].sourceEvidence).toEqual({ storageOnly: 0 });
    // Sólo una disponibilidad explícita puede activar/pausar un update.
    expect(result.items[1].available).toBe(false);
    const replay = prepareMenuJsonImport(result.items, incoming);
    expect(replay).toMatchObject({ added: 0, updated: 0, unchanged: 119 });
    expect(replay.items).toEqual(result.items);
    expect(current).toHaveLength(100);
  });

  it("un ID conflictivo al final del lote de 119 rechaza todo sin mutar actuales ni JSON", () => {
    const { current, incoming } = replayFixture();
    const conflicting = [...incoming, { ...incoming[0], price: 999 }];
    const beforeCurrent = JSON.stringify(current);
    const beforeIncoming = JSON.stringify(conflicting);
    freezeDeep(current);
    freezeDeep(conflicting);
    expect(() => prepareMenuJsonImport(current, { items: conflicting })).toThrow(/ID repetido conflictivo/);
    expect(JSON.stringify(current)).toBe(beforeCurrent);
    expect(JSON.stringify(conflicting)).toBe(beforeIncoming);
  });

  it("colapsa IDs repetidos idénticos aunque difiera el orden de claves", () => {
    const row = { id: "ola-1", name: "Producto", price: 4, allergens: null, image: "foto.webp" };
    const same = { price: 4, image: "foto.webp", name: "Producto", allergens: null, id: "ola-1" };
    const result = prepareMenuJsonImport([], [row, same]);
    expect(result.added).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it.each(["name", "image", "allergens", "modifiers", "source"])("rechaza conflictos de %s, no sólo de precio", (key) => {
    const row = product("stable", { modifiers: [group()], source: { productId: "source-1" } });
    const changes: Record<string, unknown> = {
      name: "Otro producto", image: "otra.webp", allergens: null, modifiers: [], source: { productId: "source-2" },
    };
    expect(() => prepareMenuJsonImport([], [row, { ...row, [key]: changes[key] }])).toThrow(/ID repetido conflictivo/);
  });

  it("no fusiona por nombre/categoría, sabor, tamaño ni variaciones editoriales", () => {
    const current = [product("fanta-naranja-33cl", { name: "Fanta", category: "Bebidas" })];
    const incoming = [
      { id: "fanta-limon", name: "Fanta", category: "Bebidas", price: 2 },
      { id: "fanta-50cl", name: "FANTA", category: "Bebidas", price: 3 },
    ];
    const result = prepareMenuJsonImport(current, incoming);
    expect(result.items.map((item) => item.id)).toEqual(["fanta-naranja-33cl", "fanta-limon", "fanta-50cl"]);
    expect(result.items[0]).toBe(current[0]);
  });

  it.each([undefined, null, "", "  ", 12, " id-con-espacios "])("rechaza ID no explícito estable: %s", (id) => {
    expect(() => prepareMenuJsonImport([], [{ id, name: "Producto", price: 5 }])).toThrow(/ID explícito estable/);
  });

  it("rechaza IDs actuales repetidos en lugar de sobrescribirlos silenciosamente", () => {
    expect(() => prepareMenuJsonImport([product("same"), product("same")], [product("same")])).toThrow(/carta actual contiene IDs/);
  });

  it("preserva imagen, alérgenos, disponibilidad, grupos y unknowns cuando el update los omite", () => {
    const current = [product("keep", { modifiers: [group()], available: false, provenance: { checksum: "original" } })];
    const result = prepareMenuJsonImport(current, [{ id: "keep", name: "Nuevo nombre", price: 8 }]);
    expect(result.items[0]).toEqual({ ...current[0], allergens: ["gluten"], name: "Nuevo nombre", price: 8 });
  });

  it("un hueco de imagen no borra un asset; una URL explícita poblada se conserva exactamente", () => {
    const current = [product("keep")];
    const blank = prepareMenuJsonImport(current, [{ id: "keep", name: "Cambio", price: 8, image: "" }]);
    expect(blank.items[0].image).toBe(current[0].image);
    const url = "https://assets.example.invalid/image.webp?signature=fixture";
    const changed = prepareMenuJsonImport(current, [{ id: "keep", name: "Cambio", price: 8, image: url }]);
    expect(changed.items[0].image).toBe(url);
  });

  it("preserva null y [] explícitos, y un alta sin declaración queda desconocida", () => {
    const result = prepareMenuJsonImport([], [
      { id: "unknown", name: "Desconocido", price: 1, allergens: null },
      { id: "declared-empty", name: "Declaración vacía", price: 1, allergens: [] },
      { id: "absent", name: "Sin declaración", price: 1 },
    ]);
    expect(result.items.map((item) => item.allergens)).toEqual([null, [], null]);
    const reset = prepareMenuJsonImport([product("unknown")], [{ id: "unknown", name: "Desconocido", price: 1, allergens: null }]);
    expect(reset.items[0].allergens).toBeNull();
  });

  it.each(["Gluten", {}, [null], [1]])("rechaza una declaración malformada sin sustituirla por []: %s", (allergens) => {
    expect(() => prepareMenuJsonImport([], [{ id: "id", name: "Producto", price: 1, allergens }])).toThrow(/allergens debe ser/);
  });

  it.each([null, false, "", " ", -1, "no-precio"])("rechaza precios inválidos: %s", (price) => {
    expect(() => prepareMenuJsonImport([], [{ id: "id", name: "Producto", price }])).toThrow(/nombre y el precio/);
  });

  it("acepta precios numéricos textuales por compatibilidad, sin alterar moneda ni céntimos", () => {
    expect(prepareMenuJsonImport([], [{ id: "id", name: "Producto", price: "7.50" }]).items[0].price).toBe(7.5);
  });

  it.each([null, {}, { items: [] }, [null]])("rechaza lotes vacíos/malformados: %s", (parsed) => {
    expect(() => prepareMenuJsonImport([], parsed)).toThrow();
  });

  it("preserva metadatos JSON pero rechaza claves que puedan contaminar prototipos", () => {
    const unsafe = JSON.parse('[{"id":"unsafe","name":"Producto","price":1,"source":{"__proto__":{"polluted":true}}}]');
    expect(() => prepareMenuJsonImport([], unsafe)).toThrow(/Campo JSON no permitido/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("lectura y edición sin falsear alérgenos ni recalcular grupos", () => {
  it("normalizar y editar un nombre mantiene null y la distinción visual con []", () => {
    const original = normalizeItem(product("unknown", { allergens: null, modifiers: [group()] }));
    const edited = { ...original, name: "Nombre editado" };
    expect(edited.allergens).toBeNull();
    expect(allergenSummary(edited.allergens)).toBe("Alérgenos desconocidos");
    expect(allergenSummary([])).toBe("Declaración de alérgenos vacía");
    expect(allergenSummary(["Leche"])).toBe("1 alérgenos");
    expect(normalizeItem(product("missing", { allergens: undefined })).allergens).toBeNull();
    expect(normalizeItem(product("empty", { allergens: [] })).allergens).toEqual([]);
  });

  it("pasar a declaración vacía o volver a desconocido requiere una acción explícita", () => {
    const original = product("unknown", { allergens: null });
    const declared = setAllergenDeclaration(original, true);
    expect(declared.allergens).toEqual([]);
    expect(setAllergenDeclaration(declared, false).allergens).toBeNull();
    expect(setAllergenDeclaration(product("known", { allergens: ["Leche"] }), true).allergens).toEqual(["Leche"]);
    expect(original.allergens).toBeNull();
  });

  it("grupos completos conservan opciones objetuales, IDs, restricciones y metadatos al leer/importar/guardar otra propiedad", () => {
    const original = product("id", { allergens: null, modifiers: [group()] });
    const loaded = normalizeItem(original);
    expect(loaded).toEqual(original);
    const saved = { ...loaded, price: 9, modifiers: sanitizeEditedModifiers({ ...loaded, price: 9 }, loaded) };
    expect(saved.modifiers).toEqual(original.modifiers);
    expect(saved.allergens).toBeNull();
    expect(saved.modifiers[0]).toBe(loaded.modifiers[0]);
    const imported = prepareMenuJsonImport([], [original]).items[0];
    expect(imported).toEqual(original);
  });

  it("un grupo y opción del mismo ID retienen las restricciones/metadatos omitidos, sin matching por nombre", () => {
    const original = product("id", { modifiers: [group()] });
    const supplied = [{ id: "group-1", name: "Acompañante revisado", optionItems: [
      { id: "option-1", name: "Patatas revisadas", price: 1, available: true },
    ] }];
    const imported = prepareMenuJsonImport([original], [{ id: "id", name: original.name, price: 7.5, modifiers: supplied }]).items[0];
    expect(imported.modifiers[0]).toMatchObject({
      minSelections: 0, maxSelections: 2, required: false, conditionalMinSelections: 1,
      sourceRestriction: original.modifiers[0].sourceRestriction,
      optionItems: [{ id: "option-1", name: "Patatas revisadas", price: 1, sourceId: "ola-option-1", description: "Una unidad" }],
      options: ["Patatas revisadas"],
    });
  });

  it("una lista legacy explícita no conserva optionItems antiguos desfasados", () => {
    const original = product("id", { modifiers: [group()] });
    const imported = prepareMenuJsonImport([original], [{
      id: "id", name: original.name, price: 7.5,
      modifiers: [{ id: "group-1", name: "Salsas", options: ["Samurai"] }],
    }]).items[0];
    expect(imported.modifiers[0].options).toEqual(["Samurai"]);
    expect(imported.modifiers[0].optionItems.map((option) => option.name)).toEqual(["Samurai"]);
  });

  it("normaliza legacy con IDs de grupos/opciones deterministas y conserva las restricciones explícitas", () => {
    const legacy = product("legacy", { modifiers: [{
      name: "Salsas", price: 0.5, required: false, options: ["Rooster", "Samurai"],
      minSelections: 1, maxSelections: 4, sourceRestriction: { optional: true },
    } as unknown as Modifier] });
    const loaded = normalizeItem(legacy);
    expect(loaded.modifiers[0]).toMatchObject({
      id: "legacy-modifier-1", required: false, minSelections: 1, maxSelections: 4,
      sourceRestriction: { optional: true },
      optionItems: [
        { id: "legacy-modifier-1-opt-1", name: "Rooster", price: 0.5 },
        { id: "legacy-modifier-1-opt-2", name: "Samurai", price: 0.5 },
      ],
    });
    expect(normalizeItem(legacy)).toEqual(loaded);
  });

  it("editar un grupo sigue saneando nombres/precios sin borrar sus campos adicionales", () => {
    const original = product("id", { modifiers: [group()] });
    const changed = { ...original, modifiers: [{ ...original.modifiers[0], name: "  Acompañantes  " }] };
    const saved = sanitizeEditedModifiers(changed, original);
    expect(saved[0].name).toBe("Acompañantes");
    expect(saved[0].sourceRestriction).toEqual(original.modifiers[0].sourceRestriction);
    expect(saved[0].optionItems[0].sourceId).toBe("ola-option-1");
  });
});
