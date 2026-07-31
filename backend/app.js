// app.js
// Builds the Express app with all routes mounted, but doesn't start
// listening or set up Socket.IO — that happens in server.js.
//
// Split out specifically so tests can import this and hit routes directly
// with Supertest, without needing a real Socket.IO server or open port.

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const sessionRoutes = require("./routes/session");
const attendanceRoutes = require("./routes/attendance");

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" })); // face descriptors are small, but leave headroom

  // Attendance marking emits a socket event on success. Default to a no-op
  // "io" so the app works standalone (e.g. in tests) — server.js overwrites
  // this with the real Socket.IO instance before it starts listening.
  app.set("io", { to: () => ({ emit: () => {} }) });

  app.use("/api/auth", authRoutes);
  app.use("/api/session", sessionRoutes);
  app.use("/api/attendance", attendanceRoutes);

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  return app;
}

module.exports = { createApp };
