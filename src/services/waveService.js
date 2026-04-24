const logger = require("../config/logger");

const WAVE_BASE_URL = "https://api.wave.com/v1";

/**
 * Crée une session Wave Checkout
 * Si Wave non configuré → retourne une session fictive pour les tests
 */
async function creerSessionWave({ montant, description, referenceInterne }) {
  const apiKey = process.env.WAVE_API_KEY;

  // Mode test si Wave non encore configuré
  if (!apiKey || apiKey === "ATTENTE_WAVE_BUSINESS" || apiKey === "ATTENTE") {
    logger.info(`[WAVE - MODE TEST] Session simulée pour ${montant} XOF`);
    const fakeSessionId = `test_session_${Date.now()}`;
    return {
      sessionId: fakeSessionId,
      waveUrl: `https://wave.com/checkout/test?amount=${montant}&ref=${referenceInterne}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  // Appel Wave API réel
  const body = {
    amount: montant,
    currency: "XOF",
    error_url: process.env.WAVE_ERROR_URL || `${process.env.API_URL}/paiement/erreur`,
    success_url: process.env.WAVE_SUCCESS_URL || `${process.env.API_URL}/paiement/succes`,
    checkout_status_url: `${process.env.API_URL}/api/webhook/wave`,
    payment_reason: description,
    client_reference: referenceInterne,
  };

  const response = await fetch(`${WAVE_BASE_URL}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Wave API: ${err.message || "Erreur inconnue"}`);
  }

  const data = await response.json();
  logger.info(`Session Wave créée: ${data.id} pour ${montant} XOF`);

  return {
    sessionId: data.id,
    waveUrl: data.wave_launch_url,
    expiresAt: data.when_expires,
  };
}

/**
 * Vérifie la signature HMAC du webhook Wave
 */
function verifierSignatureWebhook(payload, signatureHeader) {
  const secret = process.env.WAVE_WEBHOOK_SECRET;
  if (!secret || secret === "ATTENTE_WAVE_BUSINESS" || secret === "ATTENTE") {
    logger.warn("WAVE_WEBHOOK_SECRET non configuré — webhook accepté en mode test");
    return true;
  }

  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const signatureCalculee = hmac.digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureCalculee, "hex"),
      Buffer.from(signatureHeader.replace("sha256=", ""), "hex")
    );
  } catch {
    return false;
  }
}

async function verifierStatutSession(sessionId) {
  const apiKey = process.env.WAVE_API_KEY;
  if (!apiKey || apiKey === "ATTENTE_WAVE_BUSINESS") {
    return { statut: "pending", paymentId: null };
  }

  const response = await fetch(`${WAVE_BASE_URL}/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) throw new Error("Impossible de vérifier le statut Wave");

  const data = await response.json();
  return {
    statut: data.payment_status,
    paymentId: data.payment_id,
    montant: data.amount,
  };
}

module.exports = { creerSessionWave, verifierSignatureWebhook, verifierStatutSession };
