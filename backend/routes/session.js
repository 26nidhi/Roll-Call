// routes/session.js
// Teacher-only routes to start and end a class session.
//
// Important design choice: the rotating QR token is NEVER returned by any
// plain REST GET endpoint. It's only ever pushed out over an authenticated
// Socket.IO connection to the teacher who owns the session (see server.js).
// That closes the hole from the earlier prototype where anyone who knew
// the session ID could poll an endpoint and get the live token remotely.

const express = require("express");
const Joi = require("joi");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { pickRandomAction } = require("../utils/livenessActions");

const router = express.Router();

const startSchema = Joi.object({
  subject: Joi.string().min(1).max(100).required(),
});

router.post("/start", requireAuth("teacher"), async (req, res) => {
  const { error, value } = startSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const windowMinutes = Number(process.env.SESSION_CHECKIN_WINDOW_MINUTES || 10);
    const deadline = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();

    const id = uuidv4();
    const livenessAction = pickRandomAction();
    await pool.query(
      `INSERT INTO sessions (id, teacher_id, subject, status, checkin_deadline, liveness_action)
       VALUES ($1, $2, $3, 'active', $4, $5)`,
      [id, req.user.id, value.subject, deadline, livenessAction]
    );

    res.status(201).json({
      sessionId: id,
      subject: value.subject,
      checkinDeadline: deadline,
      livenessAction,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong, please try again" });
  }
});

router.post("/:id/end", requireAuth("teacher"), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [req.params.id]);
    const session = result.rows[0];
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "This isn't your session" });
    }

    await pool.query(
      "UPDATE sessions SET status = 'ended', ended_at = now(), current_token = NULL WHERE id = $1",
      [req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong, please try again" });
  }
});

// Roster + flags for the teacher's dashboard. Also pushed live via socket,
// but this lets the page load with current data on refresh.
router.get("/:id/roster", requireAuth("teacher"), async (req, res) => {
  try {
    const sessionResult = await pool.query("SELECT * FROM sessions WHERE id = $1", [req.params.id]);
    const session = sessionResult.rows[0];
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "This isn't your session" });
    }

    const rosterResult = await pool.query(
      `SELECT a.marked_at, a.face_distance, s.roll_no, s.name
       FROM attendance a JOIN students s ON s.id = a.student_id
       WHERE a.session_id = $1 ORDER BY a.marked_at ASC`,
      [req.params.id]
    );

    const flagsResult = await pool.query(
      "SELECT * FROM attendance_flags WHERE session_id = $1 ORDER BY created_at DESC",
      [req.params.id]
    );

    res.json({ session, roster: rosterResult.rows, flags: flagsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong, please try again" });
  }
});

module.exports = router;
