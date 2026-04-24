const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { prisma } = require("../config/database");
const { adminMiddleware } = require("../middleware/auth");
const logger = require("../config/logger");

const ADMIN_JWT_SECRET = ADMIN_JWT_SECRET || "servisen_admin_xR7qM4nP6uW1oE9bF3kH2024_b46af";
const ADMIN_EMAIL = ADMIN_EMAIL || "admin@servisen.sn";
const ADMIN_PASSWORD = ADMIN_PASSWORD || "ServiSen2026Admin!";

// ──────────────────────────────────────────────────────────
// POST /api/admin/login
// ──────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (email !== ADMIN_EMAIL) {
    return res.status(401).json({ success: false, message: "Identifiants incorrects." });
  }

  const passwordOk = await bcrypt.compare(password, ADMIN_PASSWORD_HASH || "");

  // En premier démarrage, comparer en clair puis hacher
  const passwordOkPlain = password === ADMIN_PASSWORD;

  if (!passwordOk && !passwordOkPlain) {
    return res.status(401).json({ success: false, message: "Identifiants incorrects." });
  }

  const token = jwt.sign(
    { email, role: "ADMIN" },
    ADMIN_JWT_SECRET,
    { expiresIn: "8h" }
  );

  logger.info(`Connexion admin: ${email}`);
  res.json({ success: true, token });
});

// ──────────────────────────────────────────────────────────
// GET /api/admin/stats
// Statistiques globales tableau de bord
// ──────────────────────────────────────────────────────────
router.get("/stats", adminMiddleware, async (req, res) => {
  const aujourd_hui = new Date();
  aujourd_hui.setHours(0, 0, 0, 0);

  const [
    totalClients,
    clientsAujourdhui,
    totalPrestataires,
    prestatairesActifs,
    totalMissions,
    missionsAujourdhui,
    missionsAccepteesAujourdhui,
    paiementsAujourdhui,
    agentsSeuil,
  ] = await Promise.all([
    prisma.client.count({ where: { abonne: true } }),
    prisma.client.count({ where: { createdAt: { gte: aujourd_hui } } }),
    prisma.prestataire.count(),
    prisma.prestataire.count({ where: { actif: true, bloque: false } }),
    prisma.mission.count(),
    prisma.mission.count({ where: { createdAt: { gte: aujourd_hui } } }),
    prisma.mission.count({ where: { statut: "ACCEPTEE", createdAt: { gte: aujourd_hui } } }),
    prisma.paiement.aggregate({
      where: { statut: "SUCCES", createdAt: { gte: aujourd_hui } },
      _sum: { montant: true },
      _count: true,
    }),
    prisma.mensualite.count({
      where: {
        mois: new Date().getMonth() + 1,
        annee: new Date().getFullYear(),
        nbMissions: { gte: parseInt(process.env.SEUIL_MISSIONS_MENSUALITE || "5") },
        payee: false,
      },
    }),
  ]);

  // Derniers événements (activité en temps réel)
  const derniersMissions = await prisma.mission.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { nom: true, prenom: true } },
      prestataire: { select: { nom: true, metier: true } },
    },
  });

  const derniersPaiements = await prisma.paiement.findMany({
    take: 5,
    where: { statut: "SUCCES" },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    success: true,
    stats: {
      clients: { total: totalClients, aujourd_hui: clientsAujourdhui },
      prestataires: { total: totalPrestataires, actifs: prestatairesActifs },
      missions: {
        total: totalMissions,
        aujourd_hui: missionsAujourdhui,
        accepteesAujourdhui: missionsAccepteesAujourdhui,
        tauxAcceptation: missionsAujourdhui > 0
          ? Math.round((missionsAccepteesAujourdhui / missionsAujourdhui) * 100)
          : 0,
      },
      revenus: {
        aujourd_hui: paiementsAujourdhui._sum.montant || 0,
        transactionsAujourdhui: paiementsAujourdhui._count,
      },
      mensualites: { agentsSeuilAtteint: agentsSeuil },
    },
    activite: { missions: derniersMissions, paiements: derniersPaiements },
  });
});

// ──────────────────────────────────────────────────────────
// GET /api/admin/clients
// ──────────────────────────────────────────────────────────
router.get("/clients", adminMiddleware, async (req, res) => {
  const { search, page = 1, limit = 50, bloque } = req.query;

  const where = {
    ...(search && {
      OR: [
        { nom: { contains: search, mode: "insensitive" } },
        { prenom: { contains: search, mode: "insensitive" } },
        { telephone: { contains: search } },
      ],
    }),
    ...(bloque !== undefined && { bloque: bloque === "true" }),
  };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
      include: { _count: { select: { missions: true } } },
    }),
    prisma.client.count({ where }),
  ]);

  res.json({ success: true, clients, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
});

// ──────────────────────────────────────────────────────────
// GET /api/admin/prestataires
// ──────────────────────────────────────────────────────────
router.get("/prestataires", adminMiddleware, async (req, res) => {
  const { search, page = 1, limit = 50, actif, bloque } = req.query;

  const where = {
    ...(search && {
      OR: [
        { nom: { contains: search, mode: "insensitive" } },
        { telephone: { contains: search } },
        { metier: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(actif !== undefined && { actif: actif === "true" }),
    ...(bloque !== undefined && { bloque: bloque === "true" }),
  };

  const [prestataires, total] = await Promise.all([
    prisma.prestataire.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
      include: { _count: { select: { missions: true } } },
    }),
    prisma.prestataire.count({ where }),
  ]);

  res.json({ success: true, prestataires, total });
});

// ──────────────────────────────────────────────────────────
// PUT /api/admin/clients/:id/bloquer
// PUT /api/admin/prestataires/:id/bloquer
// ──────────────────────────────────────────────────────────
router.put("/clients/:id/bloquer", adminMiddleware, async (req, res) => {
  const { bloque, raison } = req.body;
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: { bloque },
  });
  logger.info(`Admin: Client ${client.id} ${bloque ? "bloqué" : "débloqué"} — ${raison || ""}`);
  res.json({ success: true, client });
});

router.put("/prestataires/:id/bloquer", adminMiddleware, async (req, res) => {
  const { bloque, raison } = req.body;
  const prestataire = await prisma.prestataire.update({
    where: { id: req.params.id },
    data: { bloque },
  });
  logger.info(`Admin: Prestataire ${prestataire.id} ${bloque ? "bloqué" : "débloqué"} — ${raison || ""}`);
  res.json({ success: true, prestataire });
});

// ──────────────────────────────────────────────────────────
// GET /api/admin/paiements
// ──────────────────────────────────────────────────────────
router.get("/paiements", adminMiddleware, async (req, res) => {
  const { page = 1, limit = 50, statut, type, dateDebut, dateFin } = req.query;

  const where = {
    ...(statut && { statut }),
    ...(type && { typePaiement: type }),
    ...(dateDebut && dateFin && {
      createdAt: { gte: new Date(dateDebut), lte: new Date(dateFin) },
    }),
  };

  const [paiements, total, totaux] = await Promise.all([
    prisma.paiement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    }),
    prisma.paiement.count({ where }),
    prisma.paiement.groupBy({
      by: ["typePaiement"],
      where: { statut: "SUCCES" },
      _sum: { montant: true },
      _count: true,
    }),
  ]);

  res.json({ success: true, paiements, total, totaux });
});

// ──────────────────────────────────────────────────────────
// GET/PUT /api/admin/parametres
// Paramètres métier modifiables
// ──────────────────────────────────────────────────────────
router.get("/parametres", adminMiddleware, async (req, res) => {
  const parametres = await prisma.parametre.findMany({ orderBy: { cle: "asc" } });
  res.json({ success: true, parametres });
});

router.put("/parametres/:cle", adminMiddleware, async (req, res) => {
  const { valeur } = req.body;
  const parametre = await prisma.parametre.upsert({
    where: { cle: req.params.cle },
    update: { valeur },
    create: { cle: req.params.cle, valeur },
  });
  logger.info(`Admin: Paramètre "${req.params.cle}" mis à jour → "${valeur}"`);
  res.json({ success: true, parametre });
});

// ──────────────────────────────────────────────────────────
// GET /api/admin/missions
// ──────────────────────────────────────────────────────────
router.get("/missions", adminMiddleware, async (req, res) => {
  const { page = 1, limit = 50, statut } = req.query;
  const where = { ...(statut && { statut }) };

  const [missions, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
      include: {
        client: { select: { nom: true, prenom: true, telephone: true } },
        prestataire: { select: { nom: true, metier: true, telephone: true } },
      },
    }),
    prisma.mission.count({ where }),
  ]);

  res.json({ success: true, missions, total });
});

module.exports = router;
