// Sortea ganador(es) entre TODAS las entradas (compra + entrada gratuita) con
// probabilidad igual por entrada. No le des mas peso a las entradas "purchase":
// eso rompe el requisito legal de odds iguales para un sweepstakes valido.
//
// Uso: node scripts/drawWinner.js [--count=1]

require("dotenv").config();
const db = require("../src/db");

function parseCount(argv) {
  const arg = argv.find((a) => a.startsWith("--count="));
  return arg ? parseInt(arg.split("=")[1], 10) : 1;
}

async function drawWinners(count) {
  const entries = await db.getAllEntries();
  if (entries.length === 0) {
    throw new Error("No hay entradas registradas todavia.");
  }
  if (count > entries.length) {
    throw new Error(`Pediste ${count} ganadores pero solo hay ${entries.length} entradas.`);
  }

  const pool = [...entries];
  const winners = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return winners;
}

if (require.main === module) {
  const count = parseCount(process.argv.slice(2));
  (async () => {
    try {
      const winners = await drawWinners(count);
      const total = await db.getAllEntries();
      console.log(`Total de entradas en el sorteo: ${total.length}`);
      console.log(`Ganador(es):`);
      for (const w of winners) {
        console.log(
          `  #${w.entryNumber} - ${w.customerName} (${w.customerEmail || "sin email"}) - id ${w.id} - origen: ${w.source}`
        );
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}

module.exports = { drawWinners };
