import { describe, expect, it } from "vitest";
import { normalizeItem, normalizeModifier, sanitizeEditedModifiers, sanitizeModifier } from "./menuImport";
import type { Item, Modifier } from "./menuImport";

const group = (minimum: number, maximum: number, required = true): Modifier => normalizeModifier({
  id: "drink", name: "Bebida", required, minSelections: minimum, maxSelections: maximum,
  sourceRestriction: { repeatAllowed: true },
  optionItems: [
    { id: "water", name: "Agua", price: 0, available: true },
    { id: "tea", name: "Té", price: 1, available: true },
  ],
}, "drink");
const product = (modifier: Modifier): Item => normalizeItem({
  id: "product", name: "Menú", price: 10, description: "", category: "Menús", image: "",
  allergens: null, modifiers: [modifier], available: true, vegetarian: false, popular: false,
});

describe("Partner modifier contractual bounds (offline)", () => {
  it.each([
    [1, 1, true, [false, false]],
    [2, 4, true, [true, false]],
    [1, 4, false, [false, false]],
    [0, 4, false, [false, false]],
  ])("preserves min=%s max=%s required=%s through pause, save and reactivation", (minimum, maximum, required, active) => {
    const original = product(group(minimum as number, maximum as number, required as boolean));
    const paused = { ...original, modifiers: [{ ...original.modifiers[0], optionItems: original.modifiers[0].optionItems.map((option, i) => ({ ...option, available: (active as boolean[])[i] })) }] };
    const saved = sanitizeEditedModifiers(paused, original)[0];
    const bounds = { required, minSelections: minimum, maxSelections: maximum };
    expect(saved).toMatchObject(bounds);
    expect(saved.optionItems.map((option) => option.available)).toEqual(active);
    expect(saved.sourceRestriction).toEqual(original.modifiers[0].sourceRestriction);
    const loaded = product(saved);
    expect(loaded.modifiers[0]).toMatchObject(bounds);
    const reactivated = { ...loaded, modifiers: [{ ...loaded.modifiers[0], optionItems: loaded.modifiers[0].optionItems.map((option) => ({ ...option, available: true })) }] };
    expect(sanitizeEditedModifiers(reactivated, loaded)[0]).toMatchObject(bounds);
  });

  it("does not infer required or clamp contractual limits when cleaning an option", () => {
    const edited = { ...group(2, 5), optionItems: [{ id: "blank", name: "  ", price: 0, available: false }] };
    expect(sanitizeModifier(edited)).toMatchObject({ required: true, minSelections: 2, maxSelections: 5, optionItems: [] });
    expect(sanitizeModifier(group(1, 5, false))).toMatchObject({ required: false, minSelections: 1, maxSelections: 5 });
  });
});
