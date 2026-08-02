import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import FaceCapture from "../components/FaceCapture.jsx";
import { apiRequest, getAuth, getDeviceId } from "../api";
import { livenessLabel } from "../constants";

const SCANNER_ELEMENT_ID = "qr-scanner";

export default function StudentScan() {
  const [stage, setStage] = useState("scan"); // 'scan' | 'verify' | 'done' | 'error'
  const [scannedData, setScannedData] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef(null);
  const faceRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const auth = getAuth("student");
    if (!auth) {
      navigate("/student/login");
      return;
    }
  }, []);

  useEffect(() => {
    if (stage !== "scan") return;

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (stopped) return;
          try {
            const data = JSON.parse(decodedText);
            if (!data.sessionId || !data.token) throw new Error();
            stopped = true;
            setScannedData(data);
            scanner.stop().catch(() => {});
            setStage("verify");
          } catch {
            // Not our QR format — ignore and keep scanning
          }
        },
        () => {} // ignore per-frame scan failures, expected while aiming camera
      )
      .catch((err) => {
        setError("Couldn't access camera: " + err.message);
      });

    return () => {
      if (!stopped) scanner.stop().catch(() => {});
    };
  }, [stage]);

  async function handleVerify() {
    setError("");
    if (!faceRef.current?.isReady()) {
      setError("Camera/face models still loading — wait a moment and try again");
      return;
    }
    setLoading(true);
    try {
      setMessage(`Checking you're really there — ${livenessLabel(scannedData.action).text.toLowerCase()}…`);
      const faceDescriptor = await faceRef.current.captureWithAction(scannedData.action);

      setMessage("Marking attendance…");
      await apiRequest("/api/attendance/mark", {
        method: "POST",
        role: "student",
        body: {
          sessionId: scannedData.sessionId,
          qrToken: scannedData.token,
          deviceId: getDeviceId(),
          faceDescriptor,
        },
      });

      setStage("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setMessage("");
    }
  }

  function retryScan() {
    setScannedData(null);
    setError("");
    setStage("scan");
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Mark attendance</h1>

      {stage === "scan" && (
        <div className="card space-y-3">
          <p className="text-sm text-ink/60">Point your camera at the QR code on the teacher's screen.</p>
          <div id={SCANNER_ELEMENT_ID} className="rounded-xl overflow-hidden" />
          {error && <p className="text-danger text-sm">{error}</p>}
        </div>
      )}

      {stage === "verify" && (
        <div className="card space-y-4">
          <div className="bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 text-center">
            <p className="text-2xl">{livenessLabel(scannedData.action).icon}</p>
            <p className="font-display font-bold mt-1">{livenessLabel(scannedData.action).text}</p>
            <p className="text-xs text-ink/50 mt-1">
              This instruction is the same for everyone this session — do it when you tap verify below.
            </p>
          </div>
          <FaceCapture ref={faceRef} onStatus={() => {}} />
          {message && <p className="text-accent text-sm">{message}</p>}
          {error && (
            <div className="space-y-2">
              <p className="text-danger text-sm">{error}</p>
              <button className="btn-secondary w-full" onClick={retryScan}>
                Scan QR again
              </button>
            </div>
          )}
          <button className="btn-primary w-full" onClick={handleVerify} disabled={loading}>
            {loading ? "Verifying…" : "Verify & mark attendance"}
          </button>
        </div>
      )}

      {stage === "done" && (
        <div className="card text-center space-y-2 border-accent/40">
          <p className="text-3xl">✅</p>
          <p className="font-display font-bold text-lg">Attendance marked</p>
          <p className="text-sm text-ink/60">You're all set for this session.</p>
        </div>
      )}
    </div>
  );
}
