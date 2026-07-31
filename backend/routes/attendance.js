// // routes/attendance.js
// // The core anti-cheat logic lives here. Every check below is enforced
// // server-side — the client can't skip or fake any of these, since the
// // server never trusts a "trust me, this passed" flag from the browser.
// //
// // Checks, in order:
// //   1. Session exists, is active, and we're still inside the check-in window
// //   2. The scanned QR token matches the session's current server-side token
// //      and hasn't expired (kills screenshot/forwarded QR sharing)
// //   3. This device hasn't already marked attendance in this session
// //      (kills "one phone checks in five friends")
// //   4. This student hasn't already been marked in this session
// //   5. The submitted face descriptor is close enough to the student's
// //      registered one (kills "friend uses my phone" / wrong person scanning)
// //
// // Rate limiting on top of all this makes scripted/automated spam attempts
// // slow and easy to spot in the flags log even if something above is beaten.
// //
// // The final INSERT relies on Postgres's UNIQUE(session_id, student_id) and
// // UNIQUE(session_id, device_id) constraints to make the write atomic — that
// // guarantee holds even under a race condition, regardless of the pre-checks
// // above.

// const express = require("express");
// const rateLimit = require("express-rate-limit");
// const Joi = require("joi");
// const { v4: uuidv4 } = require("uuid");
// const { pool } = require("../db");
// const { requireAuth } = require("../middleware/auth");

// const router = express.Router();

// const markLimiter = rateLimit({
//   windowMs: 10 * 1000,
//   max: 3, // a genuine student needs at most 1-2 tries (e.g. retake selfie)
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { error: "Too many attempts, please wait a few seconds and try again" },
// });

// function euclideanDistance(a, b) {
//   let sum = 0;
//   for (let i = 0; i < a.length; i++) {
//     sum += (a[i] - b[i]) ** 2;
//   }
//   return Math.sqrt(sum);
// }

// async function flag(sessionId, studentId, reason, detail) {
//   await pool.query(
//     "INSERT INTO attendance_flags (id, session_id, student_id, reason, detail) VALUES ($1, $2, $3, $4, $5)",
//     [uuidv4(), sessionId, studentId, reason, detail || null]
//   );
// }

// const markSchema = Joi.object({
//   sessionId: Joi.string().required(),
//   qrToken: Joi.string().required(),
//   deviceId: Joi.string().min(10).max(200).required(),
//   faceDescriptor: Joi.array().items(Joi.number()).length(128).required(),
// });

// router.post("/mark", requireAuth("student"), markLimiter, async (req, res) => {
//   const { error, value } = markSchema.validate(req.body);
//   if (error) return res.status(400).json({ error: error.details[0].message });

//   const { sessionId, qrToken, deviceId, faceDescriptor } = value;
//   const studentId = req.user.id;

//   try {
//     const sessionResult = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
//     const session = sessionResult.rows[0];
//     if (!session) return res.status(404).json({ error: "Session not found" });

//     if (session.status !== "active") {
//       return res.status(400).json({ error: "This session has ended" });
//     }

//     if (new Date() > new Date(session.checkin_deadline)) {
//       return res.status(400).json({ error: "The check-in window for this session has closed" });
//     }

//     // --- 2. QR token check ---
//     const tokenValid =
//       session.current_token === qrToken &&
//       session.token_expires_at &&
//       new Date() <= new Date(session.token_expires_at);

//     if (!tokenValid) {
//       await flag(sessionId, studentId, "expired_or_invalid_token");
//       return res.status(400).json({ error: "This QR code has expired — scan the current one" });
//     }

//     // --- 3 & 4. Device + student already used (pre-checks for a clean error
//     // message; the DB's UNIQUE constraints are the real enforcement) ---
//     const deviceUsed = await pool.query(
//       "SELECT id FROM attendance WHERE session_id = $1 AND device_id = $2",
//       [sessionId, deviceId]
//     );
//     if (deviceUsed.rows.length) {
//       await flag(sessionId, studentId, "device_already_used", deviceId);
//       return res.status(409).json({ error: "This device has already marked attendance for this session" });
//     }

//     const studentAlreadyMarked = await pool.query(
//       "SELECT id FROM attendance WHERE session_id = $1 AND student_id = $2",
//       [sessionId, studentId]
//     );
//     if (studentAlreadyMarked.rows.length) {
//       return res.status(409).json({ error: "You've already been marked present for this session" });
//     }

//     // --- 5. Face match ---
//     const studentResult = await pool.query("SELECT * FROM students WHERE id = $1", [studentId]);
//     const student = studentResult.rows[0];
//     const registeredDescriptor = student.face_descriptor; // jsonb column, already parsed by pg
//     const distance = euclideanDistance(registeredDescriptor, faceDescriptor);
//     const threshold = Number(process.env.FACE_MATCH_THRESHOLD || 0.5);

//     if (distance > threshold) {
//       await flag(sessionId, studentId, "face_mismatch", `distance=${distance.toFixed(3)}`);
//       return res.status(401).json({
//         error: "Face didn't match your registered photo. Make sure you're in good lighting and try again.",
//       });
//     }

//     // --- All checks passed: record attendance ---
//     try {
//       const id = uuidv4();
//       await pool.query(
//         "INSERT INTO attendance (id, session_id, student_id, device_id, face_distance) VALUES ($1, $2, $3, $4, $5)",
//         [id, sessionId, studentId, deviceId, distance]
//       );

//       const io = req.app.get("io");
//       const rosterResult = await pool.query(
//         `SELECT a.marked_at, a.face_distance, s.roll_no, s.name
//          FROM attendance a JOIN students s ON s.id = a.student_id
//          WHERE a.session_id = $1 ORDER BY a.marked_at ASC`,
//         [sessionId]
//       );
//       io.to(`teacher-${sessionId}`).emit("roster:update", { roster: rosterResult.rows });

//       res.status(201).json({ ok: true, markedAt: new Date().toISOString() });
//     } catch (err) {
//       if (err.code === "23505") {
//         // Unique constraint hit at the DB level — last-resort catch for a
//         // race condition even though we pre-checked above
//         return res.status(409).json({ error: "Attendance already recorded for this session" });
//       }
//       throw err;
//     }
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Something went wrong, please try again" });
//   }
// });

// module.exports = router;


// routes/attendance.js
// The core anti-cheat logic lives here. Every check below is enforced
// server-side — the client can't skip or fake any of these, since the
// server never trusts a "trust me, this passed" flag from the browser.
//
// Checks, in order:
//   1. Session exists, is active, and we're still inside the check-in window
//   2. The scanned QR token matches the session's current server-side token
//      and hasn't expired (kills screenshot/forwarded QR sharing)
//   3. This device hasn't already marked attendance in this session
//      (kills "one phone checks in five friends")
//   4. This student hasn't already been marked in this session
//   5. The submitted face descriptor is close enough to the student's
//      registered one (kills "friend uses my phone" / wrong person scanning)
//
// Rate limiting on top of all this makes scripted/automated spam attempts
// slow and easy to spot in the flags log even if something above is beaten.
//
// The final INSERT relies on Postgres's UNIQUE(session_id, student_id) and
// UNIQUE(session_id, device_id) constraints to make the write atomic — that
// guarantee holds even under a race condition, regardless of the pre-checks
// above.





// routes/attendance.js
// The core anti-cheat logic lives here. Every check below is enforced
// server-side — the client can't skip or fake any of these, since the
// server never trusts a "trust me, this passed" flag from the browser.
//
// Checks, in order:
//   1. Session exists, is active, and we're still inside the check-in window
//   2. The scanned QR token matches the session's current server-side token
//      and hasn't expired (kills screenshot/forwarded QR sharing)
//   3. This device hasn't already marked attendance in this session
//      (kills "one phone checks in five friends")
//   4. This student hasn't already been marked in this session
//   5. The submitted face descriptor is close enough to the student's
//      registered one (kills "friend uses my phone" / wrong person scanning)
//
// Rate limiting on top of all this makes scripted/automated spam attempts
// slow and easy to spot in the flags log even if something above is beaten.
//
// The final INSERT relies on Postgres's UNIQUE(session_id, student_id) and
// UNIQUE(session_id, device_id) constraints to make the write atomic — that
// guarantee holds even under a race condition, regardless of the pre-checks
// above.

const express = require("express");
const rateLimit = require("express-rate-limit");
const Joi = require("joi");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const markLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 3, // a genuine student needs at most 1-2 tries (e.g. retake selfie)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please wait a few seconds and try again" },
});

// Wraps markLimiter so the test suite can fully bypass rate limiting for
// tests that aren't about rate limiting (hitting /mark several times across
// different scenarios in one test file shouldn't trip it), while the
// dedicated rate-limit test explicitly re-enables it. Done as our own
// middleware rather than express-rate-limit's built-in `skip` option so the
// bypass doesn't depend on version-specific behavior of that library.
function rateLimitUnlessDisabled(req, res, next) {
  if (process.env.DISABLE_RATE_LIMIT === "true") return next();
  return markLimiter(req, res, next);
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

async function flag(sessionId, studentId, reason, detail) {
  await pool.query(
    "INSERT INTO attendance_flags (id, session_id, student_id, reason, detail) VALUES ($1, $2, $3, $4, $5)",
    [uuidv4(), sessionId, studentId, reason, detail || null]
  );
}

const markSchema = Joi.object({
  sessionId: Joi.string().required(),
  qrToken: Joi.string().required(),
  deviceId: Joi.string().min(10).max(200).required(),
  faceDescriptor: Joi.array().items(Joi.number()).length(128).required(),
});

router.post("/mark", requireAuth("student"), rateLimitUnlessDisabled, async (req, res) => {
  const { error, value } = markSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { sessionId, qrToken, deviceId, faceDescriptor } = value;
  const studentId = req.user.id;

  try {
    const sessionResult = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
    const session = sessionResult.rows[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.status !== "active") {
      return res.status(400).json({ error: "This session has ended" });
    }

    if (new Date() > new Date(session.checkin_deadline)) {
      return res.status(400).json({ error: "The check-in window for this session has closed" });
    }

    // --- 2. QR token check ---
    const tokenValid =
      session.current_token === qrToken &&
      session.token_expires_at &&
      new Date() <= new Date(session.token_expires_at);

    if (!tokenValid) {
      await flag(sessionId, studentId, "expired_or_invalid_token");
      return res.status(400).json({ error: "This QR code has expired — scan the current one" });
    }

    // --- 3 & 4. Device + student already used (pre-checks for a clean error
    // message; the DB's UNIQUE constraints are the real enforcement) ---
    const deviceUsed = await pool.query(
      "SELECT id FROM attendance WHERE session_id = $1 AND device_id = $2",
      [sessionId, deviceId]
    );
    if (deviceUsed.rows.length) {
      await flag(sessionId, studentId, "device_already_used", deviceId);
      return res.status(409).json({ error: "This device has already marked attendance for this session" });
    }

    const studentAlreadyMarked = await pool.query(
      "SELECT id FROM attendance WHERE session_id = $1 AND student_id = $2",
      [sessionId, studentId]
    );
    if (studentAlreadyMarked.rows.length) {
      return res.status(409).json({ error: "You've already been marked present for this session" });
    }

    // --- 5. Face match ---
    const studentResult = await pool.query("SELECT * FROM students WHERE id = $1", [studentId]);
    const student = studentResult.rows[0];
    const registeredDescriptor = student.face_descriptor; // jsonb column, already parsed by pg
    const distance = euclideanDistance(registeredDescriptor, faceDescriptor);
    const threshold = Number(process.env.FACE_MATCH_THRESHOLD || 0.5);

    if (distance > threshold) {
      await flag(sessionId, studentId, "face_mismatch", `distance=${distance.toFixed(3)}`);
      return res.status(401).json({
        error: "Face didn't match your registered photo. Make sure you're in good lighting and try again.",
      });
    }

    // --- All checks passed: record attendance ---
    try {
      const id = uuidv4();
      await pool.query(
        "INSERT INTO attendance (id, session_id, student_id, device_id, face_distance) VALUES ($1, $2, $3, $4, $5)",
        [id, sessionId, studentId, deviceId, distance]
      );

      const io = req.app.get("io");
      const rosterResult = await pool.query(
        `SELECT a.marked_at, a.face_distance, s.roll_no, s.name
         FROM attendance a JOIN students s ON s.id = a.student_id
         WHERE a.session_id = $1 ORDER BY a.marked_at ASC`,
        [sessionId]
      );
      io.to(`teacher-${sessionId}`).emit("roster:update", { roster: rosterResult.rows });

      res.status(201).json({ ok: true, markedAt: new Date().toISOString() });
    } catch (err) {
      if (err.code === "23505") {
        // Unique constraint hit at the DB level — last-resort catch for a
        // race condition even though we pre-checked above
        return res.status(409).json({ error: "Attendance already recorded for this session" });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong, please try again" });
  }
});

module.exports = router;