const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { prisma } = require("../config/database");
const { sendSms } = require("../services/smsService");
const logger = require("../config/logger");

// Valeurs par défaut si variables Railway non définies
const JWT_SECRET = JWT_SECRET || "servisen_jwt_xK9pL2mN8vQ3rT5sY7wZ2024_b46af";

// ─── Génère un code OTP à 6 chiffres ──────────────────────
function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Génère un JWT ─────────────────────────────────────────
function generateToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || "30d") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// ──────────────────────────────────────────────────────────
// POST /api/auth/otp/send
// ──────────────────────────────────────────────────────────
exports.sendOtp = async (req, res) => {
  const { telephone, typeUtilisateur } = req.body;

  if (!telephone || !typeUtilisateur) {
    return res.status(400).json({ success: false, message: "Téléphone et type utilisateur requis." });
  }

  if (!["CLIENT", "PRESTATAIRE"].includes(typeUtilisateur)) {
    return res.status(400).json({ success: false, message: "Type utilisateur invalide." });
  }

  // Normaliser le numéro (ajouter +221 si absent)
  const tel = telephone.startsWith("+") ? telephone : `+221${telephone.replace(/^0+/, "")}`;

  // Générer le code
  const code = generateOtpCode();
  const hashedCode = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Supprimer les anciens OTP non vérifiés pour ce numéro
  await prisma.otpSession.deleteMany({
    where: { telephone: tel, verifie: false },
  });

  // Sauvegarder le nouvel OTP
  await prisma.otpSession.create({
    data: { telephone: tel, code: hashedCode, typeUtilisateur, expiresAt },
  });

  // Envoyer le SMS
  await sendSms(tel, `ServiSen – Votre code de vérification : ${code}. Valable 10 minutes.`);

  logger.info(`OTP envoyé au ${tel} (type: ${typeUtilisateur})`);

  // En développement, on retourne le code pour faciliter les tests
  const devInfo = process.env.NODE_ENV === "development" ? { devCode: code } : {};

  res.json({ success: true, message: "Code OTP envoyé par SMS.", ...devInfo });
};

// ──────────────────────────────────────────────────────────
// POST /api/auth/otp/verify
// ──────────────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  const { telephone, code, typeUtilisateur } = req.body;

  if (!telephone || !code || !typeUtilisateur) {
    return res.status(400).json({ success: false, message: "Données manquantes." });
  }

  const tel = telephone.startsWith("+") ? telephone : `+221${telephone.replace(/^0+/, "")}`;

  // Chercher le dernier OTP valide
  const otpSession = await prisma.otpSession.findFirst({
    where: {
      telephone: tel,
      typeUtilisateur,
      verifie: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpSession) {
    return res.status(400).json({ success: false, message: "Code expiré ou introuvable. Renvoyez un nouveau code." });
  }

  const codeValide = await bcrypt.compare(code, otpSession.code);
  if (!codeValide) {
    return res.status(400).json({ success: false, message: "Code incorrect." });
  }

  // Marquer l'OTP comme vérifié
  await prisma.otpSession.update({
    where: { id: otpSession.id },
    data: { verifie: true },
  });

  // Vérifier si l'utilisateur existe déjà dans la base
  let utilisateurExistant = null;
  if (typeUtilisateur === "CLIENT") {
    utilisateurExistant = await prisma.client.findUnique({ where: { telephone: tel } });
  } else {
    utilisateurExistant = await prisma.prestataire.findUnique({ where: { telephone: tel } });
  }

  // ── UTILISATEUR EXISTANT → connexion directe ─────────────────
  if (utilisateurExistant) {
    if (utilisateurExistant.bloque) {
      return res.status(403).json({
        success: false,
        message: "Votre compte est bloqué. Contactez le support ServiSen.",
      });
    }

    // Token permanent 30 jours — exactement comme après inscription
    const token = generateToken({
      userId: utilisateurExistant.id,
      typeUtilisateur,
      telephone: tel,
    });

    logger.info(`Reconnexion ${typeUtilisateur}: ${tel} (id: ${utilisateurExistant.id})`);

    return res.json({
      success: true,
      message: "Connexion réussie.",
      token,
      utilisateurExistant: true,
      utilisateur: utilisateurExistant,
    });
  }

  // ── NOUVEL UTILISATEUR → token temporaire 1h pour inscription ──
  const token = generateToken({
    telephone: tel,
    typeUtilisateur,
    otpVerified: true,
    userId: null,
  }, "1h");

  logger.info(`Nouveau ${typeUtilisateur} vérifié: ${tel} — en cours d'inscription`);

  res.json({
    success: true,
    message: "Téléphone vérifié. Complétez votre inscription.",
    token,
    utilisateurExistant: false,
    utilisateur: null,
  });
};

// ──────────────────────────────────────────────────────────
// POST /api/auth/login
// Connexion d'un utilisateur existant via OTP
// ──────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { telephone, code, typeUtilisateur } = req.body;
  const tel = telephone.startsWith("+") ? telephone : `+221${telephone.replace(/^0+/, "")}`;

  // Même logique que verifyOtp
  const otpSession = await prisma.otpSession.findFirst({
    where: { telephone: tel, typeUtilisateur, verifie: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!otpSession) {
    return res.status(400).json({ success: false, message: "Code expiré. Renvoyez un nouveau code." });
  }

  const codeValide = await bcrypt.compare(code, otpSession.code);
  if (!codeValide) {
    return res.status(400).json({ success: false, message: "Code incorrect." });
  }

  await prisma.otpSession.update({ where: { id: otpSession.id }, data: { verifie: true } });

  let utilisateur = null;
  if (typeUtilisateur === "CLIENT") {
    utilisateur = await prisma.client.findUnique({ where: { telephone: tel } });
  } else {
    utilisateur = await prisma.prestataire.findUnique({ where: { telephone: tel } });
  }

  if (!utilisateur) {
    return res.status(404).json({ success: false, message: "Compte introuvable. Inscrivez-vous d'abord." });
  }

  if (utilisateur.bloque) {
    return res.status(403).json({ success: false, message: "Votre compte a été bloqué. Contactez le support." });
  }

  const token = generateToken({ userId: utilisateur.id, typeUtilisateur, telephone: tel });

  res.json({ success: true, message: "Connexion réussie.", token, utilisateur });
};

// ──────────────────────────────────────────────────────────
// PUT /api/auth/fcm-token
// ──────────────────────────────────────────────────────────
exports.updateFcmToken = async (req, res) => {
  const { fcmToken } = req.body;
  const { userId, typeUtilisateur } = req.user;

  if (!fcmToken) return res.status(400).json({ success: false, message: "FCM token requis." });

  if (typeUtilisateur === "CLIENT") {
    await prisma.client.update({ where: { id: userId }, data: { fcmToken } });
  } else {
    await prisma.prestataire.update({ where: { id: userId }, data: { fcmToken } });
  }

  res.json({ success: true, message: "FCM token mis à jour." });
};
