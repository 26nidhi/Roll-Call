// FaceCapture.jsx
// Wraps the webcam + face-api.js. Exposes two capture modes via ref:
//
//   captureDescriptor()  — one detection, returns a 128-number descriptor.
//                           Used once at registration time.
//
//   captureWithAction(action) — takes a "neutral" baseline frame, waits a
//                           moment, then takes a second frame and checks the
//                           student actually did the requested action
//                           (blink / look left / right / up / down) by
//                           comparing simple landmark-based measurements
//                           between the two frames. The action is assigned
//                           randomly per session by the server and shown to
//                           the student right before this runs — so a
//                           pre-recorded video of the student blinking on
//                           cue won't match if the instruction that session
//                           was "look left" instead. Still a heuristic, not
//                           a guarantee — see the README for its limits.
//
// Model files are loaded from /models, which you need to download once
// (see README) since we can't bundle ~15MB of model weights here.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as faceapi from "face-api.js";

const MODEL_URL = "/models";

function eyeAspectRatio(eyePoints) {
  // eyePoints: 6 landmark points around one eye, face-api.js ordering
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const vertical1 = dist(eyePoints[1], eyePoints[5]);
  const vertical2 = dist(eyePoints[2], eyePoints[4]);
  const horizontal = dist(eyePoints[0], eyePoints[3]);
  return (vertical1 + vertical2) / (2 * horizontal);
}

const FaceCapture = forwardRef(function FaceCapture({ onStatus }, ref) {
  const videoRef = useRef(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream;
    async function setup() {
      try {
        onStatus?.("Loading face detection models…");
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsReady(true);

        onStatus?.("Requesting camera access…");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 320, height: 240 },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (playErr) {
            if (playErr.name !== "AbortError") throw playErr;
          }
        }
        setCameraReady(true);
        onStatus?.("Ready");
      } catch (err) {
        setError(err.message || "Couldn't access camera or load models");
        onStatus?.("error");
      }
    }
    setup();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function detectOnce() {
    const result = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    return result || null;
  }

  // Nose-tip position relative to the face's own bounding box. This stays
  // roughly centered when looking straight at the camera, and shifts
  // predictably when the head turns/tilts — independent of how close the
  // face is to the camera, since it's normalized by box size.
  function nosePosition(result) {
    const box = result.detection.box;
    const nose = result.landmarks.getNose();
    const tip = nose[Math.floor(nose.length / 2)]; // roughly the tip
    return {
      x: (tip.x - box.x) / box.width,
      y: (tip.y - box.y) / box.height,
    };
  }

  function earOf(result) {
    return (eyeAspectRatio(result.landmarks.getLeftEye()) + eyeAspectRatio(result.landmarks.getRightEye())) / 2;
  }

  useImperativeHandle(ref, () => ({
    async captureDescriptor() {
      const result = await detectOnce();
      if (!result) throw new Error("No face detected — center your face in the frame and try again");
      return Array.from(result.descriptor);
    },

    // action: 'blink' | 'look_left' | 'look_right' | 'look_up' | 'look_down'
    async captureWithAction(action) {
      const baseline = await detectOnce();
      if (!baseline) throw new Error("No face detected — center your face in the frame and try again");

      await new Promise((r) => setTimeout(r, 1100));

      const directed = await detectOnce();
      if (!directed) throw new Error("Lost track of your face — try again and stay in frame");

      let passed = false;
      const nose0 = nosePosition(baseline);
      const nose1 = nosePosition(directed);

      if (action === "blink") {
        const change = Math.abs(earOf(baseline) - earOf(directed));
        passed = change > 0.03;
      } else if (action === "look_left") {
        passed = nose1.x - nose0.x < -0.06;
      } else if (action === "look_right") {
        passed = nose1.x - nose0.x > 0.06;
      } else if (action === "look_up") {
        passed = nose1.y - nose0.y < -0.05;
      } else if (action === "look_down") {
        passed = nose1.y - nose0.y > 0.05;
      } else {
        passed = true; // unknown action code — don't hard-block the student
      }

      if (!passed) {
        throw new Error("Didn't catch that — follow the instruction shown and hold steady, then try again");
      }

      // Descriptor from the directed frame, since that's the one that proves liveness
      return Array.from(directed.descriptor);
    },

    isReady() {
      return modelsReady && cameraReady;
    },
  }));

  return (
    <div className="w-full">
      <video
        ref={videoRef}
        muted
        playsInline
        className="w-full rounded-xl bg-black/80 aspect-[4/3] object-cover"
      />
      {error && <p className="text-danger text-sm mt-2">{error}</p>}
      {!modelsReady && !error && <p className="text-ink/50 text-sm mt-2">Loading face models…</p>}
    </div>
  );
});

export default FaceCapture;
