require("dotenv").config();
const express = require("express");
const { v4: uuidv4 } = require("uuid");

const db = require("./db");
const { generateEntriesForOrder } = require("./tickets");
const { verifyShopifyWebhook } = require("./webhookVerify");

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ENABLE_FREE_ENTRY = process.env.ENABLE_FREE_ENTRY === "true";

function requireAdmin(req, res, next) {
  const token = req.query.token || req.headers["x-admin-token"];
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// --- Webhook: orders/paid -----------------------------------------------
// Requiere raw body para poder verificar la firma HMAC de Shopify.
app.post(
  "/webhooks/orders-paid",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
    const isValid = verifyShopifyWebhook(req.body, hmacHeader, WEBHOOK_SECRET);

    if (!isValid) {
      return res.status(401).send("invalid signature");
    }

    let order;
    try {
      order = JSON.parse(req.body.toString("utf8"));
    } catch (err) {
      return res.status(400).send("invalid json");
    }

    try {
      const result = await generateEntriesForOrder(order);
      res.status(200).json({ ok: true, createdCount: result.created.length, skipped: !!result.skipped });
    } catch (err) {
      // 500 hace que Shopify reintente el webhook mas tarde; hasEntriesForOrder
      // evita duplicar entradas cuando el reintento si tenga exito.
      console.error("Error procesando webhook orders/paid:", err);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  }
);

// --- AMOE: entrada gratuita sin compra -----------------------------------
// Apagado por defecto (ver README, seccion "Aviso legal"). Cuando lo actives,
// esta ruta debe quedar enlazada desde un formulario publico accesible sin comprar.
app.post("/entries/free", express.json(), async (req, res) => {
  if (!ENABLE_FREE_ENTRY) {
    return res.status(404).json({ error: "not_enabled" });
  }

  const { name, email } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: "name_required" });
  }

  const [entry] = await db.addEntries([
    {
      id: uuidv4(),
      orderId: null,
      orderName: null,
      customerName: name,
      customerEmail: email || null,
      source: "free_entry",
      grantReason: "amoe",
      productTitle: null,
      variantTitle: null,
    },
  ]);

  res.status(201).json({ ok: true, entry });
});

// --- Admin: consulta y export de entradas --------------------------------
app.get("/admin/entries", requireAdmin, async (req, res) => {
  res.json(await db.getAllEntries());
});

app.get("/admin/entries/:orderId", requireAdmin, async (req, res) => {
  res.json(await db.getEntriesByOrderId(req.params.orderId));
});

app.get("/admin/entries.csv", requireAdmin, async (req, res) => {
  const entries = await db.getAllEntries();
  const header = "entryNumber,id,orderName,customerName,customerEmail,source,grantReason,createdAt";
  const rows = entries.map((e) =>
    [e.entryNumber, e.id, e.orderName, e.customerName, e.customerEmail, e.source, e.grantReason, e.createdAt]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  res.set("Content-Type", "text/csv");
  res.send([header, ...rows].join("\n"));
});

app.get("/health", (req, res) => res.json({ ok: true }));

db.ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Sweepstakes service escuchando en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("No se pudo inicializar el esquema de la base de datos:", err);
    process.exit(1);
  });
