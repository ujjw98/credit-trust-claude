const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function getToken() {
  return localStorage.getItem("credittrust_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("credittrust_token", token);
  else localStorage.removeItem("credittrust_token");
}

export function getActorType() {
  return localStorage.getItem("credittrust_actor_type"); // 'business' | 'retailer'
}

export function setActorType(type) {
  if (type) localStorage.setItem("credittrust_actor_type", type);
  else localStorage.removeItem("credittrust_actor_type");
}

export function clearSession() {
  setToken(null);
  setActorType(null);
}

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, { method = "GET", body, auth = true, isBlob = false } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      // ignore parse errors
    }
    const message =
      typeof detail === "string" ? detail : detail?.message || JSON.stringify(detail);
    throw new ApiError(message, res.status, detail);
  }

  if (isBlob) return res.blob();
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  del: (path, opts) => request(path, { ...opts, method: "DELETE" }),
  blob: (path, opts) => request(path, { ...opts, method: "GET", isBlob: true }),
};

export { ApiError, BASE_URL };
