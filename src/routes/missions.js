// routes/missions.js
const express = require("express");
const router = express.Router();
const missionController = require("../controllers/missionController");
const { authMiddleware, requireType } = require("../middleware/auth");

router.post("/", authMiddleware, requireType("CLIENT"), missionController.creerMission);
router.put("/:id/accepter", authMiddleware, requireType("PRESTATAIRE"), missionController.accepterMission);
router.put("/:id/refuser", authMiddleware, requireType("PRESTATAIRE"), missionController.refuserMission);
router.get("/client", authMiddleware, requireType("CLIENT"), missionController.getMissionsClient);
router.get("/prestataire", authMiddleware, requireType("PRESTATAIRE"), missionController.getMissionsPrestataire);

module.exports = router;
