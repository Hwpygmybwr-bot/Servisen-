const { PrismaClient } = require("@prisma/client");

// Railway fournit DATABASE_URL via ses variables d'environnement
// On force la valeur ici en fallback pour éviter tout problème
const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_9jGQdBFgvX7s@ep-square-mud-amba6fep-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Injecter dans process.env au cas où Railway ne l'a pas transmis
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

module.exports = { prisma };
