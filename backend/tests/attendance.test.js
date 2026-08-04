// tests/attendance.test.js
// Tests the core anti-cheat logic directly against the API — the same
// checks a real scan-and-verify would trigger, but without needing a
// camera, QR scanner, or the token-rotation interval from server.js
// (that only runs inside the full server; here we set the session's
// current token directly via SQL, exactly like the rotation loop would).

const request = require("supertest");
const { pool, initDb } = require("../db");
const {
  buildApp,
  resetDb,
  registerTeacher,
  registerStudent,
  baseDescriptor,
  nudgedDescriptor,
} = require("./helpers");

const app = buildApp();

async function startSession(teacherToken, subject = "Maths") {
  const res = await request(app)
    .post("/api/session/start")
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ subject });
  return res.body.sessionId;
}

async function setSessionToken(sessionId, { token, expiresInMs = 8000 }) {
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString();
  await pool.query("UPDATE sessions SET current_token = $1, token_expires_at = $2 WHERE id = $3", [
    token,
    expiresAt,
    sessionId,
  ]);
  return { token, expiresAt };
}

async function setCheckinDeadline(sessionId, msFromNow) {
  const deadline = new Date(Date.now() + msFromNow).toISOString();
  await pool.query("UPDATE sessions SET checkin_deadline = $1 WHERE id = $2", [deadline, sessionId]);
}

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await pool.end();
});

describe("QR token validity", () => {
  test("rejects a token that doesn't match the session's current token", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    await setSessionToken(sessionId, { token: "the-real-token" });

    const { res: studentRes } = await registerStudent(app);

    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentRes.body.token}`)
      .send({
        sessionId,
        qrToken: "a-forged-or-old-token",
        deviceId: "device-aaaaaaaaaa",
        faceDescriptor: baseDescriptor(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  test("rejects a token that has expired", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    // expiresInMs negative == already expired, simulating a screenshotted/forwarded QR
    await setSessionToken(sessionId, { token: "stale-token", expiresInMs: -5000 });

    const { res: studentRes } = await registerStudent(app);

    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentRes.body.token}`)
      .send({
        sessionId,
        qrToken: "stale-token",
        deviceId: "device-bbbbbbbbbb",
        faceDescriptor: baseDescriptor(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  test("accepts a valid, unexpired token with a matching face", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    const { token } = await setSessionToken(sessionId, { token: "fresh-token" });

    const { res: studentRes } = await registerStudent(app);

    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentRes.body.token}`)
      .send({
        sessionId,
        qrToken: token,
        deviceId: "device-cccccccccc",
        faceDescriptor: baseDescriptor(), // identical to registered descriptor
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});

describe("one device = one check-in per session", () => {
  test("blocks a second student from checking in on the same device", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    const { token } = await setSessionToken(sessionId, { token: "shared-token" });

    const { res: studentA } = await registerStudent(app);
    const { res: studentB } = await registerStudent(app);
    const sharedDeviceId = "device-shared-by-two-students";

    const firstAttempt = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentA.body.token}`)
      .send({ sessionId, qrToken: token, deviceId: sharedDeviceId, faceDescriptor: baseDescriptor() });
    expect(firstAttempt.status).toBe(201);

    const secondAttempt = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentB.body.token}`)
      .send({ sessionId, qrToken: token, deviceId: sharedDeviceId, faceDescriptor: baseDescriptor() });

    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error).toMatch(/device/i);
  });
});

describe("one student can't be marked twice in the same session", () => {
  test("blocks a repeat check-in from the same student on a different device", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    const { token } = await setSessionToken(sessionId, { token: "repeat-token" });

    const { res: studentRes } = await registerStudent(app);

    const firstAttempt = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentRes.body.token}`)
      .send({ sessionId, qrToken: token, deviceId: "device-one", faceDescriptor: baseDescriptor() });
    expect(firstAttempt.status).toBe(201);

    const secondAttempt = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentRes.body.token}`)
      .send({ sessionId, qrToken: token, deviceId: "device-two", faceDescriptor: baseDescriptor() });

    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error).toMatch(/already/i);
  });
});

describe("face matching", () => {
  test("rejects a face descriptor far from the registered one", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    const { token } = await setSessionToken(sessionId, { token: "face-test-token" });

    const { res: studentRes } = await registerStudent(app); // registered with baseDescriptor()

    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentRes.body.token}`)
      .send({
        sessionId,
        qrToken: token,
        deviceId: "device-mismatch",
        faceDescriptor: nudgedDescriptor(2.0), // well beyond the 0.5 threshold
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/face/i);
  });

  test("accepts a face descriptor within the match threshold", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    const { token } = await setSessionToken(sessionId, { token: "face-close-token" });

    const { res: studentRes } = await registerStudent(app);

    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentRes.body.token}`)
      .send({
        sessionId,
        qrToken: token,
        deviceId: "device-close-match",
        faceDescriptor: nudgedDescriptor(0.1), // small, natural variation
      });

    expect(res.status).toBe(201);
  });
});

describe("session status and time window", () => {
  test("rejects check-ins after the session has ended", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    const { token } = await setSessionToken(sessionId, { token: "ended-session-token" });

    await request(app)
      .post(`/api/session/${sessionId}/end`)
      .set("Authorization", `Bearer ${teacherRes.body.token}`);

    const { res: studentRes } = await registerStudent(app);

    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentRes.body.token}`)
      .send({ sessionId, qrToken: token, deviceId: "device-after-end", faceDescriptor: baseDescriptor() });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ended/i);
  });

  test("rejects check-ins after the check-in window has closed", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    const { token } = await setSessionToken(sessionId, { token: "late-token" });
    await setCheckinDeadline(sessionId, -1000); // deadline already passed

    const { res: studentRes } = await registerStudent(app);

    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${studentRes.body.token}`)
      .send({ sessionId, qrToken: token, deviceId: "device-late", faceDescriptor: baseDescriptor() });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/window/i);
  });
});

describe("rate limiting on repeated attempts", () => {
  const ORIGINAL = process.env.DISABLE_RATE_LIMIT;

  beforeAll(() => {
    process.env.DISABLE_RATE_LIMIT = "false"; // re-enable just for this block
  });

  afterAll(() => {
    process.env.DISABLE_RATE_LIMIT = ORIGINAL;
  });

  test("blocks a burst of attempts beyond the limit", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const sessionId = await startSession(teacherRes.body.token);
    await setSessionToken(sessionId, { token: "rate-limit-token" });

    const { res: studentRes } = await registerStudent(app);

    const attempt = () =>
      request(app)
        .post("/api/attendance/mark")
        .set("Authorization", `Bearer ${studentRes.body.token}`)
        .send({
          sessionId,
          qrToken: "wrong-token-on-purpose", // fails validation, but still counts toward the limit
          deviceId: "device-rate-limit",
          faceDescriptor: baseDescriptor(),
        });

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await attempt());
    }

    const rateLimited = results.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
