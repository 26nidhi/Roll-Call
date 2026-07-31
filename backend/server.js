// // server.js
// // Ties everything together: Express REST API + Socket.IO for pushing the
// // rotating QR code to the teacher's screen in real time.
// //
// // Security note on the QR/socket design: the live token is only ever sent
// // to a socket that has proven (via JWT) it belongs to the teacher who owns
// // that specific session, and it's sent as a rendered QR image, not exposed
// // through any public/unauthenticated REST endpoint. This is the fix for the
// // biggest hole in the earlier prototype.

// require("dotenv").config();
// const express = require("express");
// const http = require("http");
// const cors = require("cors");
// const { Server } = require("socket.io");
// const jwt = require("jsonwebtoken");
// const QRCode = require("qrcode");

// const { pool, initDb } = require("./db");
// const { generateQrToken } = require("./utils/token");
// const authRoutes = require("./routes/auth");
// const sessionRoutes = require("./routes/session");
// const attendanceRoutes = require("./routes/attendance");

// const app = express();
// app.use(cors());
// app.use(express.json({ limit: "2mb" })); // face descriptors are small, but leave headroom

// app.use("/api/auth", authRoutes);
// app.use("/api/session", sessionRoutes);
// app.use("/api/attendance", attendanceRoutes);

// app.get("/api/health", (req, res) => res.json({ ok: true }));

// const server = http.createServer(app);
// const io = new Server(server, { cors: { origin: "*" } });
// app.set("io", io);

// // ---- Socket.IO: teacher-only, authenticated ----
// io.use((socket, next) => {
//   try {
//     const token = socket.handshake.auth?.token;
//     if (!token) return next(new Error("Missing auth token"));
//     const payload = jwt.verify(token, process.env.JWT_SECRET);
//     if (payload.role !== "teacher") return next(new Error("Only teachers can connect here"));
//     socket.teacher = payload;
//     next();
//   } catch (err) {
//     next(new Error("Invalid or expired token"));
//   }
// });

// io.on("connection", (socket) => {
//   socket.on("teacher:join-session", async (sessionId) => {
//     try {
//       const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
//       const session = result.rows[0];
//       if (!session || session.teacher_id !== socket.teacher.id) {
//         socket.emit("error", { error: "Not authorized for this session" });
//         return;
//       }
//       socket.join(`teacher-${sessionId}`);
//       socket.emit("joined", { sessionId });
//     } catch (err) {
//       console.error(err);
//       socket.emit("error", { error: "Something went wrong joining the session" });
//     }
//   });
// });

// // ---- QR token rotation ----
// // One interval per active session, storing the current token + expiry in the
// // DB (not just in memory) so a server restart doesn't leave a session in a
// // broken state, and so the /mark endpoint can check it directly.

// const ROTATE_MS = Number(process.env.TOKEN_ROTATE_SECONDS || 6) * 1000;
// const VALID_MS = Number(process.env.TOKEN_VALID_SECONDS || 8) * 1000;
// const activeIntervals = new Map(); // sessionId -> interval handle

// async function rotateToken(sessionId) {
//   const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
//   const session = result.rows[0];
//   if (!session || session.status !== "active") {
//     stopRotating(sessionId);
//     return;
//   }

//   const token = generateQrToken();
//   const expiresAt = new Date(Date.now() + VALID_MS).toISOString();

//   await pool.query("UPDATE sessions SET current_token = $1, token_expires_at = $2 WHERE id = $3", [
//     token,
//     expiresAt,
//     sessionId,
//   ]);

//   const qrPayload = JSON.stringify({ sessionId, token, action: session.liveness_action });
//   const qrImageDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 320 });

//   io.to(`teacher-${sessionId}`).emit("qr:update", {
//     qrImageDataUrl,
//     expiresAt,
//     rotateMs: ROTATE_MS,
//     action: session.liveness_action,
//   });
// }

// function startRotating(sessionId) {
//   rotateToken(sessionId).catch((err) => console.error("rotateToken error:", err)); // fire immediately
//   const handle = setInterval(() => {
//     rotateToken(sessionId).catch((err) => console.error("rotateToken error:", err));
//   }, ROTATE_MS);
//   activeIntervals.set(sessionId, handle);
// }

// function stopRotating(sessionId) {
//   const handle = activeIntervals.get(sessionId);
//   if (handle) {
//     clearInterval(handle);
//     activeIntervals.delete(sessionId);
//   }
// }

// // Hook rotation into session start/end without tightly coupling the routes
// // file to socket internals: poll for newly-active sessions with no running
// // interval yet. Simple and reliable for a single-process app.
// setInterval(async () => {
//   try {
//     const result = await pool.query("SELECT id FROM sessions WHERE status = 'active'");
//     const activeIds = new Set(result.rows.map((s) => s.id));

//     for (const id of activeIds) {
//       if (!activeIntervals.has(id)) startRotating(id);
//     }
//     for (const id of activeIntervals.keys()) {
//       if (!activeIds.has(id)) stopRotating(id);
//     }
//   } catch (err) {
//     console.error("session poll error:", err);
//   }
// }, 2000);

// const PORT = process.env.PORT || 4000;

// initDb()
//   .then(() => {
//     server.listen(PORT, () => {
//       console.log(`Attendance server running on http://localhost:${PORT}`);
//     });
//   })
//   .catch((err) => {
//     console.error("Failed to initialize database:", err);
//     process.exit(1);
//   });

// server.js
// Ties everything together: Express REST API + Socket.IO for pushing the
// rotating QR code to the teacher's screen in real time.
//
// Security note on the QR/socket design: the live token is only ever sent
// to a socket that has proven (via JWT) it belongs to the teacher who owns
// that specific session, and it's sent as a rendered QR image, not exposed
// through any public/unauthenticated REST endpoint. This is the fix for the
// biggest hole in the earlier prototype.

require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");

const { pool, initDb } = require("./db");
const { generateQrToken } = require("./utils/token");
const { createApp } = require("./app");

const app = createApp();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.set("io", io); // replace the no-op default from createApp() with the real one

// ---- Socket.IO: teacher-only, authenticated ----
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Missing auth token"));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== "teacher") return next(new Error("Only teachers can connect here"));
    socket.teacher = payload;
    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  socket.on("teacher:join-session", async (sessionId) => {
    try {
      const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
      const session = result.rows[0];
      if (!session || session.teacher_id !== socket.teacher.id) {
        socket.emit("error", { error: "Not authorized for this session" });
        return;
      }
      socket.join(`teacher-${sessionId}`);
      socket.emit("joined", { sessionId });
    } catch (err) {
      console.error(err);
      socket.emit("error", { error: "Something went wrong joining the session" });
    }
  });
});

// ---- QR token rotation ----
// One interval per active session, storing the current token + expiry in the
// DB (not just in memory) so a server restart doesn't leave a session in a
// broken state, and so the /mark endpoint can check it directly.

const ROTATE_MS = Number(process.env.TOKEN_ROTATE_SECONDS || 6) * 1000;
const VALID_MS = Number(process.env.TOKEN_VALID_SECONDS || 8) * 1000;
const activeIntervals = new Map(); // sessionId -> interval handle

async function rotateToken(sessionId) {
  const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
  const session = result.rows[0];
  if (!session || session.status !== "active") {
    stopRotating(sessionId);
    return;
  }

  const token = generateQrToken();
  const expiresAt = new Date(Date.now() + VALID_MS).toISOString();

  await pool.query("UPDATE sessions SET current_token = $1, token_expires_at = $2 WHERE id = $3", [
    token,
    expiresAt,
    sessionId,
  ]);

  const qrPayload = JSON.stringify({ sessionId, token, action: session.liveness_action });
  const qrImageDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 320 });

  io.to(`teacher-${sessionId}`).emit("qr:update", {
    qrImageDataUrl,
    expiresAt,
    rotateMs: ROTATE_MS,
    action: session.liveness_action,
  });
}

function startRotating(sessionId) {
  rotateToken(sessionId).catch((err) => console.error("rotateToken error:", err)); // fire immediately
  const handle = setInterval(() => {
    rotateToken(sessionId).catch((err) => console.error("rotateToken error:", err));
  }, ROTATE_MS);
  activeIntervals.set(sessionId, handle);
}

function stopRotating(sessionId) {
  const handle = activeIntervals.get(sessionId);
  if (handle) {
    clearInterval(handle);
    activeIntervals.delete(sessionId);
  }
}

// Hook rotation into session start/end without tightly coupling the routes
// file to socket internals: poll for newly-active sessions with no running
// interval yet. Simple and reliable for a single-process app.
setInterval(async () => {
  try {
    const result = await pool.query("SELECT id FROM sessions WHERE status = 'active'");
    const activeIds = new Set(result.rows.map((s) => s.id));

    for (const id of activeIds) {
      if (!activeIntervals.has(id)) startRotating(id);
    }
    for (const id of activeIntervals.keys()) {
      if (!activeIds.has(id)) stopRotating(id);
    }
  } catch (err) {
    console.error("session poll error:", err);
  }
}, 2000);

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Attendance server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });