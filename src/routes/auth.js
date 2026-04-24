const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// ── Envoi OTP ──────────────────────────────────────────────
// POST /api/auth/otp/send
// Body: { telephone, typeUtilisateur: "CLIENT"|"PRESTATAIRE" }
router.post("/otp/send", authController.sendOtp);

// ── Vérification OTP ───────────────────────────────────────
// POST /api/auth/otp/verify
// Body: { telephone, code, typeUtilisateur }
// Retourne un JWT temporaire pour continuer l'inscription
router.post("/otp/verify", authController.verifyOtp);

// ── Connexion (utilisateurs déjà inscrits) ─────────────────
// POST /api/auth/login
// Body: { telephone, code, typeUtilisateur }
router.post("/login", authController.login);

// ── Rafraîchissement du FCM token ─────────────────────────
// PUT /api/auth/fcm-token
// Body: { fcmToken }
router.put("/fcm-token", require("../middleware/auth").authMiddleware, authController.updateFcmToken);

module.exports = router;
