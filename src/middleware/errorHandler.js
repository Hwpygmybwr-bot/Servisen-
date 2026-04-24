const logger = require("../config/logger");

module.exports = (err, req, res, next) => {
  logger.error(`${req.method} ${req.path} — ${err.message}`, { stack: err.stack });

  if (err.name === "ZodError") {
    return res.status(400).json({ success: false, message: "Données invalides.", errors: err.errors });
  }

  if (err.code === "P2002") { // Prisma unique constraint
    return res.status(400).json({ success: false, message: "Cette valeur existe déjà." });
  }

  if (err.code === "P2025") { // Prisma record not found
    return res.status(404).json({ success: false, message: "Enregistrement introuvable." });
  }

  const status = err.status || 500;
  const message = process.env.NODE_ENV === "production" && status === 500
    ? "Erreur serveur interne."
    : err.message;

  res.status(status).json({ success: false, message });
};
