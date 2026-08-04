// tests/session.test.js

const request = require("supertest");
const { pool, initDb } = require("../db");
const { buildApp, resetDb, registerTeacher, registerStudent } = require("./helpers");

const app = buildApp();

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await pool.end();
});

describe("starting a session", () => {
  test("rejects requests with no auth token", async () => {
    const res = await request(app).post("/api/session/start").send({ subject: "Physics" });
    expect(res.status).toBe(401);
  });

  test("rejects a student token (only teachers can start sessions)", async () => {
    const { payload: studentPayload } = await registerStudent(app);
    const loginRes = await request(app)
      .post("/api/auth/student/login")
      .send({ rollNo: studentPayload.rollNo, password: studentPayload.password });

    const res = await request(app)
      .post("/api/session/start")
      .set("Authorization", `Bearer ${loginRes.body.token}`)
      .send({ subject: "Physics" });
    expect(res.status).toBe(403);
  });

  test("a logged-in teacher can start a session and gets a liveness action assigned", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const res = await request(app)
      .post("/api/session/start")
      .set("Authorization", `Bearer ${teacherRes.body.token}`)
      .send({ subject: "Chemistry" });

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeDefined();
    expect(["blink", "look_left", "look_right", "look_up", "look_down"]).toContain(
      res.body.livenessAction
    );
  });
});

describe("ending a session", () => {
  test("a teacher can't end another teacher's session", async () => {
    const { res: teacherA } = await registerTeacher(app);
    const { res: teacherB } = await registerTeacher(app);

    const startRes = await request(app)
      .post("/api/session/start")
      .set("Authorization", `Bearer ${teacherA.body.token}`)
      .send({ subject: "Biology" });

    const endRes = await request(app)
      .post(`/api/session/${startRes.body.sessionId}/end`)
      .set("Authorization", `Bearer ${teacherB.body.token}`);

    expect(endRes.status).toBe(403);
  });

  test("the owning teacher can end their own session", async () => {
    const { res: teacherRes } = await registerTeacher(app);
    const startRes = await request(app)
      .post("/api/session/start")
      .set("Authorization", `Bearer ${teacherRes.body.token}`)
      .send({ subject: "Biology" });

    const endRes = await request(app)
      .post(`/api/session/${startRes.body.sessionId}/end`)
      .set("Authorization", `Bearer ${teacherRes.body.token}`);

    expect(endRes.status).toBe(200);
  });
});
