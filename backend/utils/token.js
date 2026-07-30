// utils/token.js
// Generates the short-lived random tokens embedded in each rotating QR code.
// These are NOT JWTs — they're just opaque random strings the server keeps
// in memory/DB against the session, and checks on scan. Being random and
// short-lived (a few seconds) is what makes a screenshotted or forwarded QR
// go stale almost immediately.

const crypto = require("crypto");

function generateQrToken() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = { generateQrToken };
