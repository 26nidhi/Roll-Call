// tests/helpers.js
// Shared setup used across test files: truncating tables between tests,
// registering a teacher/student through the real API (so tests exercise
// the actual registration code path, not a shortcut), and building fake
// 128-number face descriptors for match/mismatch scenarios.

const request = require("supertest");
const { pool } = require("../db");
const { createApp } = require("../app");

function buildApp() {
  return createApp();
}

async function resetDb() {
  await pool.query(
    "TRUNCATE attendance_flags, attendance, sessions, students, teachers RESTART IDENTITY CASCADE"
  );
}

// A stable "base" descriptor plus a small helper to nudge it — lets tests
// express "close enough to match" vs "clearly a different face" in terms
// of euclidean distance, the same metric routes/attendance.js uses.
function baseDescriptor() {
  return new Array(128).fill(0).map((_, i) => Math.sin(i)); // deterministic, not all-zero
}

function nudgedDescriptor(distanceBudget) {
  // Spreads a target euclidean distance evenly across all 128 dimensions.
  const perDim = distanceBudget / Math.sqrt(128);
  return baseDescriptor().map((v) => v + perDim);
}

async function registerTeacher(app, overrides = {}) {
  const payload = {
    name: "Ms. Rao",
    email: `teacher${Date.now()}${Math.random()}@example.com`,
    password: "password123",
    ...overrides,
  };
  const res = await request(app).post("/api/auth/teacher/register").send(payload);
  return { res, payload };
}

async function registerStudent(app, overrides = {}) {
  const payload = {
    rollNo: `R${Date.now()}${Math.floor(Math.random() * 10000)}`,
    name: "Asha Kumar",
    password: "password123",
    faceDescriptor: baseDescriptor(),
    ...overrides,
  };
  const res = await request(app).post("/api/auth/student/register").send(payload);
  return { res, payload };
}

module.exports = {
  buildApp,
  resetDb,
  baseDescriptor,
  nudgedDescriptor,
  registerTeacher,
  registerStudent,
};
