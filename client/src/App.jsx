import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bug,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Filter,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Send,
  UserRound,
  X
} from "lucide-react";
import { ApiError, api } from "./api.js";

const statusLabels = {
  todo: "To Do",
  in_progress: "In Progress",
  testing: "Testing",
  done: "Done"
};

const priorityLabels = {
  low: "Low",
  medium: "Medium",
  high: "High"
};

const typeLabels = {
  task: "Task",
  bug: "Bug"
};

const statusOrder = ["todo", "in_progress", "testing", "done"];

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("devtrack_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [booting, setBooting] = useState(Boolean(localStorage.getItem("devtrack_token")));
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [issues, setIssues] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [filters, setFilters] = useState({
    projectId: "all",
    status: "all",
    priority: "all",
    type: "all",
    assigneeId: "all"
  });
  const [query, setQuery] = useState("");
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("devtrack_token")) {
      return;
    }

    api
      .me()
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        localStorage.setItem("devtrack_user", JSON.stringify(currentUser));
      })
      .catch(() => {
        localStorage.removeItem("devtrack_token");
        localStorage.removeItem("devtrack_user");
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user, filters]);

  const visibleIssues = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return issues;
    }

    return issues.filter((issue) =>
      [issue.title, issue.description, issue.projectKey, issue.assigneeName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [issues, query]);

  const groupedIssues = useMemo(
    () =>
      Object.fromEntries(
        statusOrder.map((status) => [
          status,
          visibleIssues.filter((issue) => issue.status === status)
        ])
      ),
    [visibleIssues]
  );

  async function refreshData() {
    setLoading(true);

    try {
      const [projectData, userData, issueData, statData] = await Promise.all([
        api.projects(),
        api.users(),
        api.issues(filters),
        api.stats()
      ]);

      setProjects(projectData.projects);
      setUsers(userData.users);
      setIssues(issueData.issues);
      setStats(statData.stats);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function openIssue(issueId) {
    try {
      const data = await api.issue(issueId);
      setSelectedIssue(data.issue);
    } catch (error) {
      showError(error);
    }
  }

  async function updateIssue(issueId, patch) {
    try {
      const data = await api.updateIssue(issueId, patch);
      setSelectedIssue(data.issue);
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => null);
    localStorage.removeItem("devtrack_token");
    localStorage.removeItem("devtrack_user");
    setUser(null);
    setSelectedIssue(null);
  }

  function showError(error) {
    const message = error instanceof ApiError ? error.message : "Something went wrong.";
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  if (booting) {
    return <div className="boot-screen">Loading DevTrack...</div>;
  }

  if (!user) {
    return <LoginView onLogin={setUser} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <FolderKanban size={21} />
          </div>
          <div>
            <strong>DevTrack</strong>
            <span>Bug & Task Tracker</span>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-heading">
            <span>Projects</span>
            {user.role === "admin" && (
              <button
                className="icon-button"
                onClick={() => setProjectModalOpen(true)}
                title="New project"
                aria-label="New project"
              >
                <Plus size={16} />
              </button>
            )}
          </div>

          <ProjectButton
            active={filters.projectId === "all"}
            name="All projects"
            meta={`${projects.length} active`}
            onClick={() => setFilters((current) => ({ ...current, projectId: "all" }))}
          />

          {projects.map((project) => (
            <ProjectButton
              key={project.id}
              active={String(filters.projectId) === String(project.id)}
              name={project.name}
              meta={`${project.key} - ${project.issueCount} issues`}
              onClick={() =>
                setFilters((current) => ({ ...current, projectId: String(project.id) }))
              }
            />
          ))}
        </div>

        <div className="sidebar-user">
          <Avatar user={user} />
          <div>
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
          <button
            className="icon-button"
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>Project Board</h1>
            <p>{loading ? "Syncing..." : `${visibleIssues.length} visible issues`}</p>
          </div>

          <div className="topbar-actions">
            <label className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search issues"
              />
            </label>
            <button className="primary-button" onClick={() => setIssueModalOpen(true)}>
              <Plus size={17} />
              New Issue
            </button>
          </div>
        </header>

        {stats && <Dashboard stats={stats} />}

        <FilterBar filters={filters} setFilters={setFilters} users={users} />

        <section className="board" aria-label="Issue board">
          {statusOrder.map((status) => (
            <div className="board-column" key={status}>
              <div className="column-title">
                <span>{statusLabels[status]}</span>
                <small>{groupedIssues[status].length}</small>
              </div>

              <div className="issue-list">
                {groupedIssues[status].map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onClick={() => openIssue(issue.id)}
                    onStatusChange={(nextStatus) => updateIssue(issue.id, { status: nextStatus })}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>

      {selectedIssue && (
        <IssuePanel
          issue={selectedIssue}
          users={users}
          projects={projects}
          onClose={() => setSelectedIssue(null)}
          onUpdate={(patch) => updateIssue(selectedIssue.id, patch)}
          onComment={async (body) => {
            try {
              const data = await api.addComment(selectedIssue.id, body);
              setSelectedIssue(data.issue);
              await refreshData();
            } catch (error) {
              showError(error);
            }
          }}
        />
      )}

      {issueModalOpen && (
        <IssueModal
          projects={projects}
          users={users}
          defaultProjectId={filters.projectId !== "all" ? filters.projectId : projects[0]?.id}
          onClose={() => setIssueModalOpen(false)}
          onCreate={async (payload) => {
            try {
              const data = await api.createIssue(payload);
              setIssueModalOpen(false);
              setSelectedIssue(data.issue);
              await refreshData();
            } catch (error) {
              showError(error);
            }
          }}
        />
      )}

      {projectModalOpen && (
        <ProjectModal
          onClose={() => setProjectModalOpen(false)}
          onCreate={async (payload) => {
            try {
              await api.createProject(payload);
              setProjectModalOpen(false);
              await refreshData();
            } catch (error) {
              showError(error);
            }
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function LoginView({ onLogin }) {
  const [email, setEmail] = useState("admin@devtrack.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await api.login(email, password);
      localStorage.setItem("devtrack_token", data.token);
      localStorage.setItem("devtrack_user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand login-brand">
          <div className="brand-mark">
            <FolderKanban size={22} />
          </div>
          <div>
            <strong>DevTrack</strong>
            <span>Bug & Task Tracker</span>
          </div>
        </div>

        <form onSubmit={submit} className="login-form">
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="primary-button full-width" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="account-grid">
          <DemoAccount role="Admin" email="admin@devtrack.local" password="admin123" />
          <DemoAccount role="Developer" email="dev@devtrack.local" password="dev123" />
          <DemoAccount role="Tester" email="tester@devtrack.local" password="tester123" />
        </div>
      </section>
    </main>
  );
}

function DemoAccount({ role, email, password }) {
  return (
    <div className="demo-account">
      <strong>{role}</strong>
      <span>{email}</span>
      <code>{password}</code>
    </div>
  );
}

function Dashboard({ stats }) {
  const completion =
    stats.totals.totalIssues > 0
      ? Math.round((stats.totals.doneIssues / stats.totals.totalIssues) * 100)
      : 0;

  return (
    <section className="dashboard-grid">
      <StatCard icon={<ClipboardList size={18} />} label="Total Issues" value={stats.totals.totalIssues} />
      <StatCard icon={<AlertCircle size={18} />} label="Open Issues" value={stats.totals.openIssues} />
      <StatCard icon={<CheckCircle2 size={18} />} label="Done" value={`${completion}%`} />
      <StatCard icon={<LayoutDashboard size={18} />} label="Projects" value={stats.totals.activeProjects} />
    </section>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function FilterBar({ filters, setFilters, users }) {
  return (
    <section className="filter-bar">
      <div className="filter-title">
        <Filter size={16} />
        <span>Filters</span>
      </div>
      <SelectFilter
        label="Status"
        value={filters.status}
        onChange={(status) => setFilters((current) => ({ ...current, status }))}
        options={[
          ["all", "All"],
          ...Object.entries(statusLabels)
        ]}
      />
      <SelectFilter
        label="Priority"
        value={filters.priority}
        onChange={(priority) => setFilters((current) => ({ ...current, priority }))}
        options={[
          ["all", "All"],
          ...Object.entries(priorityLabels)
        ]}
      />
      <SelectFilter
        label="Type"
        value={filters.type}
        onChange={(type) => setFilters((current) => ({ ...current, type }))}
        options={[
          ["all", "All"],
          ...Object.entries(typeLabels)
        ]}
      />
      <SelectFilter
        label="Assignee"
        value={filters.assigneeId}
        onChange={(assigneeId) => setFilters((current) => ({ ...current, assigneeId }))}
        options={[["all", "All"], ...users.map((user) => [String(user.id), user.name])]}
      />
    </section>
  );
}

function SelectFilter({ label, value, options, onChange }) {
  return (
    <label className="select-filter">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProjectButton({ active, name, meta, onClick }) {
  return (
    <button className={`project-button ${active ? "active" : ""}`} onClick={onClick}>
      <span>{name}</span>
      <small>{meta}</small>
    </button>
  );
}

function IssueCard({ issue, onClick, onStatusChange }) {
  return (
    <article className="issue-card" onClick={onClick}>
      <div className="issue-card-head">
        <span className={`type-pill ${issue.type}`}>{typeLabels[issue.type]}</span>
        <span className={`priority-pill ${issue.priority}`}>{priorityLabels[issue.priority]}</span>
      </div>

      <h3>{issue.title}</h3>
      <p>{issue.description}</p>

      <div className="issue-meta">
        <span>{issue.projectKey}</span>
        <span>
          <MessageSquare size={14} />
          {issue.commentCount}
        </span>
      </div>

      <div className="issue-card-footer">
        <span className="assignee">
          <UserRound size={14} />
          {issue.assigneeName || "Unassigned"}
        </span>
        <select
          value={issue.status}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onStatusChange(event.target.value)}
          aria-label="Change status"
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function IssuePanel({ issue, users, projects, onClose, onUpdate, onComment }) {
  const [comment, setComment] = useState("");

  async function submitComment(event) {
    event.preventDefault();
    await onComment(comment);
    setComment("");
  }

  return (
    <aside className="detail-panel">
      <div className="detail-head">
        <div>
          <span className="issue-key">
            {issue.projectKey}-{issue.id}
          </span>
          <h2>{issue.title}</h2>
        </div>
        <button className="icon-button" onClick={onClose} title="Close" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="detail-section">
        <p>{issue.description}</p>
      </div>

      <div className="detail-grid">
        <SelectControl label="Status" value={issue.status} options={statusLabels} onChange={(status) => onUpdate({ status })} />
        <SelectControl label="Priority" value={issue.priority} options={priorityLabels} onChange={(priority) => onUpdate({ priority })} />
        <SelectControl label="Type" value={issue.type} options={typeLabels} onChange={(type) => onUpdate({ type })} />
        <label>
          Assignee
          <select
            value={issue.assigneeId || ""}
            onChange={(event) => onUpdate({ assigneeId: event.target.value || null })}
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Project
          <select value={issue.projectId} onChange={(event) => onUpdate({ projectId: event.target.value })}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input
            type="date"
            value={issue.dueDate || ""}
            onChange={(event) => onUpdate({ dueDate: event.target.value })}
          />
        </label>
      </div>

      <div className="detail-section">
        <h3>Comments</h3>
        <div className="comment-list">
          {issue.comments.map((item) => (
            <div className="comment" key={item.id}>
              <Avatar user={{ name: item.authorName, avatarColor: item.authorAvatarColor }} />
              <div>
                <strong>{item.authorName}</strong>
                <p>{item.body}</p>
              </div>
            </div>
          ))}
        </div>
        <form className="comment-form" onSubmit={submitComment}>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a comment"
          />
          <button className="icon-button emphasized" title="Send comment" aria-label="Send comment">
            <Send size={16} />
          </button>
        </form>
      </div>

      <div className="detail-section">
        <h3>Activity</h3>
        <div className="activity-list">
          {issue.activity.map((item) => (
            <div className="activity-item" key={item.id}>
              <span>{item.action}</span>
              <small>{item.userName}</small>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SelectControl({ label, value, options, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {Object.entries(options).map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function IssueModal({ projects, users, defaultProjectId, onClose, onCreate }) {
  const [form, setForm] = useState({
    projectId: defaultProjectId || "",
    title: "",
    description: "",
    type: "task",
    priority: "medium",
    status: "todo",
    assigneeId: users[0]?.id || "",
    dueDate: ""
  });

  return (
    <Modal title="New Issue" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(form);
        }}
      >
        <label>
          Project
          <select value={form.projectId} onChange={(event) => setFormField(setForm, "projectId", event.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input value={form.title} onChange={(event) => setFormField(setForm, "title", event.target.value)} />
        </label>
        <label>
          Description
          <textarea value={form.description} onChange={(event) => setFormField(setForm, "description", event.target.value)} rows={4} />
        </label>
        <div className="modal-grid">
          <SelectControl label="Type" value={form.type} options={typeLabels} onChange={(value) => setFormField(setForm, "type", value)} />
          <SelectControl label="Priority" value={form.priority} options={priorityLabels} onChange={(value) => setFormField(setForm, "priority", value)} />
          <SelectControl label="Status" value={form.status} options={statusLabels} onChange={(value) => setFormField(setForm, "status", value)} />
          <label>
            Assignee
            <select value={form.assigneeId} onChange={(event) => setFormField(setForm, "assigneeId", event.target.value)}>
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Due date
          <input type="date" value={form.dueDate} onChange={(event) => setFormField(setForm, "dueDate", event.target.value)} />
        </label>
        <button className="primary-button full-width">Create issue</button>
      </form>
    </Modal>
  );
}

function ProjectModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: "", key: "", description: "" });

  return (
    <Modal title="New Project" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(form);
        }}
      >
        <label>
          Name
          <input value={form.name} onChange={(event) => setFormField(setForm, "name", event.target.value)} />
        </label>
        <label>
          Key
          <input value={form.key} onChange={(event) => setFormField(setForm, "key", event.target.value.toUpperCase())} maxLength={8} />
        </label>
        <label>
          Description
          <textarea value={form.description} onChange={(event) => setFormField(setForm, "description", event.target.value)} rows={4} />
        </label>
        <button className="primary-button full-width">Create project</button>
      </form>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} title="Close" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Avatar({ user }) {
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span className="avatar" style={{ background: user.avatarColor || "#0f766e" }}>
      {initials}
    </span>
  );
}

function setFormField(setForm, field, value) {
  setForm((current) => ({ ...current, [field]: value }));
}
