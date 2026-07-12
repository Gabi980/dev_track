import express from "express";
import cors from "cors";
import { all, get, getDatabase, lastInsertId, run, saveDatabase } from "./db.js";
import { createSessionToken, verifyPassword } from "./security.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const sessions = new Map();
const db = await getDatabase();

const STATUSES = ["todo", "in_progress", "testing", "done"];
const PRIORITIES = ["low", "medium", "high"];
const TYPES = ["task", "bug"];

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

app.use("/api", requireAuth);

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/logout", (req, res) => {
  sessions.delete(req.token);
  res.status(204).send();
});

app.get("/api/users", (_req, res) => {
  res.json({
    users: all(
      db,
      `SELECT id, name, email, role, avatar_color AS avatarColor
       FROM users
       ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'developer' THEN 2 ELSE 3 END, name`
    )
  });
});

app.get("/api/projects", (_req, res) => {
  const projects = all(
    db,
    `SELECT
       p.id,
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
     GROUP BY p.id
     ORDER BY p.created_at DESC`
  ).map((project) => ({
    ...project,
    issueCount: Number(project.issueCount || 0),
    doneCount: Number(project.doneCount || 0)
  }));

  res.json({ projects });
});

app.post("/api/projects", requireRole("admin"), (req, res) => {
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
      `INSERT INTO projects (name, key, description, owner_id)
       VALUES (?, ?, ?, ?)`,
      [name, key, description, req.user.id]
    );
    saveDatabase(db);

    res.status(201).json({ project: getProject(lastInsertId(db)) });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "Project key already exists." });
    }

    throw error;
  }
});

app.get("/api/issues", (req, res) => {
  res.json({ issues: getIssues(req.query) });
});

app.get("/api/issues/:id", (req, res) => {
  const issue = getIssue(Number(req.params.id));

  if (!issue) {
    return res.status(404).json({ message: "Issue not found." });
  }

  res.json({ issue });
});

app.post("/api/issues", (req, res) => {
  const payload = normalizeIssuePayload(req.body);

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

  res.status(201).json({ issue: getIssue(issueId) });
});

app.patch("/api/issues/:id", (req, res) => {
  const issueId = Number(req.params.id);
  const existing = getIssue(issueId);

  if (!existing) {
    return res.status(404).json({ message: "Issue not found." });
  }

  const patch = normalizeIssuePatch(req.body);

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

  res.json({ issue: getIssue(issueId) });
});

app.post("/api/issues/:id/comments", (req, res) => {
  const issueId = Number(req.params.id);

  if (!getIssue(issueId)) {
    return res.status(404).json({ message: "Issue not found." });
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

  res.status(201).json({ issue: getIssue(issueId) });
});

app.get("/api/dashboard/stats", (_req, res) => {
  const statusCounts = all(
    db,
    `SELECT status, COUNT(*) AS count
     FROM issues
     GROUP BY status`
  );
  const priorityCounts = all(
    db,
    `SELECT priority, COUNT(*) AS count
     FROM issues
     GROUP BY priority`
  );
  const typeCounts = all(
    db,
    `SELECT type, COUNT(*) AS count
     FROM issues
     GROUP BY type`
  );
  const totals = get(
    db,
    `SELECT
       COUNT(*) AS totalIssues,
       SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS openIssues,
       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS doneIssues,
       COUNT(DISTINCT project_id) AS activeProjects
     FROM issues`
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
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 8`
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

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have access to this action." });
    }

    next();
  };
}

function getProject(id) {
  return get(
    db,
    `SELECT
       p.id,
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
     GROUP BY p.id`,
    [id]
  );
}

function getIssues(query = {}) {
  const where = [];
  const params = [];

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

function getIssue(id) {
  const issue = getIssues({ id }).find((item) => item.id === id);

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

function normalizeIssuePayload(body) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const type = TYPES.includes(body.type) ? body.type : "task";
  const status = STATUSES.includes(body.status) ? body.status : "todo";
  const priority = PRIORITIES.includes(body.priority) ? body.priority : "medium";
  const projectId = Number(body.projectId);
  const assigneeId = body.assigneeId ? Number(body.assigneeId) : null;
  const dueDate = body.dueDate ? String(body.dueDate) : null;

  if (!projectId || !get(db, "SELECT id FROM projects WHERE id = ?", [projectId])) {
    return { ok: false, message: "A valid project is required." };
  }

  if (assigneeId && !get(db, "SELECT id FROM users WHERE id = ?", [assigneeId])) {
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

function normalizeIssuePatch(body) {
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
    if (!get(db, "SELECT id FROM projects WHERE id = ?", [projectId])) {
      return { ok: false, message: "Invalid project." };
    }
    add("project_id", projectId);
  }

  if (body.assigneeId !== undefined) {
    const assigneeId = body.assigneeId ? Number(body.assigneeId) : null;
    if (assigneeId && !get(db, "SELECT id FROM users WHERE id = ?", [assigneeId])) {
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

function humanFieldName(field) {
  return field.replace("_id", "").replace("_", " ");
}
