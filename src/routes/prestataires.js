const express = require("express");
const router = express.Router();
const { prisma } = require("../config/database");
const { authMiddleware, requireType } = require("../middleware/auth");
const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────────────────
// POST /api/prestataires/inscription
// ─────────────────────────────────────────────────────────
router.post("/inscription", async (req, res) => {
  const { telephone, nom, typeCompte, metier, region, ville, quartier, description } = req.body;

  if (!telephone || !nom || !metier || !region) {
    return res.status(400).json({ success: false, message: "Champs obligatoires manquants." });
  }

  const tel = telephone.startsWith("+") ? telephone : `+221${telephone.replace(/^0+/, "")}`;

  const existant = await prisma.prestataire.findUnique({ where: { telephone: tel } });
  if (existant) {
    return res.status(400).json({ success: false, message: "Ce numéro est déjà inscrit." });
  }

  const prestataire = await prisma.prestataire.create({
    data: {
      telephone: tel,
      nom,
      typeCompte: typeCompte || "INDIVIDUEL",
      metier,
      region,
      ville: ville || null,
      quartier: quartier || null,
      description: description || null,
    },
  });

  const token = jwt.sign(
    { userId: prestataire.id, typeUtilisateur: "PRESTATAIRE", telephone: tel },
    process.env.JWT_SECRET || "servisen_jwt_xK9pL2mN8vQ3rT5sY7wZ2024_b46af",
    { expiresIn: "30d" }
  );

  res.status(201).json({ success: true, prestataire, token });
});

// ─────────────────────────────────────────────────────────
// GET /api/prestataires/moi
// ─────────────────────────────────────────────────────────
router.get("/moi", authMiddleware, requireType("PRESTATAIRE"), async (req, res) => {
  const prestataire = await prisma.prestataire.findUnique({
    where: { id: req.user.userId },
    include: { _count: { select: { missions: true } } },
  });
  if (!prestataire) return res.status(404).json({ success: false, message: "Prestataire introuvable." });
  res.json({ success: true, prestataire });
});

// ─────────────────────────────────────────────────────────
// PUT /api/prestataires/moi
// ─────────────────────────────────────────────────────────
router.put("/moi", authMiddleware, requireType("PRESTATAIRE"), async (req, res) => {
  const { nom, metier, region, ville, quartier, description } = req.body;
  const prestataire = await prisma.prestataire.update({
    where: { id: req.user.userId },
    data: { nom, metier, region, ville, quartier, description },
  });
  res.json({ success: true, prestataire });
});

// ─────────────────────────────────────────────────────────
// PUT /api/prestataires/disponibilite
// ─────────────────────────────────────────────────────────
router.put("/disponibilite", authMiddleware, requireType("PRESTATAIRE"), async (req, res) => {
  const { disponible } = req.body;
  if (typeof disponible !== "boolean") {
    return res.status(400).json({ success: false, message: "Valeur booléenne requise." });
  }
  await prisma.prestataire.update({
    where: { id: req.user.userId },
    data: { disponible },
  });
  res.json({ success: true, disponible, message: `Disponibilité mise à jour.` });
});

// ─────────────────────────────────────────────────────────
// GET /api/prestataires/moi/mensualite
// ─────────────────────────────────────────────────────────
router.get("/moi/mensualite", authMiddleware, requireType("PRESTATAIRE"), async (req, res) => {
  const maintenant = new Date();
  const mois = maintenant.getMonth() + 1;
  const annee = maintenant.getFullYear();
  const SEUIL = parseInt(process.env.SEUIL_MISSIONS_MENSUALITE || "5");

  const mensualite = await prisma.mensualite.findUnique({
    where: {
      prestataireId_mois_annee: { prestataireId: req.user.userId, mois, annee },
    },
  });

  res.json({
    success: true,
    mensualite,
    seuilAtteint: mensualite ? mensualite.nbMissions >= SEUIL : false,
    seuil: SEUIL,
    mois,
    annee,
  });
});

// ─────────────────────────────────────────────────────────
// GET /api/prestataires/recherche
// Recherche publique (accessible aux clients abonnés)
// ─────────────────────────────────────────────────────────
router.get("/recherche", authMiddleware, requireType("CLIENT"), async (req, res) => {
  const { region, ville, quartier, metier, disponible, page = 1, limit = 20 } = req.query;

  // Vérifier que le client est abonné
  const client = await prisma.client.findUnique({ where: { id: req.user.userId } });
  if (!client?.abonne) {
    return res.status(403).json({ success: false, message: "Abonnement requis pour rechercher des agents." });
  }

  const where = {
    actif: true,
    bloque: false,
    ...(region && { region }),
    ...(ville && { ville }),
    ...(quartier && { quartier }),
    ...(metier && { metier: { contains: metier, mode: "insensitive" } }),
    ...(disponible === "true" && { disponible: true }),
  };

  const [prestataires, total] = await Promise.all([
    prisma.prestataire.findMany({
      where,
      select: {
        id: true,
        nom: true,
        metier: true,
        region: true,
        ville: true,
        quartier: true,
        noteAverage: true,
        totalMissions: true,
        disponible: true,
        photo: true,
        description: true,
        typeCompte: true,
        // telephone JAMAIS exposé ici
      },
      orderBy: [{ disponible: "desc" }, { noteAverage: "desc" }, { totalMissions: "desc" }],
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    }),
    prisma.prestataire.count({ where }),
  ]);

  res.json({
    success: true,
    prestataires,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit)),
  });
});

// ─────────────────────────────────────────────────────────
// GET /api/prestataires/:id  — fiche publique (sans téléphone)
// ─────────────────────────────────────────────────────────
router.get("/:id", authMiddleware, async (req, res) => {
  const prestataire = await prisma.prestataire.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      nom: true,
      metier: true,
      region: true,
      ville: true,
      quartier: true,
      noteAverage: true,
      totalMissions: true,
      disponible: true,
      photo: true,
      description: true,
      typeCompte: true,
      createdAt: true,
      // telephone JAMAIS ici
    },
  });

  if (!prestataire) {
    return res.status(404).json({ success: false, message: "Prestataire introuvable." });
  }

  res.json({ success: true, prestataire });
});

// ─────────────────────────────────────────────────────────
// POST /api/prestataires/:missionId/avis
// Client laisse un avis après une mission terminée
// ─────────────────────────────────────────────────────────
router.post("/:missionId/avis", authMiddleware, requireType("CLIENT"), async (req, res) => {
  const { note, commentaire } = req.body;
  const clientId = req.user.userId;

  if (!note || note < 1 || note > 5) {
    return res.status(400).json({ success: false, message: "Note entre 1 et 5 requise." });
  }

  const mission = await prisma.mission.findUnique({
    where: { id: req.params.missionId },
    include: { avis: true },
  });

  if (!mission) return res.status(404).json({ success: false, message: "Mission introuvable." });
  if (mission.clientId !== clientId) return res.status(403).json({ success: false, message: "Non autorisé." });
  if (mission.statut !== "ACCEPTEE" && mission.statut !== "COMPLETEE") {
    return res.status(400).json({ success: false, message: "Mission non terminée." });
  }
  if (mission.avis) return res.status(400).json({ success: false, message: "Avis déjà soumis." });

  // Créer l'avis
  const avis = await prisma.avis.create({
    data: { missionId: mission.id, note, commentaire: commentaire || null },
  });

  // Recalculer la note moyenne du prestataire
  const allAvis = await prisma.avis.findMany({
    where: { mission: { prestataireId: mission.prestataireId } },
    select: { note: true },
  });
  const moyenne = allAvis.reduce((s, a) => s + a.note, 0) / allAvis.length;

  await prisma.prestataire.update({
    where: { id: mission.prestataireId },
    data: { noteAverage: parseFloat(moyenne.toFixed(2)) },
  });

  res.status(201).json({ success: true, avis });
});

module.exports = router;
