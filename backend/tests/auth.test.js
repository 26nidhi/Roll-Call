// tests/auth.test.js

const request = require("supertest");
const { pool, initDb } = require("../db");
const { buildApp, resetDb, registerTeacher, registerStudent, baseDescriptor } = require("./helpers");

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

describe("teacher auth", () => {
  test("can register and receive a token", async () => {
    const { res } = await registerTeacher(app);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  test("rejects a second registration with the same email", async () => {
    const { payload } = await registerTeacher(app);
    const res = await request(app).post("/api/auth/teacher/register").send({
      ...payload,
      name: "Someone Else",
    });
    expect(res.status).toBe(409);
  });

  test("rejects registration with a short password", async () => {
    const res = await request(app)
      .post("/api/auth/teacher/register")
      .send({ name: "Ms. Rao", email: "short@example.com", password: "123" });
    expect(res.status).toBe(400);
  });

  test("logs in with correct credentials", async () => {
    const { payload } = await registerTeacher(app);
    const res = await request(app)
      .post("/api/auth/teacher/login")
      .send({ email: payload.email, password: payload.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test("rejects login with wrong password", async () => {
    const { payload } = await registerTeacher(app);
    const res = await request(app)
      .post("/api/auth/teacher/login")
      .send({ email: payload.email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });
});

describe("student auth", () => {
  test("can register with a 128-number face descriptor", async () => {
    const { res } = await registerStudent(app);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  test("rejects a face descriptor that isn't 128 numbers", async () => {
    const res = await request(app).post("/api/auth/student/register").send({
      rollNo: "R999",
      name: "Bad Descriptor",
      password: "password123",
      faceDescriptor: [1, 2, 3], // wrong length
    });
    expect(res.status).toBe(400);
  });

  test("rejects a second registration with the same roll number", async () => {
    const { payload } = await registerStudent(app);
    const res = await request(app)
      .post("/api/auth/student/register")
      .send({ ...payload, name: "Different Name" });
    expect(res.status).toBe(409);
  });

  test("logs in with correct roll number and password", async () => {
    const { payload } = await registerStudent(app);
    const res = await request(app)
      .post("/api/auth/student/login")
      .send({ rollNo: payload.rollNo, password: payload.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test("rejects login with wrong roll number", async () => {
    const res = await request(app)
      .post("/api/auth/student/login")
      .send({ rollNo: "no-such-roll-no", password: "password123" });
    expect(res.status).toBe(401);
  });
});
