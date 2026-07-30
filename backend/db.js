// db.js
// Postgres connection pool + schema setup. Every query in this app goes
// through `pool.query(...)`, which is async — this is the main practical
// difference from the old SQLite version, where queries were synchronous.
//
// UNIQUE constraints (session_id + student_id, session_id + device_id) are
// still what actually stops double check-ins under a race condition; that
// guarantee comes from Postgres itself, not from the JS code around it.

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teachers (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS students (
      id UUID PRIMARY KEY,
      roll_no TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      face_descriptor JSONB NOT NULL, -- 128 floats from face-api.js
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      teacher_id UUID NOT NULL REFERENCES teachers(id),
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'ended'
      current_token TEXT,
      token_expires_at TIMESTAMPTZ,
      liveness_action TEXT NOT NULL DEFAULT 'blink',
      checkin_deadline TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES sessions(id),
      student_id UUID NOT NULL REFERENCES students(id),
      device_id TEXT NOT NULL,
      face_distance REAL NOT NULL,
      marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(session_id, student_id),
      UNIQUE(session_id, device_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_flags (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL,
      student_id UUID,
      reason TEXT NOT NULL,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

module.exports = { pool, initDb };
