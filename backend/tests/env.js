// tests/env.js
// Runs once before the test framework is installed (jest "setupFiles").
// Loads .env.test (a separate file from .env, so tests never accidentally
// point at your real classroom database) and sets sensible test defaults.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.test") });

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-not-for-production";
process.env.FACE_MATCH_THRESHOLD = process.env.FACE_MATCH_THRESHOLD || "0.5";
process.env.SESSION_CHECKIN_WINDOW_MINUTES = process.env.SESSION_CHECKIN_WINDOW_MINUTES || "10";

// Rate limiting is off by default across the suite so tests that make a
// handful of /mark requests for different scenarios aren't accidentally
// throttled. The dedicated rate-limit test turns it back on for itself.
process.env.DISABLE_RATE_LIMIT = "true";
