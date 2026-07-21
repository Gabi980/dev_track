import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { hashPassword } from "./security.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../data/devtrack.sqlite");

let databasePromise;

function sqlJsWasmPath(file) {
  const packageEntry = require.resolve("sql.js");
  return path.join(path.dirname(packageEntry), file);
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = initializeDatabase();
  }

  return databasePromise;
}

async function initializeDatabase() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const SQL = await initSqlJs({ locateFile: sqlJsWasmPath });
  const db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  createSchema(db);
  seedDatabase(db);
  saveDatabase(db);

  return db;
}

function createSchema(db) {
  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'developer', 'tester')),
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'developer', 'tester')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (workspace_id, user_id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('task', 'bug')),
      status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'testing', 'done')),
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
      assignee_id INTEGER,
      reporter_id INTEGER NOT NULL,
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id),
      FOREIGN KEY (reporter_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  ensureColumn(db, "projects", "workspace_id", "INTEGER DEFAULT 1");
}

function seedDatabase(db) {
  const existingUsers = get(db, "SELECT COUNT(*) AS count FROM users");

  if (existingUsers.count > 0) {
    ensureDefaultWorkspace(db);
    return;
  }

  run(
    db,
    `INSERT INTO users (name, email, role, password_hash, avatar_color)
     VALUES (?, ?, ?, ?, ?)`,
    ["Ana Admin", "admin@devtrack.local", "admin", hashPassword("admin123"), "#ef4444"]
  );
  run(
    db,
    `INSERT INTO users (name, email, role, password_hash, avatar_color)
     VALUES (?, ?, ?, ?, ?)`,
    ["Dan Developer", "dev@devtrack.local", "developer", hashPassword("dev123"), "#2563eb"]
  );
  run(
    db,
    `INSERT INTO users (name, email, role, password_hash, avatar_color)
     VALUES (?, ?, ?, ?, ?)`,
    ["Tina Tester", "tester@devtrack.local", "tester", hashPassword("tester123"), "#16a34a"]
  );

  run(
    db,
    `INSERT INTO workspaces (name, slug, description, password_hash, owner_id, invite_code)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      "DevTrack Demo Workspace",
      "devtrack-demo",
      "Default workspace for the Software Engineering demo.",
      hashPassword("workspace123"),
      1,
      "DEVTRACK-DEMO"
    ]
  );

  run(
    db,
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
    [1, 1, "admin", 1, 2, "developer", 1, 3, "tester"]
  );

  run(
    db,
    `INSERT INTO projects (name, key, description, owner_id)
     VALUES (?, ?, ?, ?)`,
    [
      "Campus Portal",
      "CAMP",
      "Student portal prototype with authentication, dashboards, and request tracking.",
      1
    ]
  );
  run(
    db,
    `INSERT INTO projects (name, key, description, owner_id)
     VALUES (?, ?, ?, ?)`,
    [
      "DevTrack Internal",
      "DEV",
      "Internal project used to manage DevTrack bugs, tasks, and release checks.",
      1
    ]
  );

  run(
    db,
    `INSERT INTO issues
      (project_id, title, description, type, status, priority, assignee_id, reporter_id, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      1,
      "Create login validation",
      "Validate empty fields and display a clear error when credentials are invalid.",
      "task",
      "in_progress",
      "high",
      2,
      1,
      "2026-07-18"
    ]
  );
  run(
    db,
    `INSERT INTO issues
      (project_id, title, description, type, status, priority, assignee_id, reporter_id, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      1,
      "Fix dashboard counter refresh",
      "The project dashboard should update immediately after an issue changes status.",
      "bug",
      "testing",
      "medium",
      3,
      2,
      "2026-07-20"
    ]
  );
  run(
    db,
    `INSERT INTO issues
      (project_id, title, description, type, status, priority, assignee_id, reporter_id, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      2,
      "Prepare final demo script",
      "Create a short scenario that presents the complete issue workflow.",
      "task",
      "todo",
      "low",
      1,
      1,
      "2026-07-25"
    ]
  );
  run(
    db,
    `INSERT INTO issues
      (project_id, title, description, type, status, priority, assignee_id, reporter_id, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      2,
      "Comment box accepts whitespace only",
      "The comment form should reject empty and whitespace-only comments.",
      "bug",
      "done",
      "medium",
      2,
      3,
      "2026-07-15"
    ]
  );

  run(
    db,
    "INSERT INTO comments (issue_id, author_id, body) VALUES (?, ?, ?)",
    [1, 1, "Please include this in the first prototype demo."]
  );
  run(
    db,
    "INSERT INTO comments (issue_id, author_id, body) VALUES (?, ?, ?)",
    [2, 3, "Retested after the latest change and it looks stable."]
  );
  run(
    db,
    "INSERT INTO comments (issue_id, author_id, body) VALUES (?, ?, ?)",
    [4, 2, "Validation was added and checked manually."]
  );

  run(
    db,
    "INSERT INTO activity (issue_id, user_id, action) VALUES (?, ?, ?)",
    [1, 1, "Created issue"]
  );
  run(
    db,
    "INSERT INTO activity (issue_id, user_id, action) VALUES (?, ?, ?)",
    [2, 3, "Moved issue to Testing"]
  );
  run(
    db,
    "INSERT INTO activity (issue_id, user_id, action) VALUES (?, ?, ?)",
    [4, 2, "Marked issue as Done"]
  );

  ensureDefaultWorkspace(db);
}

function ensureDefaultWorkspace(db) {
  const existingUsers = all(
    db,
    "SELECT id, role FROM users ORDER BY id"
  );

  if (existingUsers.length === 0) {
    return;
  }

  let workspace = get(db, "SELECT id FROM workspaces WHERE slug = ?", ["devtrack-demo"]);

  if (!workspace) {
    const owner = existingUsers[0];
    run(
      db,
      `INSERT INTO workspaces (name, slug, description, password_hash, owner_id, invite_code)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        "DevTrack Demo Workspace",
        "devtrack-demo",
        "Default workspace for the Software Engineering demo.",
        hashPassword("workspace123"),
        owner.id,
        "DEVTRACK-DEMO"
      ]
    );
    workspace = { id: lastInsertId(db) };
  }

  for (const user of existingUsers) {
    const role = ["admin", "developer", "tester"].includes(user.role) ? user.role : "developer";
    run(
      db,
      `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role)
       VALUES (?, ?, ?)`,
      [workspace.id, user.id, role]
    );
  }

  run(
    db,
    "UPDATE projects SET workspace_id = ? WHERE workspace_id IS NULL OR workspace_id = 1",
    [workspace.id]
  );
}

function ensureColumn(db, table, column, definition) {
  const columns = all(db, `PRAGMA table_info(${table})`).map((item) => item.name);

  if (!columns.includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function saveDatabase(db) {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

export function run(db, sql, params = []) {
  db.run(sql, params);
}

export function get(db, sql, params = []) {
  return all(db, sql, params)[0] ?? null;
}

export function all(db, sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];

  try {
    statement.bind(params);
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }

  return rows;
}

export function lastInsertId(db) {
  return get(db, "SELECT last_insert_rowid() AS id").id;
}
