import express from "express";
import cors from "cors";
import { all, get, getDatabase, lastInsertId, run, saveDatabase } from "./db.js";
import { createSessionToken, hashPassword, verifyPassword } from "./security.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const sessions = new Map();
const db = await getDatabase();

const STATUSES = ["todo", "in_progress", "testing", "done"];
const PRIORITIES = ["low", "medium", "high"];
const TYPES = ["task", "bug"];
const WORKSPACE_ROLES = ["admin", "developer", "tester"];
const AVATAR_COLORS = ["#ef4444", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0f766e"];

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "DevTrack API" });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const user = get(
    db,
    `SELECT id, name, email, role, password_hash AS passwordHash, avatar_color AS avatarColor
     FROM users
     WHERE email = ?`,
    [email]
  );

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const token = createSessionToken();
  const publicUser = toPublicUser(user);
  sessions.set(token, publicUser);

  res.json({ token, user: publicUser });
});

app.post("/api/auth/register", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (name.length < 2 || !email.includes("@") || password.length < 6) {
    return res.status(400).json({
      message: "Name, a valid email, and a password of at least 6 characters are required."
    });
  }

  try {
    run(
      db,
      `INSERT INTO users (name, email, role, password_hash, avatar_color)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, "developer", hashPassword(password), pickAvatarColor(email)]
    );

    const user = get(
      db,
      `SELECT id, name, email, role, avatar_color AS avatarColor
       FROM users
       WHERE id = ?`,
      [lastInsertId(db)]
    );
    const token = createSessionToken();
    const publicUser = toPublicUser(user);
    sessions.set(token, publicUser);
    saveDatabase(db);

    res.status(201).json({ token, user: publicUser });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    throw error;
  }
});

app.use("/api", requireAuth);

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/logout", (req, res) => {
  sessions.delete(req.token);
  res.status(204).send();
});

app.get("/api/workspaces", (req, res) => {
  res.json({ workspaces: getUserWorkspaces(req.user.id) });
});

app.get("/api/workspaces/search", (req, res) => {
  const query = String(req.query.q || "").trim().toLowerCase();

  if (query.length < 2) {
    return res.json({ workspaces: [] });
  }

  const workspaces = all(
    db,
    `SELECT
       w.id,
       w.name,
       w.slug,
       w.description,
       COUNT(DISTINCT wm.user_id) AS memberCount,
       COUNT(DISTINCT p.id) AS projectCount
     FROM workspaces w
     LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
     LEFT JOIN projects p ON p.workspace_id = w.id
     WHERE lower(w.name) LIKE ? OR lower(w.slug) LIKE ?
     GROUP BY w.id
     ORDER BY w.name
     LIMIT 8`,
    [`%${query}%`, `%${query}%`]
  ).map(toWorkspaceSearchResult);

  res.json({ workspaces });
});

app.post("/api/workspaces", (req, res) => {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim();
  const password = String(req.body.password || "");

  if (name.length < 3 || description.length < 8 || password.length < 6) {
    return res.status(400).json({
      message: "Workspace name, description, and a password of at least 6 characters are required."
    });
  }

  const slug = makeUniqueWorkspaceSlug(name);
  const inviteCode = makeInviteCode(slug);

  run(
    db,
    `INSERT INTO workspaces (name, slug, description, password_hash, owner_id, invite_code)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, slug, description, hashPassword(password), req.user.id, inviteCode]
  );

  const workspaceId = lastInsertId(db);
  run(
    db,
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES (?, ?, ?)`,
    [workspaceId, req.user.id, "admin"]
  );
  saveDatabase(db);

  res.status(201).json({
    workspace: getUserWorkspaces(req.user.id).find((workspace) => workspace.id === workspaceId)
  });
});

app.post("/api/workspaces/join", (req, res) => {
  const password = String(req.body.password || "");
  const inviteCode = String(req.body.inviteCode || "").trim().toUpperCase();
  const workspaceId = Number(req.body.workspaceId);
  let workspace;

  if (inviteCode) {
    workspace = get(db, "SELECT * FROM workspaces WHERE invite_code = ?", [inviteCode]);
  } else if (workspaceId) {
    workspace = get(db, "SELECT * FROM workspaces WHERE id = ?", [workspaceId]);

    if (!workspace || !verifyPassword(password, workspace.password_hash)) {
      return res.status(401).json({ message: "Workspace password is invalid." });
    }
  }

  if (!workspace) {
    return res.status(404).json({ message: "Workspace not found." });
  }

  run(
    db,
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES (?, ?, ?)
     ON CONFLICT(workspace_id, user_id) DO NOTHING`,
    [workspace.id, req.user.id, "developer"]
  );
  saveDatabase(db);

  res.json({
    workspace: getUserWorkspaces(req.user.id).find((item) => item.id === workspace.id)
  });
});

app.patch("/api/workspaces/:workspaceId/members/:userId", (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  const userId = Number(req.params.userId);
  const role = String(req.body.role || "");
  const workspace = get(db, "SELECT id, owner_id AS ownerId FROM workspaces WHERE id = ?", [
    workspaceId
  ]);

  if (!workspace) {
    return res.status(404).json({ message: "Workspace not found." });
  }

  if (workspace.ownerId !== req.user.id) {
    return res.status(403).json({
      message: "Only the workspace creator can change member roles."
    });
  }

  if (!WORKSPACE_ROLES.includes(role)) {
    return res.status(400).json({ message: "Invalid workspace role." });
  }

  if (userId === workspace.ownerId && role !== "admin") {
    return res.status(400).json({ message: "The workspace creator must remain an admin." });
  }

  const member = get(
    db,
    `SELECT user_id
     FROM workspace_members
     WHERE workspace_id = ? AND user_id = ?`,
    [workspaceId, userId]
  );

  if (!member) {
    return res.status(404).json({ message: "Workspace member not found." });
  }

  run(
    db,
    `UPDATE workspace_members
     SET role = ?
     WHERE workspace_id = ? AND user_id = ?`,
    [role, workspaceId, userId]
  );
  saveDatabase(db);

  res.json({ member: getWorkspaceMember(workspaceId, userId) });
});

app.delete("/api/workspaces/:workspaceId/members/me", (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  const workspace = get(db, "SELECT id, owner_id AS ownerId FROM workspaces WHERE id = ?", [
    workspaceId
  ]);

  if (!workspace) {
    return res.status(404).json({ message: "Workspace not found." });
  }

  const membership = getWorkspaceMembership(req.user.id, workspaceId);

  if (!membership) {
    return res.status(404).json({ message: "You are not a member of this workspace." });
  }

  leaveWorkspace(workspace, req.user.id);
  saveDatabase(db);

  res.status(204).send();
});

app.delete("/api/workspaces/:workspaceId/members/:userId", (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  const userId = Number(req.params.userId);
  const workspace = get(db, "SELECT id, owner_id AS ownerId FROM workspaces WHERE id = ?", [
    workspaceId
  ]);

  if (!workspace) {
    return res.status(404).json({ message: "Workspace not found." });
  }

  if (workspace.ownerId !== req.user.id) {
    return res.status(403).json({
      message: "Only the workspace creator can remove members."
    });
  }

  if (userId === workspace.ownerId) {
    return res.status(400).json({ message: "Use Leave Workspace to leave your own workspace." });
  }

  const member = getWorkspaceMember(workspaceId, userId);

  if (!member) {
    return res.status(404).json({ message: "Workspace member not found." });
  }

  run(db, "UPDATE issues SET assignee_id = NULL WHERE assignee_id = ? AND project_id IN (SELECT id FROM projects WHERE workspace_id = ?)", [
    userId,
    workspaceId
  ]);
  run(db, "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [
    workspaceId,
    userId
  ]);
  saveDatabase(db);

  res.status(204).send();
});

app.get("/api/users", (req, res) => {
  const workspace = getActiveWorkspace(req, req.query.workspaceId);

  if (!workspace) {
    return res.status(403).json({ message: "Select or join a workspace first." });
  }

  res.json({
    users: all(
      db,
      `SELECT
         u.id,
         u.name,
         u.email,
         wm.role,
         u.role AS accountRole,
         u.avatar_color AS avatarColor
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ?
       ORDER BY CASE wm.role WHEN 'admin' THEN 1 WHEN 'developer' THEN 2 ELSE 3 END, u.name`,
      [workspace.id]
    )
  });
});

app.get("/api/projects", (req, res) => {
  const workspace = getActiveWorkspace(req, req.query.workspaceId);

  if (!workspace) {
    return res.status(403).json({ message: "Select or join a workspace first." });
  }

  const projects = all(
    db,
    `SELECT
       p.id,
       p.workspace_id AS workspaceId,
       p.name,
       p.key,
       p.description,
       p.status,
       p.owner_id AS ownerId,
       u.name AS ownerName,
       p.created_at AS createdAt,
       p.updated_at AS updatedAt,
       COUNT(i.id) AS issueCount,
       SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END) AS doneCount
     FROM projects p
     JOIN users u ON u.id = p.owner_id
     LEFT JOIN issues i ON i.project_id = p.id
     WHERE p.workspace_id = ?
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [workspace.id]
  ).map((project) => ({
    ...project,
    issueCount: Number(project.issueCount || 0),
    doneCount: Number(project.doneCount || 0)
  }));

  res.json({ projects });
});

app.post("/api/projects", (req, res) => {
  const workspace = getActiveWorkspace(req, req.body.workspaceId);

  if (!workspace) {
    return res.status(403).json({ message: "Select or join a workspace first." });
  }

  if (workspace.role !== "admin") {
    return res.status(403).json({ message: "Only workspace admins can create projects." });
  }

  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim();
  const key = String(req.body.key || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

  if (name.length < 3 || description.length < 8 || key.length < 2) {
    return res.status(400).json({
      message: "Project name, key, and a short description are required."
    });
  }

  try {
    run(
      db,
      `INSERT INTO projects (workspace_id, name, key, description, owner_id)
       VALUES (?, ?, ?, ?, ?)`,
      [workspace.id, name, key, description, req.user.id]
    );
    saveDatabase(db);

    res.status(201).json({ project: getProject(lastInsertId(db), workspace.id) });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "Project key already exists." });
    }

    throw error;
  }
});

app.delete("/api/projects/:id", (req, res) => {
  const projectId = Number(req.params.id);
  const project = getProject(projectId);

  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  const workspace = getWorkspaceMembership(req.user.id, project.workspaceId);

  if (!workspace) {
    return res.status(403).json({ message: "You do not have access to this project." });
  }

  if (workspace.role !== "admin") {
    return res.status(403).json({ message: "Only workspace admins can delete projects." });
  }

  deleteProjectData(projectId);
  saveDatabase(db);

  res.status(204).send();
});

app.get("/api/issues", (req, res) => {
  const workspace = getActiveWorkspace(req, req.query.workspaceId);

  if (!workspace) {
    return res.status(403).json({ message: "Select or join a workspace first." });
  }

  res.json({ issues: getIssues(req.query, workspace.id) });
});

app.get("/api/issues/:id", (req, res) => {
  const issue = getIssue(Number(req.params.id));

  if (!issue) {
    return res.status(404).json({ message: "Issue not found." });
  }

  if (!getWorkspaceMembership(req.user.id, issue.workspaceId)) {
    return res.status(403).json({ message: "You do not have access to this issue." });
  }

  res.json({ issue });
});

app.post("/api/issues", (req, res) => {
  const workspace = getActiveWorkspace(req, req.body.workspaceId);

  if (!workspace) {
    return res.status(403).json({ message: "Select or join a workspace first." });
  }

  const payload = normalizeIssuePayload(req.body, workspace.id);

  if (!payload.ok) {
    return res.status(400).json({ message: payload.message });
  }

  run(
    db,
    `INSERT INTO issues
      (project_id, title, description, type, status, priority, assignee_id, reporter_id, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.issue.projectId,
      payload.issue.title,
      payload.issue.description,
      payload.issue.type,
      payload.issue.status,
      payload.issue.priority,
      payload.issue.assigneeId,
      req.user.id,
      payload.issue.dueDate
    ]
  );

  const issueId = lastInsertId(db);
  addActivity(issueId, req.user.id, "Created issue");
  saveDatabase(db);

  res.status(201).json({ issue: getIssue(issueId, workspace.id) });
});

app.patch("/api/issues/:id", (req, res) => {
  const issueId = Number(req.params.id);
  const existing = getIssue(issueId);

  if (!existing) {
    return res.status(404).json({ message: "Issue not found." });
  }

  const workspace = getWorkspaceMembership(req.user.id, existing.workspaceId);

  if (!workspace) {
    return res.status(403).json({ message: "You do not have access to this issue." });
  }

  const patch = normalizeIssuePatch(req.body, existing.workspaceId);

  if (!patch.ok) {
    return res.status(400).json({ message: patch.message });
  }

  if (patch.assignments.length === 0) {
    return res.json({ issue: existing });
  }

  const setClause = patch.assignments.map(([field]) => `${field} = ?`).join(", ");
  const values = patch.assignments.map(([, value]) => value);

  run(
    db,
    `UPDATE issues
     SET ${setClause}, updated_at = datetime('now')
     WHERE id = ?`,
    [...values, issueId]
  );

  const changedFields = patch.assignments.map(([field]) => humanFieldName(field)).join(", ");
  addActivity(issueId, req.user.id, `Updated ${changedFields}`);
  saveDatabase(db);

  res.json({ issue: getIssue(issueId, existing.workspaceId) });
});

app.delete("/api/issues/:id", (req, res) => {
  const issueId = Number(req.params.id);
  const existing = getIssue(issueId);

  if (!existing) {
    return res.status(404).json({ message: "Issue not found." });
  }

  const workspace = getWorkspaceMembership(req.user.id, existing.workspaceId);

  if (!workspace) {
    return res.status(403).json({ message: "You do not have access to this issue." });
  }

  if (workspace.role !== "admin") {
    return res.status(403).json({ message: "Only workspace admins can delete bugs and tasks." });
  }

  deleteIssueData(issueId);
  saveDatabase(db);

  res.status(204).send();
});

app.post("/api/issues/:id/comments", (req, res) => {
  const issueId = Number(req.params.id);
  const issue = getIssue(issueId);

  if (!issue) {
    return res.status(404).json({ message: "Issue not found." });
  }

  if (!getWorkspaceMembership(req.user.id, issue.workspaceId)) {
    return res.status(403).json({ message: "You do not have access to this issue." });
  }

  const body = String(req.body.body || "").trim();

  if (body.length < 2) {
    return res.status(400).json({ message: "Comment cannot be empty." });
  }

  run(
    db,
    "INSERT INTO comments (issue_id, author_id, body) VALUES (?, ?, ?)",
    [issueId, req.user.id, body]
  );
  addActivity(issueId, req.user.id, "Added comment");
  saveDatabase(db);

  res.status(201).json({ issue: getIssue(issueId, issue.workspaceId) });
});

app.get("/api/dashboard/stats", (req, res) => {
  const workspace = getActiveWorkspace(req, req.query.workspaceId);

  if (!workspace) {
    return res.status(403).json({ message: "Select or join a workspace first." });
  }

  const statusCounts = all(
    db,
    `SELECT i.status AS status, COUNT(*) AS count
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     WHERE p.workspace_id = ?
     GROUP BY i.status`,
    [workspace.id]
  );
  const priorityCounts = all(
    db,
    `SELECT i.priority AS priority, COUNT(*) AS count
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     WHERE p.workspace_id = ?
     GROUP BY i.priority`,
    [workspace.id]
  );
  const typeCounts = all(
    db,
    `SELECT i.type AS type, COUNT(*) AS count
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     WHERE p.workspace_id = ?
     GROUP BY i.type`,
    [workspace.id]
  );
  const totals = get(
    db,
    `SELECT
       COUNT(*) AS totalIssues,
       SUM(CASE WHEN i.status != 'done' THEN 1 ELSE 0 END) AS openIssues,
       SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END) AS doneIssues,
       COUNT(DISTINCT project_id) AS activeProjects
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     WHERE p.workspace_id = ?`,
    [workspace.id]
  );
  const recentActivity = all(
    db,
    `SELECT
       a.id,
       a.action,
       a.created_at AS createdAt,
       i.title AS issueTitle,
       i.id AS issueId,
       p.key AS projectKey,
       u.name AS userName
     FROM activity a
     LEFT JOIN issues i ON i.id = a.issue_id
     LEFT JOIN projects p ON p.id = i.project_id
     JOIN users u ON u.id = a.user_id
     WHERE p.workspace_id = ?
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 8`,
    [workspace.id]
  );

  res.json({
    stats: {
      totals: {
        totalIssues: Number(totals.totalIssues || 0),
        openIssues: Number(totals.openIssues || 0),
        doneIssues: Number(totals.doneIssues || 0),
        activeProjects: Number(totals.activeProjects || 0)
      },
      byStatus: countMap(statusCounts, "status", STATUSES),
      byPriority: countMap(priorityCounts, "priority", PRIORITIES),
      byType: countMap(typeCounts, "type", TYPES),
      recentActivity
    }
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`DevTrack API running on http://localhost:${port}/api`);
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = sessions.get(token);

  if (!user) {
    return res.status(401).json({ message: "Authentication required." });
  }

  req.token = token;
  req.user = user;
  next();
}

function getProject(id, workspaceId) {
  return get(
    db,
    `SELECT
       p.id,
       p.workspace_id AS workspaceId,
       p.name,
       p.key,
       p.description,
       p.status,
       p.owner_id AS ownerId,
       u.name AS ownerName,
       p.created_at AS createdAt,
       p.updated_at AS updatedAt,
       COUNT(i.id) AS issueCount,
       SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END) AS doneCount
     FROM projects p
     JOIN users u ON u.id = p.owner_id
     LEFT JOIN issues i ON i.project_id = p.id
     WHERE p.id = ?
       ${workspaceId ? "AND p.workspace_id = ?" : ""}
     GROUP BY p.id`,
    workspaceId ? [id, workspaceId] : [id]
  );
}

function getIssues(query = {}, workspaceId) {
  const where = [];
  const params = [];

  addFilter(where, params, "i.id", query.id);
  addFilter(where, params, "p.workspace_id", workspaceId);
  addFilter(where, params, "i.project_id", query.projectId);
  addFilter(where, params, "i.status", query.status, STATUSES);
  addFilter(where, params, "i.priority", query.priority, PRIORITIES);
  addFilter(where, params, "i.type", query.type, TYPES);
  addFilter(where, params, "i.assignee_id", query.assigneeId);

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  return all(
    db,
    `SELECT
       i.id,
       i.project_id AS projectId,
       p.workspace_id AS workspaceId,
       p.name AS projectName,
       p.key AS projectKey,
       i.title,
       i.description,
       i.type,
       i.status,
       i.priority,
       i.assignee_id AS assigneeId,
       assignee.name AS assigneeName,
       assignee.avatar_color AS assigneeAvatarColor,
       i.reporter_id AS reporterId,
       reporter.name AS reporterName,
       i.due_date AS dueDate,
       i.created_at AS createdAt,
       i.updated_at AS updatedAt,
       COUNT(c.id) AS commentCount
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     LEFT JOIN users assignee ON assignee.id = i.assignee_id
     JOIN users reporter ON reporter.id = i.reporter_id
     LEFT JOIN comments c ON c.issue_id = i.id
     ${whereSql}
     GROUP BY i.id
     ORDER BY
       CASE i.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       i.updated_at DESC`,
    params
  ).map((issue) => ({
    ...issue,
    commentCount: Number(issue.commentCount || 0)
  }));
}

function getIssue(id, workspaceId) {
  const issue = getIssues({ id }, workspaceId).find((item) => item.id === id);

  if (!issue) {
    return null;
  }

  issue.comments = all(
    db,
    `SELECT
       c.id,
       c.body,
       c.created_at AS createdAt,
       u.id AS authorId,
       u.name AS authorName,
       u.role AS authorRole,
       u.avatar_color AS authorAvatarColor
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.issue_id = ?
     ORDER BY c.created_at ASC, c.id ASC`,
    [id]
  );

  issue.activity = all(
    db,
    `SELECT
       a.id,
       a.action,
       a.created_at AS createdAt,
       u.name AS userName
     FROM activity a
     JOIN users u ON u.id = a.user_id
     WHERE a.issue_id = ?
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 8`,
    [id]
  );

  return issue;
}

function addFilter(where, params, field, value, allowedValues) {
  if (value === undefined || value === null || value === "" || value === "all") {
    return;
  }

  if (allowedValues && !allowedValues.includes(value)) {
    return;
  }

  where.push(`${field} = ?`);
  params.push(Number.isNaN(Number(value)) || allowedValues ? value : Number(value));
}

function normalizeIssuePayload(body, workspaceId) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const type = TYPES.includes(body.type) ? body.type : "task";
  const status = STATUSES.includes(body.status) ? body.status : "todo";
  const priority = PRIORITIES.includes(body.priority) ? body.priority : "medium";
  const projectId = Number(body.projectId);
  const assigneeId = body.assigneeId ? Number(body.assigneeId) : null;
  const dueDate = body.dueDate ? String(body.dueDate) : null;

  if (
    !projectId ||
    !get(db, "SELECT id FROM projects WHERE id = ? AND workspace_id = ?", [projectId, workspaceId])
  ) {
    return { ok: false, message: "A valid project is required." };
  }

  if (
    assigneeId &&
    !get(
      db,
      "SELECT user_id FROM workspace_members WHERE user_id = ? AND workspace_id = ?",
      [assigneeId, workspaceId]
    )
  ) {
    return { ok: false, message: "A valid assignee is required." };
  }

  if (title.length < 3 || description.length < 8) {
    return {
      ok: false,
      message: "Issue title and description must be completed."
    };
  }

  return {
    ok: true,
    issue: { title, description, type, status, priority, projectId, assigneeId, dueDate }
  };
}

function normalizeIssuePatch(body, workspaceId) {
  const assignments = [];
  const add = (field, value) => assignments.push([field, value]);

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (title.length < 3) return { ok: false, message: "Title is too short." };
    add("title", title);
  }

  if (body.description !== undefined) {
    const description = String(body.description).trim();
    if (description.length < 8) return { ok: false, message: "Description is too short." };
    add("description", description);
  }

  if (body.type !== undefined) {
    if (!TYPES.includes(body.type)) return { ok: false, message: "Invalid issue type." };
    add("type", body.type);
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { ok: false, message: "Invalid status." };
    add("status", body.status);
  }

  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return { ok: false, message: "Invalid priority." };
    add("priority", body.priority);
  }

  if (body.projectId !== undefined) {
    const projectId = Number(body.projectId);
    if (!get(db, "SELECT id FROM projects WHERE id = ? AND workspace_id = ?", [projectId, workspaceId])) {
      return { ok: false, message: "Invalid project." };
    }
    add("project_id", projectId);
  }

  if (body.assigneeId !== undefined) {
    const assigneeId = body.assigneeId ? Number(body.assigneeId) : null;
    if (
      assigneeId &&
      !get(
        db,
        "SELECT user_id FROM workspace_members WHERE user_id = ? AND workspace_id = ?",
        [assigneeId, workspaceId]
      )
    ) {
      return { ok: false, message: "Invalid assignee." };
    }
    add("assignee_id", assigneeId);
  }

  if (body.dueDate !== undefined) {
    add("due_date", body.dueDate ? String(body.dueDate) : null);
  }

  return { ok: true, assignments };
}

function addActivity(issueId, userId, action) {
  run(db, "INSERT INTO activity (issue_id, user_id, action) VALUES (?, ?, ?)", [
    issueId,
    userId,
    action
  ]);
}

function deleteProjectData(projectId) {
  run(
    db,
    `DELETE FROM activity
     WHERE issue_id IN (SELECT id FROM issues WHERE project_id = ?)`,
    [projectId]
  );
  run(
    db,
    `DELETE FROM comments
     WHERE issue_id IN (SELECT id FROM issues WHERE project_id = ?)`,
    [projectId]
  );
  run(db, "DELETE FROM issues WHERE project_id = ?", [projectId]);
  run(db, "DELETE FROM projects WHERE id = ?", [projectId]);
}

function deleteIssueData(issueId) {
  run(db, "DELETE FROM activity WHERE issue_id = ?", [issueId]);
  run(db, "DELETE FROM comments WHERE issue_id = ?", [issueId]);
  run(db, "DELETE FROM issues WHERE id = ?", [issueId]);
}

function leaveWorkspace(workspace, userId) {
  const workspaceId = workspace.id;

  run(
    db,
    `UPDATE issues
     SET assignee_id = NULL
     WHERE assignee_id = ?
       AND project_id IN (SELECT id FROM projects WHERE workspace_id = ?)`,
    [userId, workspaceId]
  );

  if (workspace.ownerId !== userId) {
    run(db, "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [
      workspaceId,
      userId
    ]);
    return;
  }

  const nextOwner = get(
    db,
    `SELECT user_id AS userId
     FROM workspace_members
     WHERE workspace_id = ? AND user_id != ?
     ORDER BY joined_at ASC
     LIMIT 1`,
    [workspaceId, userId]
  );

  if (!nextOwner) {
    deleteWorkspaceData(workspaceId);
    return;
  }

  run(db, "UPDATE workspaces SET owner_id = ?, updated_at = datetime('now') WHERE id = ?", [
    nextOwner.userId,
    workspaceId
  ]);
  run(db, "UPDATE workspace_members SET role = 'admin' WHERE workspace_id = ? AND user_id = ?", [
    workspaceId,
    nextOwner.userId
  ]);
  run(db, "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [
    workspaceId,
    userId
  ]);
}

function deleteWorkspaceData(workspaceId) {
  run(
    db,
    `DELETE FROM activity
     WHERE issue_id IN (
       SELECT i.id
       FROM issues i
       JOIN projects p ON p.id = i.project_id
       WHERE p.workspace_id = ?
     )`,
    [workspaceId]
  );
  run(
    db,
    `DELETE FROM comments
     WHERE issue_id IN (
       SELECT i.id
       FROM issues i
       JOIN projects p ON p.id = i.project_id
       WHERE p.workspace_id = ?
     )`,
    [workspaceId]
  );
  run(
    db,
    `DELETE FROM issues
     WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = ?)`,
    [workspaceId]
  );
  run(db, "DELETE FROM projects WHERE workspace_id = ?", [workspaceId]);
  run(db, "DELETE FROM workspace_members WHERE workspace_id = ?", [workspaceId]);
  run(db, "DELETE FROM workspaces WHERE id = ?", [workspaceId]);
}

function getActiveWorkspace(req, requestedWorkspaceId) {
  const workspaceId = Number(requestedWorkspaceId);
  const params = [req.user.id];
  const workspaceFilter = workspaceId ? "AND w.id = ?" : "";

  if (workspaceId) {
    params.push(workspaceId);
  }

  return toUserWorkspace(
    get(
      db,
      `SELECT
         w.id,
         w.name,
         w.slug,
         w.description,
         w.owner_id AS ownerId,
         w.invite_code AS inviteCode,
         wm.role
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = ?
         ${workspaceFilter}
       ORDER BY wm.joined_at ASC
       LIMIT 1`,
      params
    ),
    req.user.id
  );
}

function getWorkspaceMembership(userId, workspaceId) {
  return toUserWorkspace(
    get(
      db,
      `SELECT
         w.id,
         w.name,
         w.slug,
         w.description,
         w.owner_id AS ownerId,
         w.invite_code AS inviteCode,
         wm.role
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = ? AND wm.workspace_id = ?`,
      [userId, workspaceId]
    ),
    userId
  );
}

function getUserWorkspaces(userId) {
  return all(
    db,
    `SELECT
       w.id,
       w.name,
       w.slug,
       w.description,
       w.owner_id AS ownerId,
       w.invite_code AS inviteCode,
       wm.role,
       wm.joined_at AS joinedAt,
       COUNT(DISTINCT members.user_id) AS memberCount,
       COUNT(DISTINCT p.id) AS projectCount
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     LEFT JOIN workspace_members members ON members.workspace_id = w.id
     LEFT JOIN projects p ON p.workspace_id = w.id
     WHERE wm.user_id = ?
     GROUP BY w.id, wm.role, wm.joined_at
     ORDER BY wm.joined_at ASC`,
    [userId]
  ).map((workspace) => toUserWorkspace(workspace, userId));
}

function toUserWorkspace(workspace, userId) {
  if (!workspace) {
    return null;
  }

  return {
    ...workspace,
    inviteCode: workspace.ownerId === userId ? workspace.inviteCode : null,
    memberCount: Number(workspace.memberCount || 0),
    projectCount: Number(workspace.projectCount || 0)
  };
}

function getWorkspaceMember(workspaceId, userId) {
  return get(
    db,
    `SELECT
       u.id,
       u.name,
       u.email,
       wm.role,
       u.role AS accountRole,
       u.avatar_color AS avatarColor
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ? AND wm.user_id = ?`,
    [workspaceId, userId]
  );
}

function toWorkspaceSearchResult(workspace) {
  return {
    ...workspace,
    memberCount: Number(workspace.memberCount || 0),
    projectCount: Number(workspace.projectCount || 0)
  };
}

function countMap(rows, field, keys) {
  const result = Object.fromEntries(keys.map((key) => [key, 0]));

  for (const row of rows) {
    result[row[field]] = Number(row.count || 0);
  }

  return result;
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarColor: user.avatarColor
  };
}

function makeUniqueWorkspaceSlug(name) {
  const base = makeSlug(name);
  let slug = base;
  let index = 2;

  while (get(db, "SELECT id FROM workspaces WHERE slug = ?", [slug])) {
    slug = `${base}-${index}`;
    index += 1;
  }

  return slug;
}

function makeSlug(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "workspace"
  );
}

function makeInviteCode(slug) {
  const prefix = slug.replace(/[^a-z0-9]/g, "").toUpperCase().slice(0, 8) || "DEVTRACK";
  let inviteCode;

  do {
    inviteCode = `${prefix}-${createSessionToken().slice(0, 6).toUpperCase()}`;
  } while (get(db, "SELECT id FROM workspaces WHERE invite_code = ?", [inviteCode]));

  return inviteCode;
}

function pickAvatarColor(seed) {
  const total = String(seed || "")
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return AVATAR_COLORS[total % AVATAR_COLORS.length];
}

function humanFieldName(field) {
  return field.replace("_id", "").replace("_", " ");
}
