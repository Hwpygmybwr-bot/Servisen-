const express = require("express");
const router = express.Router();
const { prisma } = require("../config/database");
const { authMiddleware, requireType } = require("../middleware/auth");
const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────────────────
// POST /api/clients/inscription
// Appelé après vérification OTP — crée le compte client
// ─────────────────────────────────────────────────────────
router.post("/inscription", async (req, res) => {
  const { telephone, nom, prenom, region, ville, quartier } = req.body;

  if (!telephone || !nom || !prenom || !region) {
    return res.status(400).json({ success: false, message: "Champs obligatoires manquants." });
  }

  const tel = telephone.startsWith("+") ? telephone : `+221${telephone.replace(/^0+/, "")}`;

  const existant = await prisma.client.findUnique({ where: { telephone: tel } });
  if (existant) {
    return res.status(400).json({ success: false, message: "Ce numéro est déjà inscrit. Connectez-vous." });
  }

  const client = await prisma.client.create({
    data: { telephone: tel, nom, prenom, region, ville: ville || null, quartier: quartier || null },
  });

  const token = jwt.sign(
    { userId: client.id, typeUtilisateur: "CLIENT", telephone: tel },
    process.env.JWT_SECRET || "servisen_jwt_xK9pL2mN8vQ3rT5sY7wZ2024_b46af",
    { expiresIn: "30d" }
  );

  res.status(201).json({ success: true, client, token });
});

// ─────────────────────────────────────────────────────────
// GET /api/clients/moi
// ─────────────────────────────────────────────────────────
router.get("/moi", authMiddleware, requireType("CLIENT"), async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.user.userId },
    include: { _count: { select: { missions: true } } },
  });
  if (!client) return res.status(404).json({ success: false, message: "Client introuvable." });
  if (client.bloque) return res.status(403).json({ success: false, message: "Compte bloqué." });
  res.json({ success: true, client });
});

// ─────────────────────────────────────────────────────────
// PUT /api/clients/moi
// ─────────────────────────────────────────────────────────
router.put("/moi", authMiddleware, requireType("CLIENT"), async (req, res) => {
  const { nom, prenom, region, ville, quartier } = req.body;
  const client = await prisma.client.update({
    where: { id: req.user.userId },
    data: { nom, prenom, region, ville: ville || null, quartier: quartier || null },
  });
  res.json({ success: true, client });
});

module.exports = router;
