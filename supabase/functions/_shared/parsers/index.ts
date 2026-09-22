import type { Method } from '../domain.ts';
import { parseCmrEmail } from './cmr.ts';
import { ignore, type EmailInput, type Ignored, type ParsedPurchase } from './common.ts';
import { parseMercadoPagoEmail } from './mercadopago.ts';

export { ParseError, type EmailInput } from './common.ts';

/** Método de pago según el remitente del correo. */
export function methodFromSender(from: string): Method | null {
  const f = from.toLowerCase();
  if (/falabella|cmr/.test(f)) return 'cmr';
  if (/mercadopago|mercadolibre|mercado pago/.test(f)) return 'mercadopago';
  return null;
}

export function parseEmail(email: EmailInput): (ParsedPurchase & { method: Method }) | Ignored {
  const method = methodFromSender(email.from);
  if (!method) return ignore(`Remitente no reconocido: ${email.from}`);
  const result = method === 'cmr' ? parseCmrEmail(email) : parseMercadoPagoEmail(email);
  return result.kind === 'purchase' ? { ...result, method } : result;
}
