// utils/livenessActions.js
// One of these is picked at random when a session starts, and stays the
// same for every student checking into that session. Randomizing it per
// session (instead of always asking for a blink) means a replayed video of
// a student blinking on cue can't be pre-recorded to match — the instruction
// isn't known until the QR is actually scanned.

const LIVENESS_ACTIONS = ["blink", "look_left", "look_right", "look_up", "look_down"];

function pickRandomAction() {
  return LIVENESS_ACTIONS[Math.floor(Math.random() * LIVENESS_ACTIONS.length)];
}

module.exports = { LIVENESS_ACTIONS, pickRandomAction };
