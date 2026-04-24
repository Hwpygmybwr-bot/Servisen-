const { prisma } = require("../config/database");
const { sendPushNotification } = require("../config/firebase");
const logger = require("../config/logger");

const DELAI_EXPIRATION_MINUTES = parseInt(process.env.DELAI_REPONSE_AGENT_MINUTES || "2");

// ──────────────────────────────────────────────────────────
// POST /api/missions
// Client envoie une demande de mission à un prestataire
// ──────────────────────────────────────────────────────────
exports.creerMission = async (req, res) => {
  const { prestataireId, description, photoUrl } = req.body;
  const clientId = req.user.userId;

  // Vérifier que le client est abonné
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client?.abonne) {
    return res.status(403).json({ success: false, message: "Abonnement requis pour envoyer une mission." });
  }

  // Vérifier que le prestataire existe et est disponible
  const prestataire = await prisma.prestataire.findUnique({ where: { id: prestataireId } });
  if (!prestataire) {
    return res.status(404).json({ success: false, message: "Prestataire introuvable." });
  }
  if (!prestataire.disponible) {
    return res.status(400).json({ success: false, message: "Ce prestataire n'est pas disponible." });
  }
  if (!prestataire.actif) {
    return res.status(400).json({ success: false, message: "Ce prestataire n'est pas encore activé." });
  }
  if (prestataire.bloque) {
    return res.status(400).json({ success: false, message: "Ce prestataire est indisponible." });
  }

  // Vérifier qu'il n'y a pas déjà une mission EN_ATTENTE avec ce prestataire
  const missionEnCours = await prisma.mission.findFirst({
    where: { clientId, prestataireId, statut: "EN_ATTENTE" },
  });
  if (missionEnCours) {
    return res.status(400).json({ success: false, message: "Vous avez déjà une demande en attente avec cet agent." });
  }

  // Créer la mission
  const mission = await prisma.mission.create({
    data: { clientId, prestataireId, description, photoUrl },
    include: {
      client: { select: { nom: true, prenom: true, region: true, ville: true, quartier: true } },
      prestataire: { select: { nom: true, metier: true, fcmToken: true } },
    },
  });

  // Notifier le prestataire via push notification
  if (prestataire.fcmToken) {
    await sendPushNotification(
      prestataire.fcmToken,
      "🔔 Nouvelle mission !",
      `${client.prenom} ${client.nom} : "${description.substring(0, 80)}…"`,
      { type: "NOUVELLE_MISSION", missionId: mission.id }
    );
  }

  // Notifier via Socket.IO (temps réel)
  const io = req.app.get("io");
  io.to(`PRESTATAIRE_${prestataireId}`).emit("nouvelle_mission", {
    mission: {
      id: mission.id,
      description,
      photoUrl,
      client: { nom: client.nom, prenom: client.prenom, region: client.region, ville: client.ville, quartier: client.quartier },
      createdAt: mission.createdAt,
    },
  });

  // Programmer l'expiration automatique après DELAI_EXPIRATION_MINUTES
  setTimeout(async () => {
    const missionActuelle = await prisma.mission.findUnique({ where: { id: mission.id } });
    if (missionActuelle?.statut === "EN_ATTENTE") {
      await prisma.mission.update({ where: { id: mission.id }, data: { statut: "EXPIREE" } });

      // Notifier le client que la mission a expiré
      if (client.fcmToken) {
        await sendPushNotification(
          client.fcmToken,
          "Mission expirée",
          `${prestataire.nom} n'a pas répondu. Contactez un autre prestataire.`,
          { type: "MISSION_EXPIREE", missionId: mission.id }
        );
      }
      io.to(`CLIENT_${clientId}`).emit("mission_expiree", { missionId: mission.id });
      logger.info(`Mission ${mission.id} expirée automatiquement`);
    }
  }, DELAI_EXPIRATION_MINUTES * 60 * 1000);

  logger.info(`Mission ${mission.id} créée — Client: ${clientId} → Prestataire: ${prestataireId}`);

  res.status(201).json({ success: true, mission });
};

// ──────────────────────────────────────────────────────────
// PUT /api/missions/:id/accepter
// Le prestataire accepte la mission
// ──────────────────────────────────────────────────────────
exports.accepterMission = async (req, res) => {
  const { id } = req.params;
  const prestataireId = req.user.userId;

  const mission = await prisma.mission.findUnique({
    where: { id },
    include: {
      client: true,
      prestataire: true,
    },
  });

  if (!mission) return res.status(404).json({ success: false, message: "Mission introuvable." });
  if (mission.prestataireId !== prestataireId) return res.status(403).json({ success: false, message: "Non autorisé." });
  if (mission.statut !== "EN_ATTENTE") {
    return res.status(400).json({ success: false, message: `Mission déjà ${mission.statut.toLowerCase()}.` });
  }

  // Mettre à jour la mission
  const missionUpdated = await prisma.mission.update({
    where: { id },
    data: { statut: "ACCEPTEE", acceptedAt: new Date() },
    include: { client: { select: { nom: true, prenom: true, telephone: true } } },
  });

  // Incrémenter le compteur de missions du prestataire
  await prisma.prestataire.update({
    where: { id: prestataireId },
    data: { totalMissions: { increment: 1 } },
  });

  // Mettre à jour la mensualité du mois en cours
  await incrementerMensualite(prestataireId, mission.prestataire.typeCompte);

  // Notifier le CLIENT avec les coordonnées du prestataire
  const io = req.app.get("io");
  io.to(`CLIENT_${mission.clientId}`).emit("mission_acceptee", {
    missionId: id,
    prestataire: {
      nom: mission.prestataire.nom,
      telephone: mission.prestataire.telephone, // le numéro est révélé ici
      metier: mission.prestataire.metier,
    },
  });

  if (mission.client.fcmToken) {
    await sendPushNotification(
      mission.client.fcmToken,
      "✅ Mission acceptée !",
      `${mission.prestataire.nom} a accepté. Il vous appellera dans 1 à 2 minutes.`,
      { type: "MISSION_ACCEPTEE", missionId: id }
    );
  }

  logger.info(`Mission ${id} acceptée par prestataire ${prestataireId}`);

  // Retourner les coordonnées du client au prestataire
  res.json({
    success: true,
    message: "Mission acceptée. Appelez le client maintenant.",
    mission: missionUpdated,
    client: {
      nom: missionUpdated.client.nom,
      prenom: missionUpdated.client.prenom,
      telephone: missionUpdated.client.telephone,
    },
  });
};

// ──────────────────────────────────────────────────────────
// PUT /api/missions/:id/refuser
// Le prestataire refuse la mission
// ──────────────────────────────────────────────────────────
exports.refuserMission = async (req, res) => {
  const { id } = req.params;
  const { raison } = req.body;
  const prestataireId = req.user.userId;

  const mission = await prisma.mission.findUnique({
    where: { id },
    include: { client: true, prestataire: true },
  });

  if (!mission) return res.status(404).json({ success: false, message: "Mission introuvable." });
  if (mission.prestataireId !== prestataireId) return res.status(403).json({ success: false, message: "Non autorisé." });
  if (mission.statut !== "EN_ATTENTE") {
    return res.status(400).json({ success: false, message: `Mission déjà ${mission.statut.toLowerCase()}.` });
  }

  await prisma.mission.update({
    where: { id },
    data: { statut: "REFUSEE", refusedAt: new Date(), refusRaison: raison },
  });

  // Notifier le client
  const io = req.app.get("io");
  io.to(`CLIENT_${mission.clientId}`).emit("mission_refusee", { missionId: id });

  if (mission.client.fcmToken) {
    await sendPushNotification(
      mission.client.fcmToken,
      "Mission refusée",
      `${mission.prestataire.nom} n'est pas disponible. Contactez un autre prestataire.`,
      { type: "MISSION_REFUSEE", missionId: id }
    );
  }

  logger.info(`Mission ${id} refusée par prestataire ${prestataireId}`);
  res.json({ success: true, message: "Mission refusée." });
};

// ──────────────────────────────────────────────────────────
// GET /api/missions/client
// Historique des missions du client connecté
// ──────────────────────────────────────────────────────────
exports.getMissionsClient = async (req, res) => {
  const clientId = req.user.userId;
  const { page = 1, limit = 20, statut } = req.query;

  const where = { clientId, ...(statut && { statut }) };

  const [missions, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      include: { prestataire: { select: { nom: true, metier: true, photo: true, noteAverage: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    }),
    prisma.mission.count({ where }),
  ]);

  res.json({ success: true, missions, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
};

// ──────────────────────────────────────────────────────────
// GET /api/missions/prestataire
// Missions reçues par le prestataire connecté
// ──────────────────────────────────────────────────────────
exports.getMissionsPrestataire = async (req, res) => {
  const prestataireId = req.user.userId;
  const { page = 1, limit = 20, statut } = req.query;

  const where = { prestataireId, ...(statut && { statut }) };

  const [missions, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      include: {
        client: { select: { nom: true, prenom: true, region: true, ville: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    }),
    prisma.mission.count({ where }),
  ]);

  res.json({ success: true, missions, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
};

// ──────────────────────────────────────────────────────────
// Fonction interne : gestion mensualité
// ──────────────────────────────────────────────────────────
async function incrementerMensualite(prestataireId, typeCompte) {
  const maintenant = new Date();
  const mois = maintenant.getMonth() + 1;
  const annee = maintenant.getFullYear();

  const SEUIL = parseInt(process.env.SEUIL_MISSIONS_MENSUALITE || "5");
  const montant = typeCompte === "ENTREPRISE"
    ? parseInt(process.env.TARIF_MENSUALITE_ENTREPRISE || "2500")
    : parseInt(process.env.TARIF_MENSUALITE_INDIVIDUEL || "500");

  const mensualite = await prisma.mensualite.upsert({
    where: { prestataireId_mois_annee: { prestataireId, mois, annee } },
    update: { nbMissions: { increment: 1 } },
    create: { prestataireId, mois, annee, nbMissions: 1, montantDu: montant },
  });

  // Si le prestataire atteint exactement le seuil → envoyer notification
  if (mensualite.nbMissions === SEUIL) {
    const prestataire = await prisma.prestataire.findUnique({ where: { id: prestataireId } });
    if (prestataire?.fcmToken) {
      await sendPushNotification(
        prestataire.fcmToken,
        "💰 Mensualité due",
        `Vous avez atteint ${SEUIL} missions ce mois. Renouvelez votre abonnement (${montant} FCFA).`,
        { type: "MENSUALITE_DUE", mois: String(mois), annee: String(annee), montant: String(montant) }
      );
    }
  }
}
