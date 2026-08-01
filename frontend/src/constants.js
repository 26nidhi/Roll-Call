// constants.js
// Human-readable labels for the liveness actions the server can assign to
// a session. Keep the keys in sync with backend/utils/livenessActions.js.

export const LIVENESS_LABELS = {
  blink: { text: "Blink naturally", icon: "👁️" },
  look_left: { text: "Turn your head to the left", icon: "⬅️" },
  look_right: { text: "Turn your head to the right", icon: "➡️" },
  look_up: { text: "Tilt your head up", icon: "⬆️" },
  look_down: { text: "Tilt your head down", icon: "⬇️" },
};

export function livenessLabel(action) {
  return LIVENESS_LABELS[action] || { text: "Look at the camera", icon: "🙂" };
}
