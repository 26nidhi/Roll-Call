import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest, saveAuth } from "../api";

export default function StudentLogin() {
  const [form, setForm] = useState({ rollNo: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest("/api/auth/student/login", { method: "POST", body: form });
      saveAuth("student", data);
      navigate("/student/scan");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Student login</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">Roll number</label>
          <input
            className="input"
            value={form.rollNo}
            onChange={(e) => setForm({ ...form, rollNo: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Please wait…" : "Log in"}
        </button>
      </form>

      <Link to="/student/register" className="text-sm text-accent underline block">
        First time here? Register your account and face
      </Link>
    </div>
  );
}
