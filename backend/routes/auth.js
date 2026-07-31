// routes/auth.js
// Registration and login for teachers and students.
// Student registration also stores a face descriptor (128 numbers produced
// by face-api.js in the browser) that later check-ins are matched against.

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");

const router = express.Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "12h" });
}

// ---------- Teacher ----------

const teacherRegisterSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(100).required(),
});

router.post("/teacher/register", async (req, res) => {
  const { error, value } = teacherRegisterSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const existing = await pool.query("SELECT id FROM teachers WHERE email = $1", [value.email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(value.password, 10);
    await pool.query(
      "INSERT INTO teachers (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
      [id, value.name, value.email, passwordHash]
    );

    const token = signToken({ id, role: "teacher", name: value.name });
    res.status(201).json({ token, name: value.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong, please try again" });
  }
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

router.post("/teacher/login", async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const result = await pool.query("SELECT * FROM teachers WHERE email = $1", [value.email]);
    const teacher = result.rows[0];
    if (!teacher || !bcrypt.compareSync(value.password, teacher.password_hash)) {
      return res.status(401).json({ error: "Incorrect email or password" });
    }

    const token = signToken({ id: teacher.id, role: "teacher", name: teacher.name });
    res.json({ token, name: teacher.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong, please try again" });
  }
});

// ---------- Student ----------

const studentRegisterSchema = Joi.object({
  rollNo: Joi.string().min(1).max(30).required(),
  name: Joi.string().min(2).max(80).required(),
  password: Joi.string().min(6).max(100).required(),
  faceDescriptor: Joi.array().items(Joi.number()).length(128).required(),
});

router.post("/student/register", async (req, res) => {
  const { error, value } = studentRegisterSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const existing = await pool.query("SELECT id FROM students WHERE roll_no = $1", [value.rollNo]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "This roll number is already registered" });
    }

    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(value.password, 10);
    await pool.query(
      "INSERT INTO students (id, roll_no, name, password_hash, face_descriptor) VALUES ($1, $2, $3, $4, $5)",
      [id, value.rollNo, value.name, passwordHash, JSON.stringify(value.faceDescriptor)]
    );

    const token = signToken({ id, role: "student", rollNo: value.rollNo, name: value.name });
    res.status(201).json({ token, name: value.name, rollNo: value.rollNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong, please try again" });
  }
});

const studentLoginSchema = Joi.object({
  rollNo: Joi.string().required(),
  password: Joi.string().required(),
});

router.post("/student/login", async (req, res) => {
  const { error, value } = studentLoginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const result = await pool.query("SELECT * FROM students WHERE roll_no = $1", [value.rollNo]);
    const student = result.rows[0];
    if (!student || !bcrypt.compareSync(value.password, student.password_hash)) {
      return res.status(401).json({ error: "Incorrect roll number or password" });
    }

    const token = signToken({ id: student.id, role: "student", rollNo: student.roll_no, name: student.name });
    res.json({ token, name: student.name, rollNo: student.roll_no });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong, please try again" });
  }
});

module.exports = router;
