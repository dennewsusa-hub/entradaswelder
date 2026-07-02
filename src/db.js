const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "entries.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ nextEntryNumber: 1, entries: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function getAllEntries() {
  return readStore().entries;
}

function getEntriesByOrderId(orderId) {
  return readStore().entries.filter((e) => e.orderId === String(orderId));
}

function hasEntriesForOrder(orderId) {
  return getEntriesByOrderId(orderId).length > 0;
}

// entriesToAdd: array of entry objects without id/entryNumber/createdAt
function addEntries(entriesToAdd) {
  const store = readStore();
  const created = [];
  for (const partial of entriesToAdd) {
    const entry = {
      ...partial,
      entryNumber: store.nextEntryNumber,
      createdAt: new Date().toISOString(),
    };
    store.nextEntryNumber += 1;
    store.entries.push(entry);
    created.push(entry);
  }
  writeStore(store);
  return created;
}

module.exports = {
  getAllEntries,
  getEntriesByOrderId,
  hasEntriesForOrder,
  addEntries,
};
