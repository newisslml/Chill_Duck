// Catálogo compartido entre la PWA y las Edge Functions.
// Los ids de categoría deben coincidir con la semilla de `supabase/migrations/20260921000000_init.sql`.

export type Method = 'cmr' | 'mercadopago';
/** `api`: sincronizado desde la API de Mercado Pago. */
export type Source = 'email' | 'apple_pay' | 'manual' | 'api';

export const METHOD_IDS: readonly Method[] = ['cmr', 'mercadopago'];

export const METHODS: Record<Method, { name: string; short: string }> = {
  cmr: { name: 'CMR Falabella', short: 'CMR' },
  mercadopago: { name: 'Mercado Pago', short: 'Mercado Pago' },
};

export interface Category {
  id: string;
  name: string;
  /** Nombre del ícono de lucide (kebab-case). */
  icon: string;
}

export const CATEGORIES: readonly Category[] = [
  { id: 'supermercado', name: 'Supermercado', icon: 'shopping-cart' },
  { id: 'comida', name: 'Comida y delivery', icon: 'utensils' },
  { id: 'ropa', name: 'Ropa', icon: 'shirt' },
  { id: 'entretenimiento', name: 'Entretenimiento', icon: 'clapperboard' },
  { id: 'suscripciones', name: 'Suscripciones', icon: 'repeat' },
  { id: 'deudas', name: 'Deudas', icon: 'landmark' },
  { id: 'transporte', name: 'Transporte', icon: 'car' },
  { id: 'salud', name: 'Salud', icon: 'heart-pulse' },
  { id: 'hogar', name: 'Hogar y servicios', icon: 'house-plug' },
  { id: 'otros', name: 'Otros', icon: 'circle-ellipsis' },
];

export const FALLBACK_CATEGORY = 'otros';

export function categoryById(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

/** Deduce el método de pago a partir del nombre de la tarjeta en Wallet. */
export function methodFromCardName(card: string | null | undefined): Method | null {
  const name = (card ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (/CMR|FALABELLA/.test(name)) return 'cmr';
  if (/MERCADO\s*PAGO|MERCADOPAGO/.test(name)) return 'mercadopago';
  return null;
}
