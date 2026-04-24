const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authMiddleware } = require("../middleware/auth");
const logger = require("../config/logger");

// Multer — stockage en mémoire (on envoie à Cloudinary directement)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    const types = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (types.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Format non accepté. Utilisez JPEG, PNG ou PDF."));
  },
});

// Upload vers Cloudinary via leur API REST (sans SDK)
async function uploadToCloudinary(buffer, mimeType, folder, publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey) throw new Error("Cloudinary non configuré");

  // Générer la signature
  const crypto = require("crypto");
  const timestamp = Math.floor(Date.now() / 1000);
  const params = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha256")
    .update(params + apiSecret)
    .digest("hex");

  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  formData.append("file", blob, publicId);
  formData.append("folder", folder);
  formData.append("public_id", publicId);
  formData.append("timestamp", timestamp.toString());
  formData.append("api_key", apiKey);
  formData.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/upload`,
    { method: "POST", body: formData }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Cloudinary: ${err.error?.message || "Erreur upload"}`);
  }

  const data = await response.json();
  return data.secure_url;
}

// POST /api/upload/photo-profil
router.post("/photo-profil", authMiddleware, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Fichier requis." });

  const url = await uploadToCloudinary(
    req.file.buffer,
    req.file.mimetype,
    "servisen/profils",
    `profil_${req.user.userId}`
  );

  const { prisma } = require("../config/database");
  if (req.user.typeUtilisateur === "PRESTATAIRE") {
    await prisma.prestataire.update({ where: { id: req.user.userId }, data: { photo: url } });
  }

  logger.info(`Photo profil uploadée: ${url}`);
  res.json({ success: true, url });
});

// POST /api/upload/cni-recto
router.post("/cni-recto", authMiddleware, upload.single("cni"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Fichier requis." });

  const url = await uploadToCloudinary(
    req.file.buffer,
    req.file.mimetype,
    "servisen/cni",
    `cni_recto_${req.user.userId}`
  );

  const { prisma } = require("../config/database");
  await prisma.prestataire.update({ where: { id: req.user.userId }, data: { cniRecto: url } });

  res.json({ success: true, url });
});

// POST /api/upload/cni-verso
router.post("/cni-verso", authMiddleware, upload.single("cni"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Fichier requis." });

  const url = await uploadToCloudinary(
    req.file.buffer,
    req.file.mimetype,
    "servisen/cni",
    `cni_verso_${req.user.userId}`
  );

  const { prisma } = require("../config/database");
  await prisma.prestataire.update({ where: { id: req.user.userId }, data: { cniVerso: url } });

  res.json({ success: true, url });
});

// POST /api/upload/mission-photo
router.post("/mission-photo", authMiddleware, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Fichier requis." });

  const url = await uploadToCloudinary(
    req.file.buffer,
    req.file.mimetype,
    "servisen/missions",
    `mission_${Date.now()}_${req.user.userId}`
  );

  res.json({ success: true, url });
});

module.exports = router;
