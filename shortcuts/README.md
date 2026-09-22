# Atajos de iOS: registrar pagos al instante

- **Atajo 1 — Apple Pay (CMR):** automático, se activa al pagar con el iPhone.
- **Atajo 2 — Mercado Pago con tarjeta:** te pregunta el monto al cerrar la app de Mercado Pago.
  Sigue siendo necesario para lo que pagues con la **tarjeta** (física o virtual): la API de
  Mercado Pago solo ve lo pagado con saldo de tu cuenta, QR o Mercado Crédito, y eso ya se
  sincroniza solo (ver README). Además, en Chile esa tarjeta **no se puede agregar a Apple Wallet**,
  así que el Atajo 1 no la puede captar.

## Atajo 1: pagos con Apple Pay (CMR)

Requiere **iOS 17 o superior** y que tu CMR esté en la app **Wallet**. Cada vez que pagues con
Apple Pay, el iPhone envía el monto y el comercio a Chill Duck, y en segundos te llega la
notificación con el total del mes.

> Las compras online con número de tarjeta, o las que no pagues con Apple Pay, igual se registran:
> llegan por correo (Apps Script) con hasta 5 minutos de retraso. Si un pago llega por las dos vías,
> la app lo cuenta una sola vez.

## Antes de empezar

En la app, entra a **Ajustes → Captura automática** y ten a mano:

- **URL de registro** (`https://xxxx.supabase.co/functions/v1/ingest`)
- **Token** (botón copiar)

## Crear la automatización

1. Abre **Atajos** → pestaña **Automatización** → **+** (Nueva automatización).
2. Elige **Transacción**.
3. En **Tarjeta**, marca tu **CMR**. Deja todas las categorías de comercio marcadas.
4. Selecciona **Ejecutar inmediatamente** y desactiva *Notificar al ejecutar*. Toca **Siguiente**.
5. Elige **Nuevo atajo en blanco** y agrega la acción **Obtener contenido de URL**.
6. Configúrala así (toca la flecha **>** de la acción para ver todas las opciones):
   - **URL**: pega la *URL de registro*.
   - **Método**: `POST`.
   - **Encabezados** → *Añadir nuevo encabezado*:
     - Clave `x-ingest-token`, valor: pega tu *Token*.
   - **Cuerpo de la solicitud**: `JSON`, con estos campos (todos de tipo *Texto*):

     | Clave      | Valor                                                                 |
     |------------|-----------------------------------------------------------------------|
     | `source`   | `apple_pay` (escrito tal cual)                                        |
     | `amount`   | variable **Entrada del atajo** → toca la variable → **Importe**       |
     | `merchant` | variable **Entrada del atajo** → toca la variable → **Comercio**      |
     | `card`     | variable **Entrada del atajo** → toca la variable → **Tarjeta o pase**|

7. Toca **OK**. Listo.

## Atajo 2: Mercado Pago con tarjeta, al cerrar la app

Lo que pagas con **saldo de tu cuenta, QR o Mercado Crédito** se sincroniza solo, cada 2 minutos,
desde la API de Mercado Pago. Lo que pagas con la **tarjeta** (en una máquina POS o escribiendo su
número en una web) no lo ve esa API, así que este Atajo te pregunta el monto **cada vez que sales
de la app de Mercado Pago**. Si no pagaste con la tarjeta, tocas **Cancelar** y no se registra nada.

1. **Atajos → Automatización → + → App**.
2. Elige **Mercado Pago**, marca **Se cierra** (desmarca *Se abre*) y **Ejecutar inmediatamente** → **Siguiente** → **Nuevo atajo en blanco**.
3. Agrega estas acciones en orden:
   1. **Solicitar entrada**: tipo **Número**, pregunta `¿Cuánto pagaste con Mercado Pago?`
   2. **Solicitar entrada**: tipo **Texto**, pregunta `¿Dónde?`
   3. **Obtener contenido de URL**, con la misma URL, método `POST` y encabezado `x-ingest-token` del Atajo 1.
      El cuerpo es `JSON` con:

      | Clave      | Valor                                              |
      |------------|----------------------------------------------------|
      | `source`   | `manual`                                           |
      | `method`   | `Mercado Pago`                                     |
      | `amount`   | variable **Entrada proporcionada** (la del paso 1) |
      | `merchant` | variable **Entrada proporcionada** (la del paso 2) |

4. Toca **OK**.

> Tip: si sueles olvidar responderlo, agrega el mismo atajo también a la pantalla de inicio o al
> *Toque posterior* (Ajustes → Accesibilidad → Tocar → Toque posterior) para abrirlo con 2 toques
> en la parte de atrás del iPhone, sin depender de cerrar la app.

## Probarla

Paga algo pequeño con Apple Pay. Deberías recibir una notificación como:

> 💳 CMR · $1.990 en OXXO
> Llevas $451.990 de $800.000 este mes (56%)

Si no llega nada:

- Revisa en **Ajustes → Notificaciones** que las notificaciones estén activas en la app.
- Abre la automatización y ejecútala a mano: si responde `Token inválido`, vuelve a copiar el token.
- Si responde `ignored` con *Tarjeta no reconocida*, el nombre de la tarjeta en Wallet no contiene
  "CMR", "Falabella" ni "Mercado Pago". Agrega una acción **Texto** antes de la petición con el nombre
  correcto (por ejemplo `CMR`) y úsala como valor de `card`.
