// Injecter DATABASE_URL avant Prisma
const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_9jGQdBFgvX7s@ep-square-mud-amba6fep-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
process.env.DATABASE_URL = DATABASE_URL;

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});

async function main() {
  console.log("🌱 Initialisation des paramètres ServiSen...");

  const parametres = [
    { cle: "DELAI_REPONSE_AGENT_MINUTES", valeur: "2",    label: "Délai réponse agent (minutes)" },
    { cle: "SEUIL_MISSIONS_MENSUALITE",   valeur: "5",    label: "Seuil missions pour mensualité" },
    { cle: "TARIF_ABONNEMENT_CLIENT",     valeur: "1000", label: "Abonnement client à vie (FCFA)" },
    { cle: "TARIF_INSCRIPTION_INDIVIDUEL",valeur: "2000", label: "Inscription individuel (FCFA)" },
    { cle: "TARIF_INSCRIPTION_ENTREPRISE",valeur: "4000", label: "Inscription entreprise (FCFA)" },
    { cle: "TARIF_MENSUALITE_INDIVIDUEL", valeur: "500",  label: "Mensualité individuel (FCFA)" },
    { cle: "TARIF_MENSUALITE_ENTREPRISE", valeur: "2500", label: "Mensualité entreprise (FCFA)" },
    {
      cle: "POLITIQUE_CONFIDENTIALITE",
      valeur: "En souscrivant à ServiSen, vous acceptez que le paiement soit définitif et non remboursable.",
      label: "Politique de confidentialité"
    },
  ];

  for (const p of parametres) {
    await prisma.parametre.upsert({
      where: { cle: p.cle },
      update: { valeur: p.valeur, label: p.label },
      create: p,
    });
    console.log("  ✓", p.cle);
  }

  console.log("✅ Paramètres initialisés avec succès !");
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
