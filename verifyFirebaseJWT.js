const admin = require("firebase-admin");

async function verifyFirebaseJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized: No token found" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded; // uid, email, name, picture
    next();
  } catch (error) {
    console.error("JWT verification failed:", error);
    res.status(403).send({ message: "Forbidden: Invalid token" });
  }
}

module.exports = verifyFirebaseJWT;
