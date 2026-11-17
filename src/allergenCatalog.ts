import {
  Bean, Carrot, CircleDot, Egg, Fish, Flower2, Milk, Nut, Shell, Snail, Sprout, Vegan, Wheat, Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const ALLERGEN_SYMBOLS = [
  { code: "gluten", label: "Cereales con gluten", Icon: Wheat, aliases: ["gluten", "cereales con gluten", "wheat", "cereals containing gluten"] },
  { code: "crustaceos", label: "Crustáceos", Icon: Shell, aliases: ["crustaceos", "crustaceans", "shrimp", "prawns"] },
  { code: "huevo", label: "Huevos", Icon: Egg, aliases: ["huevo", "huevos", "egg", "eggs"] },
  { code: "pescado", label: "Pescado", Icon: Fish, aliases: ["pescado", "fish"] },
  { code: "cacahuete", label: "Cacahuetes", Icon: Nut, aliases: ["cacahuete", "cacahuetes", "peanut", "peanuts", "groundnut"] },
  { code: "soja", label: "Soja", Icon: Bean, aliases: ["soja", "soya", "soy", "soybean", "soybeans"] },
  { code: "leche", label: "Leche y derivados", Icon: Milk, aliases: ["leche", "lacteo", "lacteos", "milk", "dairy"] },
  { code: "frutos_de_cascara", label: "Frutos de cáscara", Icon: Vegan, aliases: ["frutos de cascara", "tree nuts", "almond", "almonds", "hazelnut", "walnut", "cashew", "pistachio"] },
  { code: "apio", label: "Apio", Icon: Carrot, aliases: ["apio", "celery"] },
  { code: "mostaza", label: "Mostaza", Icon: Sprout, aliases: ["mostaza", "mustard"] },
  { code: "sesamo", label: "Sésamo", Icon: CircleDot, aliases: ["sesamo", "sesame", "sesame seeds"] },
  { code: "sulfitos", label: "Dióxido de azufre y sulfitos", Icon: Wine, aliases: ["sulfitos", "sulfites", "sulphites", "sulfur dioxide", "sulphur dioxide", "dioxido de azufre"] },
  { code: "altramuces", label: "Altramuces", Icon: Flower2, aliases: ["altramuz", "altramuces", "lupin", "lupins"] },
  { code: "moluscos", label: "Moluscos", Icon: Snail, aliases: ["molusco", "moluscos", "mollusc", "molluscs", "mollusk", "mollusks", "squid", "octopus", "clams", "mussels", "oysters"] },
] as const satisfies readonly { code: string; label: string; Icon: LucideIcon; aliases: readonly string[] }[];

export type AllergenCode = (typeof ALLERGEN_SYMBOLS)[number]["code"];

function allergenKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const allergenCodeByAlias = new Map<string, AllergenCode>(
  ALLERGEN_SYMBOLS.flatMap(({ code, aliases }) => [code, ...aliases].map(alias => [allergenKey(alias), code] as const)),
);

export function allergenCodeFor(value: unknown): AllergenCode | null {
  return typeof value === "string" ? allergenCodeByAlias.get(allergenKey(value)) ?? null : null;
}

export function normalizeAllergenValues(value: string[] | null): string[] | null {
  if (value === null) return null;
  return value.map(entry => allergenCodeFor(entry) ?? entry);
}
