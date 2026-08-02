import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FaceCapture from "../components/FaceCapture.jsx";
import { apiRequest, saveAuth } from "../api";

export default function StudentRegister() {
  const [form, setForm] = useState({ rollNo: "", name: "", password: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const faceRef = useRef(null);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!faceRef.current?.isReady()) {
      setError("Camera/face models still loading — wait a moment and try again");
      return;
    }

    setLoading(true);
    try {
      setStatus("Capturing your face…");
      const faceDescriptor = await faceRef.current.captureDescriptor();

      setStatus("Creating account…");
      const data = await apiRequest("/api/auth/student/register", {
        method: "POST",
        body: { ...form, faceDescriptor },
      });
      saveAuth("student", data);
      navigate("/student/scan");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Register</h1>
      <p className="text-sm text-ink/60">
        This one-time face capture is what your attendance check-ins are matched against — make sure
        you're in good, even lighting.
      </p>

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
          <label className="label">Full name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
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

        <div>
          <label className="label">Face capture</label>
          <FaceCapture ref={faceRef} onStatus={() => {}} />
        </div>

        {status && <p className="text-accent text-sm">{status}</p>}
        {error && <p className="text-danger text-sm">{error}</p>}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Please wait…" : "Register"}
        </button>
      </form>
    </div>
  );
}
