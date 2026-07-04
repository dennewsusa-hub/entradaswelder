const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = "entries";
const HEADER = [
  "id",
  "orderId",
  "orderName",
  "customerName",
  "customerEmail",
  "source",
  "grantReason",
  "productTitle",
  "variantTitle",
  "createdAt",
];

function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

const sheets = getSheetsClient();

async function ensureSchema() {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:J1`,
  });
  const currentHeader = (data.values && data.values[0]) || [];
  const matches = HEADER.every((h, i) => currentHeader[i] === h);
  if (!matches) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:J1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] },
    });
  }
}

// entryNumber sale de la posicion de la fila (fila 2 = entrada #1), no de un
// contador propio: asi un `append` de Sheets alcanza para que sea correcto
// sin necesitar leer-y-sumar-uno bajo concurrencia.
function mapRow(row, index) {
  return {
    entryNumber: index + 1,
    id: row[0] || null,
    orderId: row[1] || null,
    orderName: row[2] || null,
    customerName: row[3] || null,
    customerEmail: row[4] || null,
    source: row[5] || null,
    grantReason: row[6] || null,
    productTitle: row[7] || null,
    variantTitle: row[8] || null,
    createdAt: row[9] || null,
  };
}

function entryToRow(partial) {
  return [
    partial.id,
    partial.orderId != null ? String(partial.orderId) : "",
    partial.orderName || "",
    partial.customerName || "",
    partial.customerEmail || "",
    partial.source || "",
    partial.grantReason || "",
    partial.productTitle || "",
    partial.variantTitle || "",
    new Date().toISOString(),
  ];
}

async function getAllEntries() {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:J`,
  });
  const rows = data.values || [];
  return rows.map(mapRow).filter((entry) => entry.id);
}

async function getEntriesByOrderId(orderId) {
  const all = await getAllEntries();
  return all.filter((e) => e.orderId === String(orderId));
}

async function hasEntriesForOrder(orderId) {
  const entries = await getEntriesByOrderId(orderId);
  return entries.length > 0;
}

async function appendEntries(entriesToAdd) {
  if (entriesToAdd.length === 0) return [];
  const values = entriesToAdd.map(entryToRow);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:J`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
  return entriesToAdd.map((partial, i) => ({ ...partial, createdAt: values[i][9] }));
}

// Sheets no tiene una operacion atomica de "verificar e insertar". Serializamos
// aqui todo lo que toca al pedido para que dos entregas concurrentes del mismo
// webhook (Shopify garantiza "al menos una vez", no "exactamente una vez") no
// generen entradas duplicadas.
let mutex = Promise.resolve();
function runExclusive(fn) {
  const result = mutex.then(fn, fn);
  mutex = result.catch(() => {});
  return result;
}

async function addEntriesIfNew(orderId, entriesToAdd) {
  return runExclusive(async () => {
    if (orderId != null && (await hasEntriesForOrder(orderId))) {
      return { created: [], skipped: true };
    }
    const created = await appendEntries(entriesToAdd);
    return { created, skipped: false };
  });
}

async function addEntries(entriesToAdd) {
  return runExclusive(() => appendEntries(entriesToAdd));
}

module.exports = {
  ensureSchema,
  getAllEntries,
  getEntriesByOrderId,
  hasEntriesForOrder,
  addEntries,
  addEntriesIfNew,
};
