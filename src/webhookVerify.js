const crypto = require("crypto");

// Verifica la firma HMAC que Shopify envia en el header X-Shopify-Hmac-Sha256.
// Requiere el rawBody (Buffer) tal cual llego, sin parsear a JSON.
function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;

  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

  const digestBuffer = Buffer.from(digest, "base64");
  const headerBuffer = Buffer.from(hmacHeader, "base64");

  if (digestBuffer.length !== headerBuffer.length) return false;
  return crypto.timingSafeEqual(digestBuffer, headerBuffer);
}

module.exports = { verifyShopifyWebhook };
