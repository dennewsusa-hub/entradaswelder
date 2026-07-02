const fs = require("fs");
const path = require("path");

const RULES_FILE = path.join(__dirname, "..", "rules.json");

function loadRules() {
  const raw = JSON.parse(fs.readFileSync(RULES_FILE, "utf8"));
  const strip = (obj) => {
    const clean = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (k === "_comment") continue;
      clean[k] = v;
    }
    return clean;
  };
  return {
    byProductId: strip(raw.byProductId),
    byVariantId: strip(raw.byVariantId),
    productQuantityTiers: strip(raw.productQuantityTiers),
    variantQuantityTiers: strip(raw.variantQuantityTiers),
    quantityTiers: strip(raw.quantityTiers),
  };
}

// Busca en un mapa de tiers { "id": { "1": 20, "3": 70 } } el valor plano
// correspondiente al umbral de cantidad mas alto alcanzado por ese line item.
// Devuelve null si el id no tiene tiers configurados.
function lookupQuantityTier(tiersById, id, quantity) {
  if (!id || !tiersById[id]) return null;

  const tiers = tiersById[id];
  const thresholds = Object.keys(tiers)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);

  let best = null;
  for (const threshold of thresholds) {
    if (quantity >= threshold) best = threshold;
  }

  return best != null ? tiers[String(best)] : null;
}

// Devuelve una lista de "otorgamientos": { ticketCount, reason, lineItemId, productId, variantId }
function evaluateOrder(order) {
  const rules = loadRules();
  const grants = [];
  let totalQuantity = 0;

  for (const item of order.line_items || []) {
    totalQuantity += item.quantity;

    const productId = item.product_id != null ? String(item.product_id) : null;
    const variantId = item.variant_id != null ? String(item.variant_id) : null;

    // Prioridad: tier plano por variante > tier plano por producto >
    // multiplicador lineal por variante > multiplicador lineal por producto.
    // Un "tier" da un total fijo para ese umbral (no se multiplica por
    // cantidad); el multiplicador lineal si se multiplica por cantidad.
    const variantTier = lookupQuantityTier(rules.variantQuantityTiers, variantId, item.quantity);
    const productTier = lookupQuantityTier(rules.productQuantityTiers, productId, item.quantity);

    let ticketCount = null;
    let reason = null;

    if (variantTier != null) {
      ticketCount = variantTier;
      reason = "line_item_tier";
    } else if (productTier != null) {
      ticketCount = productTier;
      reason = "line_item_tier";
    } else if (variantId && rules.byVariantId[variantId] != null) {
      ticketCount = rules.byVariantId[variantId] * item.quantity;
      reason = "line_item";
    } else if (productId && rules.byProductId[productId] != null) {
      ticketCount = rules.byProductId[productId] * item.quantity;
      reason = "line_item";
    }

    if (ticketCount > 0) {
      grants.push({
        ticketCount,
        reason,
        lineItemId: item.id,
        productId,
        variantId,
        productTitle: item.title,
        variantTitle: item.variant_title || null,
      });
    }
  }

  // Tier de cantidad total: se toma el umbral mas alto alcanzado, no acumulativo.
  const tierThresholds = Object.keys(rules.quantityTiers)
    .map(Number)
    .sort((a, b) => a - b);

  let bestTier = null;
  for (const threshold of tierThresholds) {
    if (totalQuantity >= threshold) bestTier = threshold;
  }

  if (bestTier != null) {
    grants.push({
      ticketCount: rules.quantityTiers[String(bestTier)],
      reason: "quantity_tier",
      threshold: bestTier,
      totalQuantity,
    });
  }

  return grants;
}

module.exports = { loadRules, evaluateOrder };
