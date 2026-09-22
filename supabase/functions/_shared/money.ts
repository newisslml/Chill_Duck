// Montos en pesos chilenos (CLP): siempre enteros, sin decimales.

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

/** 12990 → "$12.990" */
export function formatCLP(amount: number): string {
  return clp.format(Math.round(amount));
}

/** 12990 → "12.990" (sin signo peso, para inputs). */
export function formatThousands(amount: number): string {
  return plain.format(Math.round(amount));
}

/**
 * Convierte un monto escrito por un humano, un banco o Apple Pay a entero.
 * Acepta "$12.990", "$ 12.990,00", "CLP 12,990", "12990", "12,990.00".
 * Siempre devuelve un valor positivo.
 */
export function parseCLP(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error(`Monto inválido: ${input}`);
    return Math.abs(Math.round(input));
  }

  const cleaned = input.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) throw new Error(`Monto inválido: "${input}"`);

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized: string;

  if (lastDot >= 0 && lastComma >= 0) {
    // Con ambos separadores, el último es el decimal.
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalized = cleaned.split(thousands).join('').replace(decimal, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = cleaned.split(sep);
    // "12.990" o "1.234.567" son miles; "12,5" es decimal.
    const isThousands = parts.length > 2 || parts[parts.length - 1].length === 3;
    normalized = isThousands ? parts.join('') : parts.join('.');
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`Monto inválido: "${input}"`);
  return Math.round(value);
}
