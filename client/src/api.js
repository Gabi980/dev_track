const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function request(path, options = {}) {
  const token = localStorage.getItem("devtrack_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.message || "Request failed.", response.status);
  }

  return data;
}

export const api = {
  login: (email, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  users: () => request("/users"),
  projects: () => request("/projects"),
  createProject: (project) =>
    request("/projects", {
      method: "POST",
      body: JSON.stringify(project)
    }),
  issues: (filters) => request(`/issues${toQueryString(filters)}`),
  issue: (id) => request(`/issues/${id}`),
  createIssue: (issue) =>
    request("/issues", {
      method: "POST",
      body: JSON.stringify(issue)
    }),
  updateIssue: (id, patch) =>
    request(`/issues/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  addComment: (id, body) =>
    request(`/issues/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    }),
  stats: () => request("/dashboard/stats")
};

function toQueryString(filters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== "all") {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}
