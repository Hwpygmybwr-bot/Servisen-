// ─── Définir DATABASE_URL AVANT tout require ───────────────
const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_9jGQdBFgvX7s@ep-square-mud-amba6fep-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

process.env.DATABASE_URL = DATABASE_URL;
process.env.NODE_ENV = process.env.NODE_ENV || "production";

// ─── Charger dotenv après ──────────────────────────────────
require("dotenv").config();

// S'assurer que DATABASE_URL n'a pas été écrasé par un .env vide
process.env.DATABASE_URL = DATABASE_URL;

const { execSync } = require("child_process");

console.log("=== ServiSen Backend ===");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("DATABASE_URL définie:", !!process.env.DATABASE_URL);
console.log("PORT:", process.env.PORT || 3000);

const env = { ...process.env };

// ─── Migration ─────────────────────────────────────────────
try {
  console.log("\n🔄 Migration Prisma...");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env,
    timeout: 60000,
  });
  console.log("✅ Migration OK\n");
} catch (err) {
  console.log("⚠️  Migration ignorée:", err.message.split("\n")[0], "\n");
}

// ─── Seed ──────────────────────────────────────────────────
try {
  console.log("🌱 Seed données initiales...");
  execSync("node prisma/seed.js", {
    stdio: "inherit",
    env,
    timeout: 30000,
  });
  console.log("✅ Seed OK\n");
} catch (err) {
  console.log("⚠️  Seed ignoré:", err.message.split("\n")[0], "\n");
}

// ─── Démarrage serveur ─────────────────────────────────────
console.log("🚀 Démarrage serveur...");
require("./src/index.js");
