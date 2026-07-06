# Sweepstakes entries — Wannabewelder

Servicio que escucha los pedidos pagados en Shopify y genera "entradas" de
sweepstakes (ID unico + nombre del cliente) segun reglas de producto,
variante o cantidad comprada.

## Aviso legal (leer antes de activar nada)

Esto **no es asesoria legal**. Cambiar el nombre de "rifa" a "sweepstakes" no
cambia la clasificacion legal de la promocion: lo que importa es el mecanismo.

En Texas (y en general en EE.UU.), una promocion con premio + azar +
**consideracion** (pagar para poder participar) es una loteria no autorizada
(Texas Penal Code, Cap. 47). Para operar como sweepstakes legal normalmente
se necesita:

- Un metodo de entrada gratuito (AMOE) con las mismas probabilidades que
  comprar. Este proyecto ya trae el endpoint `POST /entries/free` listo,
  pero **apagado por defecto** (`ENABLE_FREE_ENTRY=false`). Actívalo solo
  cuando tengas resuelto donde vas a exponer el formulario gratuito.
- Reglas oficiales publicadas (fechas, elegibilidad, como se elige ganador,
  valor del premio, "void where prohibited").
- Revision de un abogado licenciado en Texas antes de lanzar, especialmente
  si el premio total podria acercarse a $50,000 (umbral del Texas Business
  and Commerce Code, Cap. 622, que aplica solo a sweepstakes por correo).

El script `scripts/drawWinner.js` sortea con probabilidad igual entre todas
las entradas (compra + gratuitas) a proposito: no le des mas peso a las de
compra o vuelves a caer en el problema de "consideracion".

## Como funciona

1. Shopify envia un webhook `orders/paid` a este servicio.
2. `src/rules.js` lee la pestaña `rules` del Google Sheet (nombre de producto
   → entradas por unidad) y, por cada producto del pedido que aparezca ahi,
   multiplica ese valor por la cantidad comprada.
3. `src/tickets.js` genera una entrada individual (UUID + numero secuencial)
   por cada "boleta" ganada, con el nombre y email del cliente.
4. Todo se guarda en una hoja de Google Sheets (pestaña `entries`, ver
   `src/db.js`; el encabezado se crea solo al arrancar el servicio).
5. `/admin/entries` y `/admin/entries.csv` permiten consultarlas, o abres la
   hoja directamente desde Google Sheets.

## Configurar que productos dan entradas (pestaña `rules`)

El cliente controla todo desde el mismo Google Sheet, sin tocar codigo, sin
buscar IDs y sin Admin API de Shopify. La configuracion vive en una pestaña
llamada `rules` (el servicio la crea sola al arrancar si no existe).

La pestaña tiene dos columnas:

| productTitle              | entriesPerUnit |
| ------------------------- | -------------- |
| Casco de soldar automatico | 1              |
| Combo soldador PRO         | 20             |

- **productTitle**: el nombre del producto **exactamente como aparece en
  Shopify** (el matching ignora mayusculas/minusculas y espacios de sobra,
  pero el texto debe corresponder al titulo del producto).
- **entriesPerUnit**: cuantas entradas da ese producto **por cada unidad
  comprada**. Ejemplos:
  - `1` → comprar 3 unidades da 3 entradas.
  - `20` → comprar 2 unidades da 40 entradas.
- Un producto que no aparezca en la tabla no genera entradas.

No hay que redeployar ni tocar nada: el servicio lee la pestaña `rules` en
vivo cada vez que llega un pedido.

> Cuidado: si renombras un producto en Shopify, actualiza tambien su fila en
> la pestaña `rules`, o ese producto dejara de otorgar entradas (el match es
> por nombre). Haz siempre un pedido de prueba tras cambiar productos.

## Configurar la app en Shopify (Dev Dashboard)

Shopify retiró el flujo legacy de "custom apps" (Settings → Apps and sales
channels → Develop apps) — ahora todo pasa por **Dev Dashboard**
(`dev.shopify.com/dashboard`), incluso para una app privada de una sola
tienda como esta.

1. Desde el admin de la tienda → **Settings → Apps → App development** →
   **Build apps in Dev Dashboard**.
2. Crea la app (o usa la que ya tengas) y crea una nueva **version**:
   - **App URL**: la URL de tu servicio en Render (si todavía no lo
     desplegaste, pon un placeholder y actualízalo después — Shopify no
     valida que responda en este paso).
   - **Embed app in Shopify admin**: **desmárcalo**. Este servicio no tiene
     ninguna pantalla embebida en el admin, solo recibe webhooks.
   - **Preferences URL**: vacío.
   - **Webhooks API version**: deja la más reciente.
   - Click **Release** para activar la versión.
3. En **Settings** de la app → **Credentials** → copia el **Secret**. Ese
   valor va en `SHOPIFY_WEBHOOK_SECRET`. (No se necesita ningun scope de
   Admin API ni Admin API token: el servicio no consulta nada de vuelta a
   Shopify, solo recibe el webhook y lee las reglas del Google Sheet.)
4. Crea el webhook `orders/paid` apuntando a tu servidor público:
   - Vía Admin API (GraphQL `webhookSubscriptionCreate` o REST
     `POST /admin/api/2024-XX/webhooks.json`), formato `json`,
     `address: https://TU-DOMINIO/webhooks/orders-paid`.
   - O vía **Settings → Notifications → Webhooks** en el admin de la
     tienda (interfaz legada de webhooks, sigue funcionando igual aunque
     la creación de apps haya cambiado).

## Configurar Google Sheets (almacenamiento)

Las entradas se guardan en una hoja de Google Sheets en vez de una base de
datos — funciona bien para el volumen de este proyecto y le da al cliente
acceso directo a los datos sin pasar por el admin del servicio.

1. **Crea la hoja**: una hoja de cálculo nueva en Google Sheets. Renombra la
   primera pestaña exactamente a `entries` (el código escribe ahí).
2. **Crea la cuenta de servicio**:
   - [Google Cloud Console](https://console.cloud.google.com/) → crea un
     proyecto (o usa uno existente).
   - Habilita la **Google Sheets API** (APIs & Services → Library).
   - IAM & Admin → **Service Accounts** → Create Service Account. No
     necesita ningún rol de proyecto (los permisos van por hoja, ver
     siguiente paso).
   - En la cuenta creada → **Keys** → **Add Key** → **JSON**. Descarga el
     archivo.
3. **Comparte la hoja** con el `client_email` que aparece en el JSON
   descargado, con permiso de **Editor** (botón "Compartir" en Sheets).
4. **Variables de entorno** (ver `.env.example`):
   - `GOOGLE_SHEET_ID` = el ID en la URL de la hoja
     (`docs.google.com/spreadsheets/d/`**`ESTE_ID`**`/edit`).
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = el `client_email` del JSON.
   - `GOOGLE_PRIVATE_KEY` = el `private_key` del JSON, tal cual (con los
     `\n` literales incluidos).

No hay una alternativa local sin conexión a Google — incluso corriendo el
servicio en tu máquina, escribe contra la hoja real. Usa una hoja de
pruebas separada mientras desarrollas.

## Desplegar

Este servicio necesita una URL pública HTTPS para que Shopify le pueda
enviar el webhook:

- **Desarrollo local**: usa `ngrok http 3000` y pon esa URL en el webhook.
- **Producción**: Render funciona bien para un servicio Node pequeño como
  este (ver guía abajo). Railway o Fly.io son alternativas equivalentes.

### Desplegar en Render

Como el almacenamiento es Google Sheets, no hace falta crear ninguna base
de datos en Render — solo el Web Service.

1. **Crear el Web Service**
   - Render Dashboard → **New → Web Service** → conecta el repo de GitHub
     (`dennewsusa-hub/entradaswelder`).
   - Runtime: **Node**.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Starter** (el plan Free "duerme" el servicio tras 15 min de
     inactividad, lo que retrasa la respuesta al webhook).

2. **Variables de entorno** (Settings → Environment):
   - `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
     — ver sección "Configurar Google Sheets" arriba.
   - `SHOPIFY_WEBHOOK_SECRET` = el Client secret de tu custom app.
   - `ADMIN_TOKEN` = un token largo generado por ti.
   - `ENABLE_FREE_ENTRY` = `false` (o `true` solo si ya resolviste el AMOE).
   - No definas `PORT`: Render lo inyecta automáticamente y el código ya
     lo respeta (`src/server.js`).
   - Al pegar `GOOGLE_PRIVATE_KEY` en el panel de Render, deja los `\n`
     como texto literal (dos caracteres, barra invertida + n) — el código
     los convierte a saltos de línea reales al arrancar.

3. **Health check**: en Settings → Health Check Path, usa `/health`
   (ya existe el endpoint).

4. **Configurar el webhook en Shopify** apuntando a
   `https://TU-SERVICIO.onrender.com/webhooks/orders-paid` (ver sección
   de arriba sobre custom apps).

5. **Verificar la persistencia**: después del primer deploy, genera una
   entrada de prueba y confirma que aparece como fila nueva en la hoja de
   Google Sheets.

## Correr localmente

Antes de arrancar necesitas la hoja de Google Sheets configurada (ver
sección "Configurar Google Sheets" arriba) — usa una hoja de pruebas, no la
del cliente.

```bash
npm install
cp .env.example .env   # completa SHOPIFY_WEBHOOK_SECRET, ADMIN_TOKEN y las variables de Google
npm start
```

El encabezado de la hoja se crea/valida solo al arrancar el servicio.

Ver todas las entradas:

```
GET http://localhost:3000/admin/entries?token=TU_ADMIN_TOKEN
```

Exportar a CSV:

```
GET http://localhost:3000/admin/entries.csv?token=TU_ADMIN_TOKEN
```

Sortear un ganador:

```bash
npm run draw -- --count=1
```

## Limitaciones conocidas (v1)

- No hay matching por **tag de producto**, solo por `product_id` /
  `variant_id` — el webhook de `orders/paid` no incluye tags, requeriria una
  llamada extra a la Admin API por pedido. Se puede agregar si lo necesitas.
- No envia email al cliente con su numero de entrada — hoy solo queda
  registrado internamente. Se puede agregar un envio (Shopify email o un
  proveedor externo) en `src/tickets.js` una vez generada la entrada.
