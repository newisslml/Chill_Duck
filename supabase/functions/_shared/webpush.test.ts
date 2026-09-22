import { createECDH, randomBytes } from 'node:crypto';
// @ts-expect-error: http_ece no publica tipos. Es la implementación de referencia de RFC 8188.
import ece from 'http_ece';
import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, encryptPayload, vapidAuthorization } from './webpush.ts';

describe('webpush', () => {
  it('el navegador puede descifrar el mensaje (aes128gcm)', async () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const authSecret = randomBytes(16);
    const message = JSON.stringify({ title: '💳 CMR · $12.990 en LIDER', body: 'Llevas $450.000' });

    const encrypted = await encryptPayload(new TextEncoder().encode(message), {
      p256dh: b64urlEncode(browser.getPublicKey()),
      auth: b64urlEncode(authSecret),
    });

    const decrypted = ece.decrypt(Buffer.from(encrypted), {
      version: 'aes128gcm',
      privateKey: browser,
      authSecret,
    });
    expect(decrypted.toString('utf8')).toBe(message);
  });

  it('firma un JWT VAPID verificable con la clave pública', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const publicKey = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));

    const header = await vapidAuthorization('https://web.push.apple.com/abc123', {
      publicKey,
      privateKey: jwk.d!,
      subject: 'mailto:yo@example.org',
    });

    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h, p, sig, k] = match!;
    expect(k).toBe(publicKey);
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    expect(claims.aud).toBe('https://web.push.apple.com');
    expect(claims.sub).toBe('mailto:yo@example.org');

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      b64urlDecode(sig),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(valid).toBe(true);
  });
});
