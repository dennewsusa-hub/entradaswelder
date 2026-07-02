const { v4: uuidv4 } = require("uuid");
const db = require("./db");
const { evaluateOrder } = require("./rules");

function resolveCustomerName(order) {
  if (order.customer && (order.customer.first_name || order.customer.last_name)) {
    return [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ");
  }
  if (order.billing_address && order.billing_address.name) {
    return order.billing_address.name;
  }
  return order.email || "Cliente sin nombre";
}

// Idempotente: si el pedido ya genero entradas (ej. Shopify reintento el webhook), no duplica.
function generateEntriesForOrder(order) {
  const orderId = String(order.id);

  if (db.hasEntriesForOrder(orderId)) {
    return { created: [], skipped: true, reason: "order_already_processed" };
  }

  const grants = evaluateOrder(order);
  if (grants.length === 0) {
    return { created: [], skipped: true, reason: "no_matching_rules" };
  }

  const customerName = resolveCustomerName(order);
  const customerEmail = order.email || null;
  const orderName = order.name || orderId;

  const entriesToCreate = [];
  for (const grant of grants) {
    for (let i = 0; i < grant.ticketCount; i++) {
      entriesToCreate.push({
        id: uuidv4(),
        orderId,
        orderName,
        customerName,
        customerEmail,
        source: "purchase",
        grantReason: grant.reason,
        productTitle: grant.productTitle || null,
        variantTitle: grant.variantTitle || null,
      });
    }
  }

  const created = db.addEntries(entriesToCreate);
  return { created, skipped: false };
}

module.exports = { generateEntriesForOrder, resolveCustomerName };
