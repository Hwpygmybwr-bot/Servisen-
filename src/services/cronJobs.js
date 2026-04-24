const cron = require("node-cron");
const { prisma } = require("../config/database");
const { sendPushNotification } = require("../config/firebase");
const logger = require("../config/logger");

function initCronJobs() {

  // ── Chaque jour à minuit : créer les mensualités du mois en cours ──────────
  // Vérifie si des prestataires ont atteint le seuil et n'ont pas encore payé
  cron.schedule("0 0 * * *", async () => {
    logger.info("CRON : Vérification mensualités...");
    try {
      const maintenant = new Date();
      const mois = maintenant.getMonth() + 1;
      const annee = maintenant.getFullYear();
      const SEUIL = parseInt(process.env.SEUIL_MISSIONS_MENSUALITE || "5");

      // Trouver tous les prestataires avec mensualités dues non payées
      const mensualitesDues = await prisma.mensualite.findMany({
        where: { mois, annee, payee: false, nbMissions: { gte: SEUIL } },
        include: { prestataire: { select: { fcmToken: true, nom: true, id: true } } },
      });

      for (const m of mensualitesDues) {
        if (m.prestataire.fcmToken) {
          await sendPushNotification(
            m.prestataire.fcmToken,
            "⚠️ Mensualité en attente",
            `Bonjour ${m.prestataire.nom}, votre mensualité de ${m.montantDu} FCFA est due.`,
            { type: "RAPPEL_MENSUALITE", mois: String(mois), annee: String(annee) }
          );
        }
      }

      logger.info(`CRON : ${mensualitesDues.length} rappels mensualité envoyés`);
    } catch (err) {
      logger.error("CRON mensualités erreur:", err);
    }
  });

  // ── Fin de chaque mois (dernier jour à 23h) : rappel mensualité ────────────
  cron.schedule("0 23 28-31 * *", async () => {
    const maintenant = new Date();
    const demain = new Date(maintenant);
    demain.setDate(demain.getDate() + 1);

    // Vérifier que c'est bien le dernier jour du mois
    if (demain.getDate() !== 1) return;

    logger.info("CRON : Rappel fin de mois mensualités...");
    const mois = maintenant.getMonth() + 1;
    const annee = maintenant.getFullYear();
    const SEUIL = parseInt(process.env.SEUIL_MISSIONS_MENSUALITE || "5");

    const mensualitesDues = await prisma.mensualite.findMany({
      where: { mois, annee, payee: false, nbMissions: { gte: SEUIL } },
      include: { prestataire: true },
    });

    for (const m of mensualitesDues) {
      if (m.prestataire.fcmToken) {
        await sendPushNotification(
          m.prestataire.fcmToken,
          "🚨 Dernier rappel mensualité",
          `Dernière chance ! Payez votre mensualité de ${m.montantDu} FCFA avant minuit.`,
          { type: "DERNIER_RAPPEL_MENSUALITE" }
        );
      }
    }
  });

  // ── Expiration missions oubliées (toutes les 5 min) ────────────────────────
  cron.schedule("*/5 * * * *", async () => {
    const DELAI = parseInt(process.env.DELAI_REPONSE_AGENT_MINUTES || "2");
    const dateExpiration = new Date(Date.now() - DELAI * 60 * 1000);

    const missionsExpirees = await prisma.mission.updateMany({
      where: {
        statut: "EN_ATTENTE",
        createdAt: { lt: dateExpiration },
      },
      data: { statut: "EXPIREE" },
    });

    if (missionsExpirees.count > 0) {
      logger.info(`CRON : ${missionsExpirees.count} mission(s) expirée(s)`);
    }
  });

  logger.info("Cron jobs initialisés");
}

module.exports = { initCronJobs };
