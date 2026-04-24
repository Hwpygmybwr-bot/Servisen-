// DATABASE_URL est déjà injectée par start.js
// On charge dotenv uniquement pour les autres variables
require("dotenv").config();
require("express-async-errors");

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const { prisma } = require("./config/database");
const { initFirebase } = require("./config/firebase");
const logger = require("./config/logger");
const errorHandler = require("./middleware/errorHandler");
const { initCronJobs } = require("./services/cronJobs");

// Routes
const authRoutes      = require("./routes/auth");
const clientRoutes    = require("./routes/clients");
const prestataireRoutes = require("./routes/prestataires");
const missionRoutes   = require("./routes/missions");
const paiementRoutes  = require("./routes/paiements");
const waveWebhookRoutes = require("./routes/waveWebhook");
const adminRoutes     = require("./routes/admin");
const uploadRoutes    = require("./routes/upload");

const app    = express();
const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
app.set("io", io);

// Middlewares
app.use(helmet());
app.use(cors({ origin: "*", credentials: true }));
app.use("/api/webhook/wave", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Routes
app.use("/api/auth",        authRoutes);
app.use("/api/clients",     clientRoutes);
app.use("/api/prestataires",prestataireRoutes);
app.use("/api/missions",    missionRoutes);
app.use("/api/paiements",   paiementRoutes);
app.use("/api/webhook/wave",waveWebhookRoutes);
app.use("/api/admin",       adminRoutes);
app.use("/api/upload",      uploadRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "ServiSen API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

app.get("/", (req, res) => {
  res.json({ service: "ServiSen API", status: "online" });
});

// Socket.IO events
io.on("connection", (socket) => {
  socket.on("join", ({ userId, userType }) => {
    socket.join(`${userType}_${userId}`);
  });
});

// Error handler
app.use(errorHandler);

// Démarrage
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await prisma.$connect();
    logger.info("✅ Base de données connectée");

    initFirebase();
    initCronJobs();

    server.listen(PORT, "0.0.0.0", () => {
      logger.info(`🚀 ServiSen API démarrée → port ${PORT}`);
    });
  } catch (error) {
    logger.error("❌ Erreur démarrage :", error);
    process.exit(1);
  }
}

start();
