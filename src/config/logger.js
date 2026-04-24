const { createLogger, format, transports } = require("winston");
const path = require("path");
const fs = require("fs");

const isProduction = process.env.NODE_ENV === "production";

// Créer le dossier logs seulement en local
const logsTransports = [
  new transports.Console({
    format: format.combine(
      format.colorize(),
      format.printf(({ timestamp, level, message, ...meta }) => {
        const extra = Object.keys(meta).length ? JSON.stringify(meta) : "";
        return `[${timestamp}] ${level}: ${message} ${extra}`;
      })
    ),
  }),
];

// En local uniquement, ajouter les fichiers de logs
if (!isProduction) {
  try {
    const logsDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    logsTransports.push(
      new transports.File({ filename: "logs/error.log", level: "error" }),
      new transports.File({ filename: "logs/combined.log" })
    );
  } catch (err) {
    // Ignorer si impossible de créer les logs
  }
}

const logger = createLogger({
  level: isProduction ? "info" : "debug",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: logsTransports,
});

module.exports = logger;
