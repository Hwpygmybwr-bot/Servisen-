const logger = require("./logger");

let admin = null;
let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return;
  try {
    admin = require("firebase-admin");

    let serviceAccount;

    // Option 1 : variable d'environnement Railway
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
    // Option 2 : fichier JSON local
    else {
      try {
        serviceAccount = require("../../config/firebase-service-account.json");
      } catch {
        logger.warn("Firebase : fichier service account introuvable - notifications désactivées");
        return;
      }
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    logger.info("✅ Firebase initialisé");
  } catch (err) {
    // Ne pas planter le serveur si Firebase échoue
    logger.warn("Firebase non initialisé (notifications désactivées):", err.message);
  }
}

async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!firebaseInitialized || !admin || !fcmToken) return;
  try {
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    };
    return await admin.messaging().send(message);
  } catch (err) {
    logger.error("Erreur notification:", err.message);
  }
}

async function sendMulticastNotification(fcmTokens, title, body, data = {}) {
  if (!firebaseInitialized || !admin || !fcmTokens?.length) return;
  try {
    return await admin.messaging().sendEachForMulticast({
      tokens: fcmTokens,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    });
  } catch (err) {
    logger.error("Erreur multicast:", err.message);
  }
}

module.exports = { initFirebase, sendPushNotification, sendMulticastNotification };
