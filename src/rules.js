// Decide cuantas entradas de sweepstakes otorga un pedido segun una tabla que
// el cliente edita en la pestaña "rules" del mismo Google Sheet: cada fila es
// un nombre de producto y cuantas entradas da por unidad comprada.
// Sin codigo, sin IDs, sin Admin API de Shopify.

const db = require("./db");

// Devuelve una lista de "otorgamientos": { ticketCount, reason, ... } por cada
// line item cuyo producto aparezca en la tabla de reglas con un valor > 0.
async function evaluateOrder(order) {
  const rulesByTitle = await db.getProductRules();
  const grants = [];

  for (const item of order.line_items || []) {
    const title = (item.title || "").trim().toLowerCase();
    if (!title) continue;

    const perUnit = rulesByTitle.get(title) || 0;
    const ticketCount = perUnit * item.quantity;
    if (ticketCount > 0) {
      grants.push({
        ticketCount,
        reason: "product_rule",
        lineItemId: item.id,
        productId: item.product_id != null ? String(item.product_id) : null,
        variantId: item.variant_id != null ? String(item.variant_id) : null,
        productTitle: item.title,
        variantTitle: item.variant_title || null,
      });
    }
  }

  return grants;
}

module.exports = { evaluateOrder };
