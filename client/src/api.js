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
  register: (account) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify(account)
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  workspaces: () => request("/workspaces"),
  searchWorkspaces: (query) => request(`/workspaces/search${toQueryString({ q: query })}`),
  createWorkspace: (workspace) =>
    request("/workspaces", {
      method: "POST",
      body: JSON.stringify(workspace)
    }),
  joinWorkspace: (payload) =>
    request("/workspaces/join", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateWorkspaceMemberRole: (workspaceId, userId, role) =>
    request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role })
    }),
  leaveWorkspace: (workspaceId) =>
    request(`/workspaces/${workspaceId}/members/me`, {
      method: "DELETE"
    }),
  removeWorkspaceMember: (workspaceId, userId) =>
    request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE"
    }),
  users: (workspaceId) => request(`/users${toQueryString({ workspaceId })}`),
  projects: (workspaceId) => request(`/projects${toQueryString({ workspaceId })}`),
  createProject: (project) =>
    request("/projects", {
      method: "POST",
      body: JSON.stringify(project)
    }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),
  issues: (filters) => request(`/issues${toQueryString(filters)}`),
  issue: (id, workspaceId) => request(`/issues/${id}${toQueryString({ workspaceId })}`),
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
  deleteIssue: (id) => request(`/issues/${id}`, { method: "DELETE" }),
  addComment: (id, body) =>
    request(`/issues/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    }),
  stats: (workspaceId) => request(`/dashboard/stats${toQueryString({ workspaceId })}`)
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
