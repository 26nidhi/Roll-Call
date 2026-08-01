// api.js
// Thin wrapper around fetch that points at the backend and attaches the
// JWT (stored per role) as a Bearer token automatically.

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export function saveAuth(role, data) {
  localStorage.setItem(`attendance_${role}`, JSON.stringify(data));
}

export function getAuth(role) {
  const raw = localStorage.getItem(`attendance_${role}`);
  return raw ? JSON.parse(raw) : null;
}

export function clearAuth(role) {
  localStorage.removeItem(`attendance_${role}`);
}

export async function apiRequest(path, { method = "GET", body, role } = {}) {
  const auth = role ? getAuth(role) : null;
  const headers = { "Content-Type": "application/json" };
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// Stable per-browser device ID, used server-side to enforce
// "one device = one check-in per session". Regenerating this requires
// clearing site data, which is a deliberate, small amount of friction.
export function getDeviceId() {
  let id = localStorage.getItem("attendance_device_id");
  if (!id) {
    id = crypto.randomUUID() + "-" + Date.now();
    localStorage.setItem("attendance_device_id", id);
  }
  return id;
}
