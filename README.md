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
2. `src/rules.js` lee `rules.json` y decide cuantas entradas corresponden
   segun el `product_id`, `variant_id` o la cantidad total del pedido.
3. `src/tickets.js` genera una entrada individual (UUID + numero secuencial)
   por cada "boleta" ganada, con el nombre y email del cliente.
4. Todo se guarda en `data/entries.json` (se crea solo, no se versiona).
5. `/admin/entries` y `/admin/entries.csv` permiten consultarlas.

## Configurar las reglas (`rules.json`)

No requiere tocar codigo, solo editar el JSON:

```json
{
  "byProductId": { "1234567890123": 1 },
  "byVariantId": { "9876543210987": 2 },
  "productQuantityTiers": { "1111111111111": { "1": 20 }, "2222222222222": { "1": 100 } },
  "variantQuantityTiers": {},
  "quantityTiers": { "3": 1, "5": 3, "10": 8 }
}
```

Hay dos formas de calcular entradas por producto/variante, y son distintas:

- `byProductId` / `byVariantId` — **lineal**: entradas por cada unidad
  comprada. Comprar 3 unidades de un producto con valor `5` da 15 entradas
  (5 × 3). `byVariantId` tiene prioridad si ambos matchean.
- `productQuantityTiers` / `variantQuantityTiers` — **plano, no lineal**:
  el numero es el TOTAL de entradas para ese tramo de cantidad, no se
  multiplica. Es el modelo tipo "Silver ticket = 20 entradas", "Gold = 100
  entradas" que se ve en paginas de giveaway de productos por SKU (cada
  ticket es su propio producto). Si defines varios tramos, ej.
  `{ "1": 20, "3": 70 }`, comprar 1 unidad da 20 entradas planas, comprar 3
  o mas da 70 planas (no 20×3=60). `variantQuantityTiers` tiene la
  prioridad mas alta de las cuatro reglas.
- `quantityTiers`: entradas bono segun la cantidad TOTAL de unidades del
  pedido, sin importar el producto (se usa el umbral mas alto alcanzado,
  no se suman todos). Se suma aparte de cualquiera de las reglas anteriores.

Orden de prioridad por line item: `variantQuantityTiers` > `productQuantityTiers`
> `byVariantId` > `byProductId`. Si ninguna matchea, ese producto no genera
entradas.

Para obtener los `product_id` / `variant_id` reales: Shopify Admin →
Productos → abre el producto → el ID aparece en la URL
(`admin/products/<product_id>`); para variantes, en el Admin API o
inspeccionando el JSON del producto.

## Configurar el custom app en Shopify (plan Basic)

El plan Basic sí permite crear **custom apps** con acceso a la Admin API —
no necesitas subir nada al App Store.

1. Shopify Admin → **Settings → Apps and sales channels → Develop apps**.
2. **Create an app**, dale un nombre (ej. "Sweepstakes entries").
3. En **Configuration → Admin API scopes**, no necesitas scopes de lectura
   especiales para *recibir* el webhook (el payload ya trae line items y
   customer). Si luego quieres consultar tags de producto, agrega
   `read_products`.
4. Pestaña **API credentials** → copia el **Client secret**. Ese valor va en
   `SHOPIFY_WEBHOOK_SECRET` en tu `.env`.
5. Instala la app en la tienda (botón **Install app**).
6. Crea el webhook apuntando a tu servidor público (ver despliegue abajo):
   - Vía Admin API (GraphQL `webhookSubscriptionCreate` o REST
     `POST /admin/api/2024-XX/webhooks.json`), topic `orders/paid`, formato
     `json`, `address: https://TU-DOMINIO/webhooks/orders-paid`.
   - O vía **Settings → Notifications → Webhooks** en el admin (interfaz
     legada, mismo resultado).

## Desplegar

Este servicio necesita una URL pública HTTPS para que Shopify le pueda
enviar el webhook:

- **Desarrollo local**: usa `ngrok http 3000` y pon esa URL en el webhook.
- **Producción**: Render, Railway o Fly.io funcionan bien para un servicio
  Node pequeño como este. Sube este proyecto como repo y despliega desde ahí.

## Correr localmente

```bash
npm install
cp .env.example .env   # y completa SHOPIFY_WEBHOOK_SECRET y ADMIN_TOKEN
npm start
```

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
- El almacenamiento es un archivo JSON (`data/entries.json`), suficiente
  para volumen bajo/medio. Si el volumen crece, migrar a Postgres/SQLite es
  directo porque toda la logica pasa por `src/db.js`.
- No envia email al cliente con su numero de entrada — hoy solo queda
  registrado internamente. Se puede agregar un envio (Shopify email o un
  proveedor externo) en `src/tickets.js` una vez generada la entrada.
