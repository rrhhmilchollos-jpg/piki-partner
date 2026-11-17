import { X } from "lucide-react";
import { ALLERGEN_SYMBOLS, allergenCodeFor } from "./allergenCatalog";
import type { AllergenCode } from "./allergenCatalog";

export default function AllergenSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: string[] | null;
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const selectedCodes = new Set<AllergenCode>((value ?? []).map(allergenCodeFor).filter((code): code is AllergenCode => code !== null));
  const unknownValues = (value ?? []).map((label, index) => ({ label, index })).filter(({ label }) => allergenCodeFor(label) === null);

  const toggle = (code: AllergenCode) => {
    if (disabled || value === null) return;
    const next = selectedCodes.has(code)
      ? value.filter(entry => allergenCodeFor(entry) !== code)
      : [...value, code];
    onChange(next);
  };

  return (
    <fieldset className="allergen-selector" disabled={disabled}>
      <legend>Selecciona los símbolos de alérgenos presentes</legend>
      <p className="field-hint">Pulsa los pictogramas que correspondan según la información confirmada por el comercio. No se infieren alérgenos automáticamente.</p>
      <div className="allergen-symbol-grid">
        {ALLERGEN_SYMBOLS.map(({ code, label, Icon }) => {
          const selected = selectedCodes.has(code);
          return (
            <button
              type="button"
              key={code}
              className={`allergen-symbol ${selected ? "is-selected" : ""}`}
              aria-label={`${selected ? "Quitar" : "Añadir"} ${label}`}
              aria-pressed={selected}
              onClick={() => toggle(code)}
              disabled={disabled}
            >
              <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {unknownValues.length > 0 && (
        <div className="allergen-legacy" role="note">
          <strong>Etiquetas antiguas pendientes de revisar:</strong>
          <span>Se conservan porque no se pueden asignar con seguridad a un símbolo.</span>
          <div>
            {unknownValues.map(({ label, index }) => (
              <button
                key={`${index}-${label}`}
                type="button"
                className="allergen-legacy-chip"
                aria-label={`Quitar etiqueta antigua no reconocida: ${label}`}
                onClick={() => value !== null && onChange(value.filter((_entry, current) => current !== index))}
                disabled={disabled || value === null}
              >
                {label}<X size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  );
}
