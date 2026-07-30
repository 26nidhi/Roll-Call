// middleware/auth.js
// Verifies the JWT sent by the client and checks the role (teacher/student)
// matches what the route requires. No route that touches session tokens or
// attendance should be reachable without this passing first.

const jwt = require("jsonwebtoken");

function requireAuth(role) {
  return function (req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (role && payload.role !== role) {
        return res.status(403).json({ error: "Not authorized for this action" });
      }
      req.user = payload; // { id, role, name/rollNo, iat, exp }
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

module.exports = { requireAuth };
