const express = require("express");
const router = express.Router();
const { prisma } = require("../config/database");
const { verifierSignatureWebhook } = require("../services/waveService");
const { sendPushNotification } = require("../config/firebase");
const logger = require("../config/logger");

// ──────────────────────────────────────────────────────────
// POST /api/webhook/wave
// Wave envoie cet appel après chaque paiement
// Le body est RAW (configuré dans index.js)
// ──────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const signature = req.headers["wave-signature"] || req.headers["x-wave-signature"] || "";
  const rawBody = req.body; // Buffer

  // 1. Vérifier la signature Wave
  const signatureValide = verifierSignatureWebhook(rawBody, signature);
  if (!signatureValide) {
    logger.warn("Webhook Wave : signature invalide");
    return res.status(401).json({ error: "Signature invalide" });
  }

  // 2. Parser le body
  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: "Body invalide" });
  }

  logger.info(`Webhook Wave reçu : ${event.type} — session: ${event.data?.id}`);

  // 3. Traiter uniquement les paiements réussis
  if (event.type !== "checkout.session.completed" && event.type !== "payment.succeeded") {
    return res.json({ received: true }); // Ignorer les autres événements
  }

  const sessionId = event.data?.id || event.data?.checkout_session_id;
  const paymentStatus = event.data?.payment_status || event.data?.status;

  if (paymentStatus !== "succeeded" && paymentStatus !== "complete") {
    logger.info(`Paiement non réussi : ${paymentStatus}`);
    return res.json({ received: true });
  }

  // 4. Trouver le paiement dans notre BDD via client_reference ou session ID
  const paiement = await prisma.paiement.findFirst({
    where: {
      OR: [
        { waveSessionId: sessionId },
        { waveSessionId: event.data?.client_reference },
      ],
      statut: "EN_ATTENTE",
    },
  });

  if (!paiement) {
    logger.warn(`Paiement introuvable pour session Wave: ${sessionId}`);
    return res.status(200).json({ received: true }); // Répondre 200 quand même pour éviter les retry Wave
  }

  // 5. Marquer le webhook comme reçu (idempotence)
  if (paiement.webhookRecu) {
    logger.info(`Webhook déjà traité pour paiement ${paiement.id}`);
    return res.json({ received: true });
  }

  // 6. Mettre à jour le paiement
  await prisma.paiement.update({
    where: { id: paiement.id },
    data: {
      statut: "SUCCES",
      wavePaymentId: event.data?.payment_id || event.data?.id,
      webhookRecu: true,
    },
  });

  // 7. Activer l'utilisateur selon le type de paiement
  await traiterPaiementSucces(paiement, req.app.get("io"));

  // Wave attend une réponse 200 rapide
  res.json({ received: true });
});

// ──────────────────────────────────────────────────────────
// Logique d'activation après paiement réussi
// ──────────────────────────────────────────────────────────
async function traiterPaiementSucces(paiement, io) {
  try {
    switch (paiement.typePaiement) {

      case "ABONNEMENT_CLIENT": {
        const client = await prisma.client.update({
          where: { id: paiement.clientId },
          data: { abonne: true, dateAbonnement: new Date() },
        });
        logger.info(`Client ${client.id} abonné à vie`);

        // Notifier le client via Socket.IO
        if (io) io.to(`CLIENT_${client.id}`).emit("paiement_succes", { type: "ABONNEMENT_CLIENT" });

        // Push notification
        if (client.fcmToken) {
          await sendPushNotification(
            client.fcmToken,
            "✅ Abonnement activé !",
            "Votre accès à vie ServiSen est activé. Trouvez votre prestataire !",
            { type: "ABONNEMENT_ACTIVE" }
          );
        }
        break;
      }

      case "INSCRIPTION_PRESTATAIRE": {
        const prestataire = await prisma.prestataire.update({
          where: { id: paiement.prestataireId },
          data: { actif: true },
        });
        logger.info(`Prestataire ${prestataire.id} activé`);

        if (io) io.to(`PRESTATAIRE_${prestataire.id}`).emit("paiement_succes", { type: "INSCRIPTION_PRESTATAIRE" });

        if (prestataire.fcmToken) {
          await sendPushNotification(
            prestataire.fcmToken,
            "✅ Compte activé !",
            "Votre compte prestataire ServiSen est actif. Commencez à recevoir des missions !",
            { type: "COMPTE_ACTIVE" }
          );
        }
        break;
      }

      case "MENSUALITE_PRESTATAIRE": {
        const mensualite = await prisma.mensualite.update({
          where: { id: paiement.mensualiteId },
          data: { payee: true, datePaiement: new Date() },
          include: { prestataire: true },
        });
        logger.info(`Mensualité ${mensualite.id} payée`);

        if (io) io.to(`PRESTATAIRE_${mensualite.prestataireId}`).emit("paiement_succes", { type: "MENSUALITE_PAYEE" });

        if (mensualite.prestataire.fcmToken) {
          await sendPushNotification(
            mensualite.prestataire.fcmToken,
            "✅ Mensualité payée",
            `Votre abonnement mensuel est renouvelé. Continuez à recevoir des missions !`,
            { type: "MENSUALITE_RENOUVELEE" }
          );
        }
        break;
      }
    }
  } catch (err) {
    logger.error("Erreur traitement paiement:", err);
  }
}

module.exports = router;
