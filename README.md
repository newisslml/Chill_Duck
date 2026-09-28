# 🦆 Chill Duck

App para iPhone (PWA) que registra sola tus gastos con **CMR Falabella** y **Mercado Pago**.
Compara lo gastado contra tu sueldo y tus topes, te avisa con una notificación en cada pago y
el día 1 te envía por correo el informe del mes anterior.

```
API Mercado Pago ◄─(pg_cron cada 2 min)── Edge Function `sync-mercadopago` ─┐
Atajo iOS "Transacción" Apple Pay (CMR) ─► Edge Function `ingest` ──────────┤
Atajo iOS "Mercado Pago con tarjeta"    ─► Edge Function `ingest` ──────────┤
Apps Script: transferencias y "Pago CMR" ─► Edge Function `ingest` ─────────┤
                                                                            ├─► Postgres ─► Realtime ─► PWA
                               deduplica, categoriza y avisa por Web Push ◄─┘
Apps Script (día 1, 08:00) ─► Edge Function `monthly-report` ─► correo desde tu Gmail
```

- **Mercado Pago con saldo, QR o Mercado Crédito:** automático, con la API y tu propio Access Token.
  Ignora cargas de saldo, reservas de ahorro y dinero recibido. **La API no ve lo pagado con la
  tarjeta** (física o virtual) de Mercado Pago — Mercado Pago no lo expone a apps externas — y esa
  tarjeta tampoco se puede agregar a Apple Wallet en Chile, así que esos pagos se registran con el
  Atajo 2 (pregunta el monto al cerrar la app).
- **CMR Falabella:** Banco Falabella no envía correos por compra; se capta con el Atajo 1 (Apple Pay).
  Respaldo: en la app de Banco Falabella abre el movimiento → **Compartir → Gmail**, envíatelo a tu
  propio correo con el asunto **`Pago CMR`**. El script lee la imagen con el OCR de Google Drive
  (lugar, fecha y hora, cuotas y monto) y la registra. Si el pago ya había llegado por el Atajo, se
  cuenta una sola vez, y compartir dos veces el mismo pago tampoco lo duplica.
- **Transferencias desde Banco Falabella:** automático por correo. Cada transferencia que haces genera
  el aviso *"Aviso de transferencia de fondos realizada"* (de `notificaciones@cl.bancofalabella.com`);
  el script de Gmail lo lee y la registra en CMR Falabella como "Transferencia a <destinatario>", para
  revisar (puede ser plata que te mueves a ti mismo: bórrala y no vuelve). Las transferencias
  recibidas, los avances en efectivo y el pago de la tarjeta se ignoran.

| Carpeta | Qué hay |
|---|---|
| `app/` | PWA: React + Vite + Tailwind. Vistas: Inicio, Métodos de pago, Movimientos, Ajustes y Notificaciones |
| `supabase/migrations/` | Tablas, seguridad por fila, vista `month_charges` (reparto de cuotas por mes) y reglas de categorías |
| `supabase/functions/` | `ingest` (correo y Atajos), `sync-mercadopago` (API), `monthly-report` (informe), `notify-purchase` (aviso de gastos ingresados en la app) y `_shared/` (lógica compartida con la app) |
| `supabase/cron/` | SQL que programa la sincronización de Mercado Pago con pg_cron |
| `apps-script/` | Script de Gmail: lee las transferencias de Banco Falabella y los "Pago CMR" que te compartes, y envía el informe mensual |
| `shortcuts/` | Paso a paso de los Atajos de iOS (Apple Pay y respaldo manual) |
| `tests/` | Prueba de la migración SQL en un Postgres embebido |

**Reglas de cálculo**
- El mes es calendario y en hora de Chile. Una compra a las 23:30 del día 30 cuenta en ese mes.
- Las compras en cuotas suman **solo la cuota del mes**. La cuota 1 cae en el mes de la compra.
- El 100% del gráfico de Inicio son tus ingresos (sueldo + otros ingresos). La marca negra es el tope.

---

## Instalación (una sola vez, ~30 minutos)

Necesitas Node 20+ y cuentas gratuitas en [Supabase](https://supabase.com) y [Vercel](https://vercel.com).

### 1. Supabase

1. Crea un proyecto en supabase.com (región São Paulo es la más cercana).
2. En esta carpeta:
   ```bash
   npm install
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>   # el ref está en la URL del dashboard
   npx supabase db push                                 # crea tablas, vista y reglas
   ```
3. En el dashboard, crea tu usuario en **Authentication → Users → Add user** (correo + contraseña,
   marca *Auto Confirm*).
4. Desactiva registros nuevos en **Authentication → Sign In / Providers → Allow new users to sign up**.

### 2. Notificaciones push (claves VAPID)

```bash
npx web-push generate-vapid-keys
npx supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:<tu-correo>
```

`VAPID_SUBJECT` es obligatorio: Apple rechaza las notificaciones si falta.

### 3. Edge Functions

```bash
npx supabase functions deploy ingest --no-verify-jwt
npx supabase functions deploy monthly-report --no-verify-jwt
npx supabase functions deploy notify-purchase --no-verify-jwt
```

`ingest` y `monthly-report` se autentican con el token de Ajustes (no con el login de Supabase) porque
las llaman Apps Script y el Atajo. `notify-purchase` la llama la app al guardar un gasto a mano y valida
tu sesión por su cuenta.

Cada notificación que se envía queda también en el historial de la app (campana de Inicio).

### 3b. Mercado Pago automático (API)

1. En https://www.mercadopago.cl/developers/panel/app crea una aplicación (*Checkout API*) y copia el
   **Access Token de producción** (`APP_USR-...`).
2. Guárdalo como secreto: `npx supabase secrets set MP_ACCESS_TOKEN=<token>`.
3. Despliega y programa la sincronización cada 2 minutos:
   ```bash
   npx supabase functions deploy sync-mercadopago --no-verify-jwt
   sed "s#{{SUPABASE_URL}}#https://<ref>.supabase.co#" supabase/cron/sync-mercadopago.sql > cron.sql
   npx supabase db query --linked -f cron.sql && rm cron.sql
   ```
4. Carga el historial sin notificaciones (por ejemplo, 50 días):
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/sync-mercadopago \
     -H "x-ingest-token: <token>" -H "Content-Type: application/json" -d '{"days":50,"silent":true}'
   ```

Si borras en la app un pago sincronizado (por ejemplo una transferencia a ti mismo), no vuelve a aparecer.
Para cortar el acceso, elimina la aplicación en el panel de Mercado Pago.

### 4. La app en Vercel

1. Sube esta carpeta a un repositorio de GitHub e impórtalo en Vercel. `vercel.json` ya indica
   cómo compilar. También puedes usar `npx vercel` sin GitHub.
2. En Vercel → Settings → Environment Variables agrega:
   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: Supabase → Project Settings → API.
   - `VITE_VAPID_PUBLIC_KEY`: la misma clave pública del paso 2.
3. Despliega. Obtienes una URL como `https://chill-duck.vercel.app`.

### 5. Instalar en el iPhone

1. Abre la URL en **Safari** → botón **Compartir** → **Agregar a inicio**.
2. Abre Chill Duck **desde el ícono** (no desde Safari) e inicia sesión.
3. En **Ajustes** ingresa tu sueldo, otros ingresos y los topes, y toca **Guardar cambios**.
4. Toca **Activar notificaciones** y acepta. Te llegará una notificación de prueba.

### 6. Lectura de correos y el informe mensual (Apps Script)

Ni CMR Falabella ni Mercado Pago envían un correo por cada compra (solo notificaciones de sus apps,
que ninguna API externa puede leer). Banco Falabella sí avisa por correo cada transferencia que haces,
y los pagos CMR puedes compartírtelos desde su app con asunto `Pago CMR`: este script registra ambos
y además manda el informe mensual. Usa el servicio avanzado de Drive para leer la imagen (la primera
ejecución pide permiso de Drive y Documentos; el documento temporal queda en la papelera).

1. Entra a [script.google.com](https://script.google.com) con tu cuenta de Gmail → **Nuevo proyecto**.
2. Pega el contenido de `apps-script/Code.gs`.
3. En ⚙ **Configuración del proyecto**:
   - Marca *Mostrar el archivo de manifiesto "appsscript.json"* y reemplázalo por el de `apps-script/`.
   - En **Propiedades del script** agrega `SUPABASE_URL` y `INGEST_TOKEN` (cópialos de Ajustes → Captura automática).
4. Ejecuta la función **`setup`** y autoriza los permisos. Crea el disparador del informe mensual y
   el heartbeat, y ejecuta `diagnostico` para revisar (en Ajustes → Captura automática de la app) si
   a tu Gmail llegan avisos de compra reales.
5. Ejecuta `activarLecturaCorreos()` para prender la lectura cada 5 minutos (Ajustes → Captura
   automática muestra cuándo fue la última). Si los avisos llegan de otros remitentes, antes agrega
   `CMR_SENDERS` o `MP_SENDERS` en las Propiedades del script (remitentes separados por coma).
   Con eso activo, `backfill` carga las transferencias de los últimos 35 días sin notificaciones.
6. Opcional, para el botón *Enviar informe de prueba* de la app: **Implementar → Nueva implementación →
   Aplicación web** (ejecutar como *Yo*, acceso *Cualquier persona*). Pega la URL en Ajustes.
   Sin esto, puedes ejecutar `sendTestReport` desde el editor.

### 7. Atajo de Apple Pay

Sigue [`shortcuts/README.md`](shortcuts/README.md).

---

## Ajustar la lectura de correos (importante)

Los parsers (`supabase/functions/_shared/parsers/`) entienden varios formatos típicos:
- Campos etiquetados: `Monto: $12.990`, `Comercio: LIDER`.
- Frases: `compra por $X en COMERCIO el 21/09/2026 a las 13:45`, `Pagaste $ 8.490 a Starbucks`.

**Los correos de ejemplo en `fixtures/` son sintéticos.** Para dejarlos exactos a tus bancos:

1. Copia 2 o 3 avisos reales de cada uno como archivos en `supabase/functions/_shared/parsers/fixtures/`.
   Tapa tu nombre y los últimos dígitos de la tarjeta.
2. Agrega el resultado esperado en `parsers.test.ts` y corre `npm test`.
3. Ajusta los patrones hasta que pasen y vuelve a desplegar `ingest`.

Si un correo no se puede leer, queda en **Ajustes → Avisos que no pude leer** y te llega una notificación.

## Desarrollo local

```bash
npm install
cp app/.env.example app/.env      # completa con tu proyecto Supabase
npm run dev                        # http://localhost:5173
npm test                           # lógica, SQL (PGlite), cifrado push y vistas
npm run build                      # typecheck + build de producción
npm run icons                      # regenera los PNG desde app/public/icons/icon.svg
```

Probar el registro sin esperar un pago real:

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/ingest \
  -H "x-ingest-token: <token>" -H "Content-Type: application/json" \
  -d '{"source":"apple_pay","amount":"$12.990","merchant":"LIDER EXPRESS","card":"CMR Mastercard"}'
```

## Limitaciones conocidas

- **Formato de los correos:** si CMR o Mercado Pago lo cambian, el parser deja de leerlos hasta que lo ajustes
  (ver arriba). Mientras tanto te llega el aviso "No pude registrar un pago".
- **Alcance del Atajo:** solo se activa con pagos por Apple Pay. Lo que pagues con la CMR física o
  escribiendo su número en una web no llega por ninguna vía: regístralo a mano (Movimientos → +).
- **Push en iOS:** requiere iOS 16.4+ y abrir la app desde el ícono de inicio.
- **Supabase gratuito:** pausa los proyectos inactivos. El `heartbeat` diario de Apps Script lo evita.
