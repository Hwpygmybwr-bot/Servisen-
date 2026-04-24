const { prisma } = require("../config/database");
const { creerSessionWave } = require("../services/waveService");
const logger = require("../config/logger");

// ──────────────────────────────────────────────────────────
// POST /api/paiements/abonnement-client
// Crée une session Wave pour l'abonnement client à vie (1000 FCFA)
// ──────────────────────────────────────────────────────────
exports.initierAbonnementClient = async (req, res) => {
  const clientId = req.user.userId;

  // Vérifier qu'il n'est pas déjà abonné
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (client?.abonne) {
    return res.status(400).json({ success: false, message: "Vous êtes déjà abonné à vie." });
  }

  const montant = parseInt(process.env.TARIF_ABONNEMENT_CLIENT || "1000");

  // Créer le paiement en BDD (statut EN_ATTENTE)
  const paiement = await prisma.paiement.create({
    data: {
      waveSessionId: `temp_${Date.now()}`, // sera mis à jour avec le vrai ID Wave
      montant,
      typePaiement: "ABONNEMENT_CLIENT",
      clientId,
    },
  });

  // Créer la session Wave Checkout
  const session = await creerSessionWave({
    montant,
    description: "Abonnement à vie ServiSen",
    referenceInterne: paiement.id,
  });

  // Mettre à jour avec le vrai session ID Wave
  await prisma.paiement.update({
    where: { id: paiement.id },
    data: { waveSessionId: session.sessionId },
  });

  res.json({
    success: true,
    waveUrl: session.waveUrl,
    sessionId: session.sessionId,
    paiementId: paiement.id,
    montant,
    expiresAt: session.expiresAt,
  });
};

// ──────────────────────────────────────────────────────────
// POST /api/paiements/inscription-prestataire
// 2000 FCFA (individuel) ou 4000 FCFA (entreprise)
// ──────────────────────────────────────────────────────────
exports.initierInscriptionPrestataire = async (req, res) => {
  const prestataireId = req.user.userId;

  const prestataire = await prisma.prestataire.findUnique({ where: { id: prestataireId } });
  if (!prestataire) return res.status(404).json({ success: false, message: "Prestataire introuvable." });
  if (prestataire.actif) return res.status(400).json({ success: false, message: "Compte déjà activé." });

  const montant = prestataire.typeCompte === "ENTREPRISE"
    ? parseInt(process.env.TARIF_INSCRIPTION_ENTREPRISE || "4000")
    : parseInt(process.env.TARIF_INSCRIPTION_INDIVIDUEL || "2000");

  const paiement = await prisma.paiement.create({
    data: {
      waveSessionId: `temp_${Date.now()}`,
      montant,
      typePaiement: "INSCRIPTION_PRESTATAIRE",
      prestataireId,
    },
  });

  const session = await creerSessionWave({
    montant,
    description: `Inscription prestataire ServiSen (${prestataire.typeCompte})`,
    referenceInterne: paiement.id,
  });

  await prisma.paiement.update({
    where: { id: paiement.id },
    data: { waveSessionId: session.sessionId },
  });

  res.json({ success: true, waveUrl: session.waveUrl, sessionId: session.sessionId, paiementId: paiement.id, montant });
};

// ──────────────────────────────────────────────────────────
// POST /api/paiements/mensualite
// Prestataire paie sa mensualité du mois (si ≥ 5 missions)
// ──────────────────────────────────────────────────────────
exports.initierMensualite = async (req, res) => {
  const prestataireId = req.user.userId;
  const { mois, annee } = req.body;

  const moisCible = mois || new Date().getMonth() + 1;
  const anneeCible = annee || new Date().getFullYear();

  const mensualite = await prisma.mensualite.findUnique({
    where: { prestataireId_mois_annee: { prestataireId, mois: moisCible, annee: anneeCible } },
    include: { prestataire: true },
  });

  if (!mensualite) {
    return res.status(404).json({ success: false, message: "Aucune mensualité due ce mois-ci." });
  }

  const SEUIL = parseInt(process.env.SEUIL_MISSIONS_MENSUALITE || "5");
  if (mensualite.nbMissions < SEUIL) {
    return res.status(400).json({
      success: false,
      message: `Mensualité non due. Vous avez ${mensualite.nbMissions}/${SEUIL} missions ce mois.`,
    });
  }

  if (mensualite.payee) {
    return res.status(400).json({ success: false, message: "Mensualité déjà payée ce mois." });
  }

  const paiement = await prisma.paiement.create({
    data: {
      waveSessionId: `temp_${Date.now()}`,
      montant: mensualite.montantDu,
      typePaiement: "MENSUALITE_PRESTATAIRE",
      prestataireId,
      mensualiteId: mensualite.id,
    },
  });

  const moisNom = new Date(anneeCible, moisCible - 1).toLocaleString("fr-FR", { month: "long" });

  const session = await creerSessionWave({
    montant: mensualite.montantDu,
    description: `Mensualité ServiSen – ${moisNom} ${anneeCible}`,
    referenceInterne: paiement.id,
  });

  await prisma.paiement.update({
    where: { id: paiement.id },
    data: { waveSessionId: session.sessionId },
  });

  res.json({
    success: true,
    waveUrl: session.waveUrl,
    montant: mensualite.montantDu,
    mois: moisCible,
    annee: anneeCible,
    nbMissions: mensualite.nbMissions,
  });
};

// ──────────────────────────────────────────────────────────
// GET /api/paiements/statut/:sessionId
// Vérifie le statut d'un paiement (polling si webhook non reçu)
// ──────────────────────────────────────────────────────────
exports.verifierStatut = async (req, res) => {
  const { sessionId } = req.params;

  const paiement = await prisma.paiement.findFirst({
    where: { waveSessionId: sessionId },
  });

  if (!paiement) return res.status(404).json({ success: false, message: "Paiement introuvable." });

  res.json({ success: true, statut: paiement.statut, paiement });
};
