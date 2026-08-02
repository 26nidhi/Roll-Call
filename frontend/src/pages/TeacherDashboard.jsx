import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { API_BASE, apiRequest, getAuth } from "../api";
import { livenessLabel } from "../constants";

export default function TeacherDashboard() {
  const [subject, setSubject] = useState("");
  const [session, setSession] = useState(null); // { sessionId, subject, checkinDeadline }
  const [qrImage, setQrImage] = useState(null);
  const [action, setAction] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const auth = getAuth("teacher");
    if (!auth) navigate("/teacher/login");
  }, []);

  useEffect(() => {
    if (!session) return;

    const auth = getAuth("teacher");
    const socket = io(API_BASE, { auth: { token: auth.token } });
    socketRef.current = socket;

    socket.emit("teacher:join-session", session.sessionId);

    socket.on("qr:update", ({ qrImageDataUrl, expiresAt, action }) => {
      setQrImage(qrImageDataUrl);
      setAction(action);
      const tick = () => {
        const secs = Math.max(0, Math.round((new Date(expiresAt) - new Date()) / 1000));
        setSecondsLeft(secs);
      };
      tick();
    });

    socket.on("roster:update", ({ roster }) => setRoster(roster));
    socket.on("error", (err) => setError(err.error || "Connection error"));

    return () => socket.disconnect();
  }, [session]);

  // Local countdown ticker between QR pushes
  useEffect(() => {
    if (secondsLeft === null) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft !== null]);

  async function startSession(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest("/api/session/start", {
        method: "POST",
        role: "teacher",
        body: { subject },
      });
      setSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function endSession() {
    try {
      await apiRequest(`/api/session/${session.sessionId}/end`, { method: "POST", role: "teacher" });
      socketRef.current?.disconnect();
      setSession(null);
      setQrImage(null);
      setRoster([]);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!session) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">Start a session</h1>
        <form onSubmit={startSession} className="card space-y-4">
          <div>
            <label className="label">Subject / class name</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Starting…" : "Start session"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{session.subject}</h1>
        <button className="text-sm text-danger underline" onClick={endSession}>
          End session
        </button>
      </div>

      <div className="card text-center space-y-3">
        {qrImage ? (
          <>
            <img src={qrImage} alt="Attendance QR code" className="mx-auto rounded-xl w-64 h-64" />
            <p className="text-sm text-ink/50">Refreshes in {secondsLeft}s — this is intentional</p>
            {action && (
              <p className="text-xs text-ink/40">
                Students will be asked to: <span className="font-medium text-ink/60">{livenessLabel(action).text}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-ink/50 text-sm py-16">Connecting…</p>
        )}
      </div>

      <div className="card">
        <p className="font-display font-bold mb-3">Live roster ({roster.length})</p>
        {roster.length === 0 ? (
          <p className="text-sm text-ink/50">No check-ins yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {roster.map((r) => (
              <li key={r.roll_no} className="py-2 flex justify-between text-sm">
                <span>
                  {r.name} <span className="text-ink/40">({r.roll_no})</span>
                </span>
                <span className="text-ink/40">{new Date(r.marked_at + "Z").toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}
