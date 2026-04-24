const jwt = require("jsonwebtoken");

// Valeurs par défaut si variables non définies dans Railway
const JWT_SECRET = process.env.JWT_SECRET || "servisen_jwt_xK9pL2mN8vQ3rT5sY7wZ2024_b46af";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "servisen_admin_xR7qM4nP6uW1oE9bF3kH2024_b46af";

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Token d'authentification requis." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Token invalide ou expiré." });
  }
}

function adminMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Accès refusé." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== "ADMIN") throw new Error("Rôle insuffisant");
    req.admin = decoded;
    next();
  } catch {
    return res.status(403).json({ success: false, message: "Accès administrateur requis." });
  }
}

function requireType(type) {
  return (req, res, next) => {
    if (req.user.typeUtilisateur !== type) {
      return res.status(403).json({ success: false, message: `Accès réservé aux ${type.toLowerCase()}s.` });
    }
    next();
  };
}

module.exports = { authMiddleware, adminMiddleware, requireType };
