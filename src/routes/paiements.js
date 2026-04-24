const express = require("express");
const router = express.Router();
const paiementController = require("../controllers/paiementController");
const { authMiddleware, requireType } = require("../middleware/auth");

// Client — abonnement à vie
router.post(
  "/abonnement-client",
  authMiddleware,
  requireType("CLIENT"),
  paiementController.initierAbonnementClient
);

// Prestataire — inscription initiale
router.post(
  "/inscription-prestataire",
  authMiddleware,
  requireType("PRESTATAIRE"),
  paiementController.initierInscriptionPrestataire
);

// Prestataire — mensualité mensuelle
router.post(
  "/mensualite",
  authMiddleware,
  requireType("PRESTATAIRE"),
  paiementController.initierMensualite
);

// Vérification statut (polling)
router.get(
  "/statut/:sessionId",
  authMiddleware,
  paiementController.verifierStatut
);

module.exports = router;
