# Correos de ejemplo

Cada `.eml.txt` tiene las cabeceras `From`, `Subject` y `Date`, una línea en blanco y el cuerpo en
texto plano (lo mismo que entrega `GmailMessage.getPlainBody()` en Apps Script).

**Los archivos actuales son sintéticos**: imitan el estilo de los avisos, pero no son copias reales.
Para dejar los parsers a prueba de balas:

1. En Gmail abre un aviso real de CMR o Mercado Pago → ⋮ → *Mostrar original* y copia el texto.
2. Guárdalo aquí como `cmr-<caso>.eml.txt` o `mp-<caso>.eml.txt`, tapando datos personales
   (nombre, últimos dígitos de la tarjeta, RUT).
3. Agrega el resultado esperado en `../parsers.test.ts` y corre `npm test`.
