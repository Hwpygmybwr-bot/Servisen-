const logger = require("../config/logger");

/**
 * Envoie un SMS OTP
 * En mode dev ou si Twilio non configuré : affiche le code dans les logs
 */
async function sendSms(telephone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_PHONE;

  // Mode développement ou Twilio non configuré → log uniquement
  if (!accountSid || !authToken || !from || from === "ATTENTE_NUMERO_TWILIO") {
    logger.info(`[SMS - MODE DEV] ${telephone} : ${message}`);
    console.log(`\n📱 SMS pour ${telephone}:\n   ${message}\n`);
    return { success: true, provider: "dev-mode" };
  }

  // Envoi Twilio réel
  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: from, To: telephone, Body: message }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Twilio: ${err.message}`);
    }

    logger.info(`SMS envoyé via Twilio à ${telephone}`);
    return { success: true, provider: "twilio" };
  } catch (err) {
    logger.error("Erreur SMS Twilio:", err.message);
    // Ne pas planter le serveur si le SMS échoue
    logger.info(`[SMS FALLBACK] ${telephone} : ${message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { sendSms };
