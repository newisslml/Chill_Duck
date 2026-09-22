import { FALLBACK_CATEGORY } from './domain.ts';

export interface MerchantRule {
  pattern: string;
  category_id: string;
  /** null = regla base incluida en la migración. */
  user_id: string | null;
}

/** Mayúsculas, sin tildes y con espacios simples: "Líder  Express" → "LIDER EXPRESS". */
export function normalizeMerchant(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Patrón para "aplicar siempre a este comercio": quita sufijos de sucursal
 * ("LIDER EXPRESS 123" → "LIDER EXPRESS").
 */
export function merchantPattern(merchant: string): string {
  const base = normalizeMerchant(merchant).replace(/[\s\d*#\-_.]+$/, '');
  return base || normalizeMerchant(merchant);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matches(name: string, pattern: string): boolean {
  if (!pattern) return false;
  // Los patrones cortos ("UBER", "MAX") exigen palabra completa para no chocar con otros nombres;
  // los largos se buscan como substring porque los bancos pegan prefijos ("MERPAGO*SPOTIFY").
  if (pattern.length >= 5) return name.includes(pattern);
  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(pattern)}($|[^A-Z0-9])`).test(name);
}

/**
 * Elige la categoría de un comercio. Las reglas del usuario ganan a las base,
 * y entre iguales gana el patrón más largo ("UBER EATS" antes que "UBER").
 */
export function categorize(
  merchant: string,
  rules: readonly MerchantRule[],
): { categoryId: string; matched: boolean } {
  const name = normalizeMerchant(merchant);
  const sorted = [...rules].sort(
    (a, b) =>
      Number(b.user_id !== null) - Number(a.user_id !== null) || b.pattern.length - a.pattern.length,
  );
  for (const rule of sorted) {
    if (matches(name, normalizeMerchant(rule.pattern))) {
      return { categoryId: rule.category_id, matched: true };
    }
  }
  return { categoryId: FALLBACK_CATEGORY, matched: false };
}
