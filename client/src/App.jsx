import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Bug,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Filter,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  Layers3,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sun,
  Target,
  Trash2,
  UserRound,
  UserPlus,
  UsersRound,
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

const workspaceRoleLabels = {
  admin: "Admin",
  developer: "Developer",
  tester: "Tester"
};

const workspaceAccentColors = ["#0f766e", "#2563eb", "#7c3aed", "#be123c", "#d97706", "#475569"];

const statusOrder = ["todo", "in_progress", "testing", "done"];
const defaultFilters = {
  projectId: "all",
  status: "all",
  priority: "all",
  type: "all",
  assigneeId: "all"
};

const statusPalette = {
  todo: "#64748b",
  in_progress: "#2563eb",
  testing: "#d97706",
  done: "#0f766e"
};

const statusDescriptions = {
  todo: "Ready for planning",
  in_progress: "Currently active",
  testing: "Waiting for QA",
  done: "Released or closed"
};

const demoAccounts = [
  { role: "Admin", email: "admin@devtrack.local", password: "admin123", tone: "admin" },
  { role: "Developer", email: "dev@devtrack.local", password: "dev123", tone: "developer" },
  { role: "Tester", email: "tester@devtrack.local", password: "tester123", tone: "tester" }
];

function getInitialTheme() {
  const stored = localStorage.getItem("devtrack_theme");

  if (stored === "dark" || stored === "light") {
    return stored;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("devtrack_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [booting, setBooting] = useState(Boolean(localStorage.getItem("devtrack_token")));
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [issues, setIssues] = useState([]);
  const [stats, setStats] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => localStorage.getItem("devtrack_workspace_id") || ""
  );
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceHomeOpen, setWorkspaceHomeOpen] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [query, setQuery] = useState("");
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [workspaceDialog, setWorkspaceDialog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("devtrack_theme", theme);
  }, [theme]);

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
      refreshWorkspaces();
    }
  }, [user]);

  useEffect(() => {
    if (user && activeWorkspaceId) {
      refreshData();
    }
  }, [user, filters, activeWorkspaceId]);

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
  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== "all").length,
    [filters]
  );
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => String(workspace.id) === String(activeWorkspaceId)),
    [activeWorkspaceId, workspaces]
  );
  const selectedProjectName = useMemo(() => {
    if (filters.projectId === "all") {
      return "All projects";
    }

    return (
      projects.find((project) => String(project.id) === String(filters.projectId))?.name ||
      "Selected project"
    );
  }, [filters.projectId, projects]);
  const highPriorityCount = useMemo(
    () => visibleIssues.filter((issue) => issue.priority === "high").length,
    [visibleIssues]
  );
  const bugCount = useMemo(
    () => visibleIssues.filter((issue) => issue.type === "bug").length,
    [visibleIssues]
  );

  async function refreshWorkspaces(preferredWorkspaceId) {
    setWorkspaceLoading(true);

    try {
      const data = await api.workspaces();
      setWorkspaces(data.workspaces);

      const preferred = preferredWorkspaceId ? String(preferredWorkspaceId) : activeWorkspaceId;
      const nextWorkspace =
        data.workspaces.find((workspace) => String(workspace.id) === String(preferred)) ||
        data.workspaces[0];

      if (nextWorkspace) {
        activateWorkspace(nextWorkspace.id);
      } else {
        setActiveWorkspaceId("");
        localStorage.removeItem("devtrack_workspace_id");
        setProjects([]);
        setUsers([]);
        setIssues([]);
        setStats(null);
      }
    } catch (error) {
      showError(error);
    } finally {
      setWorkspaceLoading(false);
    }
  }

  function activateWorkspace(workspaceId) {
    const nextId = String(workspaceId);
    setActiveWorkspaceId(nextId);
    localStorage.setItem("devtrack_workspace_id", nextId);
    setSelectedIssue(null);
    setFilters(defaultFilters);
  }

  function openWorkspaceHome() {
    setWorkspaceHomeOpen(true);
    setSelectedIssue(null);
  }

  function openWorkspaceBoard(workspaceId) {
    activateWorkspace(workspaceId);
    setWorkspaceHomeOpen(false);
  }

  async function refreshData() {
    if (!activeWorkspaceId) {
      return;
    }

    setLoading(true);

    try {
      const [projectData, userData, issueData, statData] = await Promise.all([
        api.projects(activeWorkspaceId),
        api.users(activeWorkspaceId),
        api.issues({ ...filters, workspaceId: activeWorkspaceId }),
        api.stats(activeWorkspaceId)
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
      const data = await api.issue(issueId, activeWorkspaceId);
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
    localStorage.removeItem("devtrack_workspace_id");
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId("");
    setWorkspaceHomeOpen(true);
    setSelectedIssue(null);
  }

  async function handleCreateWorkspace(payload) {
    try {
      const data = await api.createWorkspace(payload);
      setWorkspaceDialog(null);
      await refreshWorkspaces(data.workspace.id);
      setWorkspaceHomeOpen(false);
    } catch (error) {
      showError(error);
    }
  }

  async function handleJoinWorkspace(payload) {
    try {
      const data = await api.joinWorkspace(payload);
      setWorkspaceDialog(null);
      await refreshWorkspaces(data.workspace.id);
      setWorkspaceHomeOpen(false);
    } catch (error) {
      showError(error);
    }
  }

  async function handleWorkspaceRoleChange(memberId, role) {
    if (!activeWorkspaceId) {
      return;
    }

    try {
      const data = await api.updateWorkspaceMemberRole(activeWorkspaceId, memberId, role);
      setUsers((current) =>
        current.map((member) => (member.id === memberId ? data.member : member))
      );
    } catch (error) {
      showError(error);
    }
  }

  async function handleLeaveWorkspace() {
    if (!activeWorkspaceId || !activeWorkspace) {
      return;
    }

    const confirmed = window.confirm(
      `Leave ${activeWorkspace.name}? You will lose access until you join again.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.leaveWorkspace(activeWorkspaceId);
      await refreshWorkspaces();
      setWorkspaceHomeOpen(true);
    } catch (error) {
      showError(error);
    }
  }

  async function handleRemoveWorkspaceMember(member) {
    if (!activeWorkspaceId || !activeWorkspace) {
      return;
    }

    const confirmed = window.confirm(
      `Remove ${member.name} from ${activeWorkspace.name}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.removeWorkspaceMember(activeWorkspaceId, member.id);
      setUsers((current) => current.filter((item) => item.id !== member.id));
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  async function handleDeleteProject(project) {
    const confirmed = window.confirm(
      `Delete project ${project.name}? This will also delete all bugs, tasks, comments, and activity in this project.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.deleteProject(project.id);

      if (String(filters.projectId) === String(project.id)) {
        setFilters(defaultFilters);
      }

      if (selectedIssue?.projectId === project.id) {
        setSelectedIssue(null);
      }

      await refreshWorkspaces(activeWorkspaceId);
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  async function handleDeleteIssue(issue) {
    const confirmed = window.confirm(
      `Delete ${typeLabels[issue.type].toLowerCase()} ${issue.projectKey}-${issue.id}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.deleteIssue(issue.id);
      setSelectedIssue(null);
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  function showError(error) {
    const message = error instanceof ApiError ? error.message : "Something went wrong.";
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  const workspaceDialogNode = workspaceDialog && (
    <WorkspaceModal
      mode={workspaceDialog}
      onClose={() => setWorkspaceDialog(null)}
      onCreate={handleCreateWorkspace}
      onJoin={handleJoinWorkspace}
    />
  );

  if (booting) {
    return <div className="boot-screen">Loading DevTrack...</div>;
  }

  if (!user) {
    return <LoginView onLogin={setUser} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (!activeWorkspaceId) {
    return (
      <>
        <WorkspaceEmptyView
          user={user}
          loading={workspaceLoading}
          onLogout={handleLogout}
          onCreate={() => setWorkspaceDialog("create")}
          onJoin={() => setWorkspaceDialog("join")}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        {workspaceDialogNode}
        {toast && <div className="toast">{toast}</div>}
      </>
    );
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

        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          activeWorkspace={activeWorkspace}
          homeActive={workspaceHomeOpen}
          onHome={openWorkspaceHome}
          onOpenWorkspace={openWorkspaceBoard}
          onCreate={() => setWorkspaceDialog("create")}
          onJoin={() => setWorkspaceDialog("join")}
        />

        {!workspaceHomeOpen && stats && (
          <SidebarOverview
            stats={stats}
            issueCount={visibleIssues.length}
            highPriorityCount={highPriorityCount}
          />
        )}

        {!workspaceHomeOpen && (
          <WorkspaceMembers
            members={users}
            currentUserId={user.id}
            canEditRoles={activeWorkspace?.ownerId === user.id}
            ownerId={activeWorkspace?.ownerId}
            onRoleChange={handleWorkspaceRoleChange}
            onLeave={handleLeaveWorkspace}
            onRemoveMember={handleRemoveWorkspaceMember}
          />
        )}

        {!workspaceHomeOpen && (
          <div className="sidebar-section">
            <div className="section-heading">
              <span>Projects</span>
              {activeWorkspace?.role === "admin" && (
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
                onDelete={
                  activeWorkspace?.role === "admin" ? () => handleDeleteProject(project) : null
                }
              />
            ))}
          </div>
        )}

        <div className="sidebar-user">
          <Avatar user={user} />
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
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

      <main className={workspaceHomeOpen ? "workspace classroom-home" : "workspace"}>
        {workspaceHomeOpen ? (
          <WorkspaceHome
            user={user}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            loading={workspaceLoading}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenWorkspace={openWorkspaceBoard}
            onCreate={() => setWorkspaceDialog("create")}
            onJoin={() => setWorkspaceDialog("join")}
          />
        ) : (
          <>
            <header className="topbar workspace-board-topbar">
              <div className="page-title">
                <span className="workspace-kicker">
                  <Activity size={15} />
                  {workspaceRoleLabels[activeWorkspace?.role] || "Workspace"}
                </span>
                <h1>{activeWorkspace?.name || "Project Board"}</h1>
                <p>
                  <span className={loading ? "sync-dot active" : "sync-dot"} />
                  {loading
                    ? "Syncing..."
                    : `${selectedProjectName} - ${visibleIssues.length} visible issues`}
                </p>
              </div>

              <div className="topbar-actions">
                <button className="subtle-button" onClick={openWorkspaceHome}>
                  <LayoutDashboard size={16} />
                  Home
                </button>
                <label className="search-box">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search issues"
                  />
                </label>
                <div className="quick-metrics" aria-label="Workspace metrics">
                  <MetricPill icon={<Bug size={14} />} label="Bugs" value={bugCount} tone="danger" />
                  <MetricPill
                    icon={<Target size={14} />}
                    label="High"
                    value={highPriorityCount}
                    tone="warning"
                  />
                </div>
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
                <button className="primary-button" onClick={() => setIssueModalOpen(true)}>
                  <Plus size={17} />
                  New Issue
                </button>
              </div>
            </header>

            {stats && <Dashboard stats={stats} />}

            <FilterBar
              filters={filters}
              setFilters={setFilters}
              users={users}
              activeFilterCount={activeFilterCount}
              onReset={() => setFilters(defaultFilters)}
            />

            <section className="board" aria-label="Issue board">
              {statusOrder.map((status, index) => (
                <div
                  className={`board-column ${status}`}
                  key={status}
                  style={{ "--column-index": index }}
                >
                  <ColumnHeader status={status} issues={groupedIssues[status]} />

                  <div className="issue-list">
                    {groupedIssues[status].map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onClick={() => openIssue(issue.id)}
                        onStatusChange={(nextStatus) =>
                          updateIssue(issue.id, { status: nextStatus })
                        }
                      />
                    ))}
                    {groupedIssues[status].length === 0 && (
                      <div className="empty-column">No issues in this status</div>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </main>

      {!workspaceHomeOpen && selectedIssue && (
        <IssuePanel
          issue={selectedIssue}
          users={users}
          projects={projects}
          canDelete={activeWorkspace?.role === "admin"}
          onClose={() => setSelectedIssue(null)}
          onUpdate={(patch) => updateIssue(selectedIssue.id, patch)}
          onDelete={() => handleDeleteIssue(selectedIssue)}
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
              const data = await api.createIssue({ ...payload, workspaceId: activeWorkspaceId });
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
              await api.createProject({ ...payload, workspaceId: activeWorkspaceId });
              setProjectModalOpen(false);
              await refreshData();
            } catch (error) {
              showError(error);
            }
          }}
        />
      )}

      {workspaceDialogNode}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function LoginView({ onLogin, theme, onToggleTheme }) {
  const [authMode, setAuthMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("admin@devtrack.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data =
        authMode === "register"
          ? await api.register({ name, email, password })
          : await api.login(email, password);
      localStorage.setItem("devtrack_token", data.token);
      localStorage.setItem("devtrack_user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function selectDemoAccount(account) {
    setAuthMode("login");
    setEmail(account.email);
    setPassword(account.password);
    setError("");
  }

  function switchAuthMode(mode) {
    setAuthMode(mode);
    setError("");

    if (mode === "register") {
      setEmail("");
      setPassword("");
    }
  }

  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="DevTrack overview">
        <div className="showcase-nav">
          <div className="brand login-brand">
            <div className="brand-mark">
              <FolderKanban size={22} />
            </div>
            <div>
              <strong>DevTrack</strong>
              <span>Bug & Task Tracker</span>
            </div>
          </div>
        </div>

        <div className="showcase-copy">
          <span className="workspace-kicker">
            <ShieldCheck size={15} />
            Software Engineering
          </span>
          <h1>DevTrack</h1>
          <p>Focused issue tracking for small software teams.</p>
        </div>

        <div className="showcase-metrics">
          <div>
            <UsersRound size={17} />
            <strong>3</strong>
            <span>Roles</span>
          </div>
          <div>
            <Layers3 size={17} />
            <strong>4</strong>
            <span>States</span>
          </div>
          <div>
            <BarChart3 size={17} />
            <strong>Live</strong>
            <span>Stats</span>
          </div>
        </div>

        <div className="workspace-preview">
          <div className="preview-head">
            <div>
              <span>Sprint Alpha</span>
              <strong>Release board</strong>
            </div>
            <span>
              72%
              <ArrowUpRight size={14} />
            </span>
          </div>

          <div className="preview-columns">
            <div className="preview-lane">
              <small>To Do</small>
              <i className="preview-ticket medium" />
              <i className="preview-ticket low short" />
            </div>
            <div className="preview-lane active">
              <small>In Progress</small>
              <i className="preview-ticket high" />
              <i className="preview-ticket medium short" />
            </div>
            <div className="preview-lane">
              <small>Testing</small>
              <i className="preview-ticket medium" />
            </div>
            <div className="preview-lane done">
              <small>Done</small>
              <i className="preview-ticket low" />
              <i className="preview-ticket low short" />
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-accent" aria-hidden="true" />

        <div className="login-header">
          <span className="login-badge">
            <ShieldCheck size={14} />
            Secure workspace
          </span>
          <div className="login-header-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <span className="login-version">v1.0</span>
          </div>
        </div>

        <div className="login-title">
          <span>Workspace access</span>
          <h1>{authMode === "register" ? "Create account" : "Welcome back"}</h1>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={authMode === "login" ? "active" : ""}
            onClick={() => switchAuthMode("login")}
          >
            <LogIn size={15} />
            Sign in
          </button>
          <button
            type="button"
            className={authMode === "register" ? "active" : ""}
            onClick={() => switchAuthMode("register")}
          >
            <UserPlus size={15} />
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="login-form">
          {authMode === "register" && (
            <label>
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="Alex Developer"
              />
            </label>
          )}
          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="primary-button full-width" disabled={loading}>
            {loading
              ? authMode === "register"
                ? "Creating account..."
                : "Signing in..."
              : authMode === "register"
                ? "Create account"
                : "Sign in to workspace"}
          </button>
        </form>

        {authMode === "login" && (
          <>
            <div className="login-divider">
              <span>Demo accounts</span>
            </div>

            <div className="account-grid">
              {demoAccounts.map((account) => (
                <DemoAccount
                  key={account.email}
                  {...account}
                  active={email === account.email}
                  onSelect={() => selectDemoAccount(account)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={`theme-toggle ${isDark ? "dark" : "light"}`}
      onClick={onToggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      aria-pressed={isDark}
    >
      <span className="theme-toggle-track">
        <span className="theme-stars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="theme-toggle-thumb">
          {isDark ? <Moon size={18} /> : <Sun size={18} />}
        </span>
      </span>
    </button>
  );
}

function DemoAccount({ role, email, password, tone, active, onSelect }) {
  return (
    <button
      type="button"
      className={`demo-account ${tone} ${active ? "active" : ""}`}
      onClick={onSelect}
      aria-label={`Use ${role} account`}
    >
      <strong>
        <span className="account-dot" />
        {role}
      </strong>
      <span>{email}</span>
      <code>{password}</code>
    </button>
  );
}

function WorkspaceHome({
  user,
  workspaces,
  activeWorkspaceId,
  loading,
  theme,
  onToggleTheme,
  onOpenWorkspace,
  onCreate,
  onJoin
}) {
  return (
    <section className="classroom-page">
      <header className="classroom-topbar">
        <div className="page-title">
          <span className="workspace-kicker">
            <LayoutDashboard size={15} />
            Home
          </span>
          <h1>Workspaces</h1>
        </div>

        <div className="topbar-actions">
          <button className="subtle-button" onClick={onJoin}>
            <LogIn size={16} />
            Join
          </button>
          <button className="primary-button" onClick={onCreate}>
            <Plus size={17} />
            Create workspace
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <section className="classroom-hero">
        <div>
          <span className="workspace-kicker">
            <Building2 size={15} />
            {user.name}
          </span>
          <h2>Workspace Home</h2>
          <p>{workspaces.length} workspaces available</p>
        </div>
        <div className="classroom-hero-stats">
          <MetricPill
            icon={<Layers3 size={14} />}
            label="Workspaces"
            value={workspaces.length}
            tone="info"
          />
          <MetricPill
            icon={<FolderKanban size={14} />}
            label="Projects"
            value={workspaces.reduce((total, workspace) => total + workspace.projectCount, 0)}
            tone="success"
          />
        </div>
      </section>

      <section className="classroom-grid" aria-busy={loading}>
        {workspaces.map((workspace, index) => (
          <WorkspaceCard
            key={workspace.id}
            workspace={workspace}
            index={index}
            active={String(activeWorkspaceId) === String(workspace.id)}
            onOpen={() => onOpenWorkspace(workspace.id)}
          />
        ))}

        <button className="workspace-add-card" onClick={onCreate}>
          <span>
            <Plus size={22} />
          </span>
          <strong>Create workspace</strong>
          <small>New company, team, or class-style board</small>
        </button>
      </section>
    </section>
  );
}

function WorkspaceCard({ workspace, index, active, onOpen }) {
  const accent = workspaceAccentColors[index % workspaceAccentColors.length];

  return (
    <article className={`classroom-card ${active ? "active" : ""}`} style={{ "--class-color": accent }}>
      <button className="classroom-card-main" onClick={onOpen}>
        <div className="classroom-card-cover">
          <div>
            <span>{workspaceRoleLabels[workspace.role] || workspace.role}</span>
            <h2>{workspace.name}</h2>
            <p>{workspace.slug}</p>
          </div>
          <strong className="classroom-card-avatar">{getWorkspaceInitials(workspace.name)}</strong>
        </div>
        <div className="classroom-card-body">
          <p>{workspace.description || "No description"}</p>
        </div>
      </button>

      <footer className="classroom-card-footer">
        <div className="classroom-card-meta">
          <span>
            <FolderKanban size={15} />
            {workspace.projectCount} projects
          </span>
          <span>
            <UsersRound size={15} />
            {workspace.memberCount} members
          </span>
        </div>
        <div className={`classroom-card-actions ${workspace.inviteCode ? "" : "without-invite"}`}>
          <button className="subtle-button" onClick={onOpen}>
            <ArrowUpRight size={15} />
            Open board
          </button>
          {workspace.inviteCode && <code>{workspace.inviteCode}</code>}
        </div>
      </footer>
    </article>
  );
}

function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  activeWorkspace,
  homeActive,
  onHome,
  onOpenWorkspace,
  onCreate,
  onJoin
}) {
  return (
    <section className="workspace-switcher classroom-nav">
      <button className={`classroom-nav-home ${homeActive ? "active" : ""}`} onClick={onHome}>
        <LayoutDashboard size={17} />
        <span>Home</span>
      </button>

      <div className="section-heading">
        <span>Workspaces</span>
        <small>{workspaces.length}</small>
      </div>

      <div className="class-list">
        {workspaces.map((workspace, index) => (
          <WorkspaceNavItem
            key={workspace.id}
            workspace={workspace}
            index={index}
            active={!homeActive && String(activeWorkspaceId) === String(workspace.id)}
            onClick={() => onOpenWorkspace(workspace.id)}
          />
        ))}
      </div>

      {activeWorkspace && !homeActive && (
        <div className="workspace-meta-card">
          <span>{workspaceRoleLabels[activeWorkspace.role] || activeWorkspace.role}</span>
          <strong>{activeWorkspace.slug}</strong>
          {activeWorkspace.inviteCode && <small>Invite: {activeWorkspace.inviteCode}</small>}
        </div>
      )}

      <div className="workspace-actions">
        <button className="subtle-button" onClick={onCreate}>
          <Plus size={14} />
          Create
        </button>
        <button className="subtle-button" onClick={onJoin}>
          <LogIn size={14} />
          Join
        </button>
      </div>
    </section>
  );
}

function WorkspaceNavItem({ workspace, index, active, onClick }) {
  const accent = workspaceAccentColors[index % workspaceAccentColors.length];

  return (
    <button
      className={`class-list-item ${active ? "active" : ""}`}
      onClick={onClick}
      style={{ "--class-color": accent }}
    >
      <span className="class-list-avatar">{getWorkspaceInitials(workspace.name)}</span>
      <span>
        <strong>{workspace.name}</strong>
        <small>{workspace.slug}</small>
      </span>
    </button>
  );
}

function WorkspaceMembers({
  members,
  currentUserId,
  canEditRoles,
  ownerId,
  onRoleChange,
  onLeave,
  onRemoveMember
}) {
  return (
    <details className="workspace-members">
      <summary className="members-summary">
        <div className="section-heading">
          <span>Workspace Members</span>
          <small>{members.length}</small>
        </div>
        <span className="members-caret" aria-hidden="true" />
      </summary>

      <div className="member-list">
        {members.map((member) => (
          <article className="member-row" key={member.id}>
            <Avatar user={member} />
            <div>
              <strong>
                {member.name}
                {member.id === currentUserId && <em>You</em>}
                {member.id === ownerId && <em>Owner</em>}
              </strong>
              <span>{member.email}</span>
            </div>
            {canEditRoles && member.id !== ownerId ? (
              <select
                className="member-role-select"
                value={member.role}
                onChange={(event) => onRoleChange(member.id, event.target.value)}
                aria-label={`Change ${member.name} role`}
              >
                {Object.entries(workspaceRoleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <small className={`member-role ${member.role}`}>
                {workspaceRoleLabels[member.role] || member.role}
              </small>
            )}
            {member.id === currentUserId ? (
              <button className="member-action leave" onClick={onLeave}>
                Leave Workspace
              </button>
            ) : (
              canEditRoles && (
                <button className="member-action kick" onClick={() => onRemoveMember(member)}>
                  Kick
                </button>
              )
            )}
          </article>
        ))}
      </div>
    </details>
  );
}

function WorkspaceEmptyView({ user, loading, onLogout, onCreate, onJoin, theme, onToggleTheme }) {
  return (
    <main className="workspace-empty-page">
      <section className="workspace-empty-panel">
        <div className="workspace-empty-head">
          <div className="brand">
            <div className="brand-mark">
              <FolderKanban size={21} />
            </div>
            <div>
              <strong>DevTrack</strong>
              <span>Bug & Task Tracker</span>
            </div>
          </div>
          <div className="workspace-empty-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button className="icon-button" onClick={onLogout} title="Log out" aria-label="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <div className="workspace-empty-copy">
          <span className="workspace-kicker">
            <Building2 size={15} />
            Workspace setup
          </span>
          <h1>Hi, {user.name.split(" ")[0]}.</h1>
          <p>
            Create a company workspace or join an existing team before opening the project board.
          </p>
        </div>

        <div className="workspace-choice-grid">
          <button className="workspace-choice-card" onClick={onCreate} disabled={loading}>
            <span className="choice-icon">
              <Plus size={21} />
            </span>
            <strong>Create workspace</strong>
            <small>Start a new company/team space and become its Admin.</small>
          </button>
          <button className="workspace-choice-card" onClick={onJoin} disabled={loading}>
            <span className="choice-icon">
              <LogIn size={21} />
            </span>
            <strong>Join workspace</strong>
            <small>Search a workspace and enter its password, or use an invite code.</small>
          </button>
        </div>
      </section>
    </main>
  );
}

function WorkspaceModal({ mode, onClose, onCreate, onJoin }) {
  return mode === "create" ? (
    <CreateWorkspaceModal onClose={onClose} onCreate={onCreate} />
  ) : (
    <JoinWorkspaceModal onClose={onClose} onJoin={onJoin} />
  );
}

function CreateWorkspaceModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    password: ""
  });

  return (
    <Modal title="Create Workspace" onClose={onClose}>
      <form
        className="modal-form workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(form);
        }}
      >
        <label>
          Workspace name
          <input
            value={form.name}
            onChange={(event) => setFormField(setForm, "name", event.target.value)}
            placeholder="Example Software"
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(event) => setFormField(setForm, "description", event.target.value)}
            rows={3}
            placeholder="Company workspace for bug tracking and release work."
          />
        </label>
        <label>
          Workspace password
          <input
            type="password"
            value={form.password}
            onChange={(event) => setFormField(setForm, "password", event.target.value)}
            placeholder="At least 6 characters"
          />
        </label>
        <button className="primary-button full-width">
          <Plus size={16} />
          Create workspace
        </button>
      </form>
    </Modal>
  );
}

function JoinWorkspaceModal({ onClose, onJoin }) {
  const [joinMode, setJoinMode] = useState("search");
  const [form, setForm] = useState({
    query: "",
    workspaceId: "",
    password: "",
    inviteCode: ""
  });
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  async function search(event) {
    event.preventDefault();
    const query = form.query.trim();

    if (query.length < 2) {
      setResults([]);
      setSearchMessage("Type at least 2 characters.");
      return;
    }

    setSearching(true);
    setSearchMessage("");

    try {
      const data = await api.searchWorkspaces(query);
      setResults(data.workspaces);
      setForm((current) => ({
        ...current,
        workspaceId: data.workspaces[0]?.id ? String(data.workspaces[0].id) : ""
      }));
      setSearchMessage(data.workspaces.length === 0 ? "No workspaces found." : "");
    } catch (error) {
      setSearchMessage(error.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    onJoin(
      joinMode === "invite"
        ? { inviteCode: form.inviteCode }
        : { workspaceId: form.workspaceId, password: form.password }
    );
  }

  return (
    <Modal title="Join Workspace" onClose={onClose}>
      <div className="auth-tabs workspace-tabs" role="tablist" aria-label="Join method">
        <button
          type="button"
          className={joinMode === "search" ? "active" : ""}
          onClick={() => setJoinMode("search")}
        >
          <Search size={15} />
          Search
        </button>
        <button
          type="button"
          className={joinMode === "invite" ? "active" : ""}
          onClick={() => setJoinMode("invite")}
        >
          <UserPlus size={15} />
          Invite code
        </button>
      </div>

      <form className="modal-form workspace-form" onSubmit={submit}>
        {joinMode === "search" ? (
          <>
            <div className="workspace-search-row">
              <label>
                Search workspace
                <input
                  value={form.query}
                  onChange={(event) => setFormField(setForm, "query", event.target.value)}
                  placeholder="Company or workspace name"
                />
              </label>
              <button type="button" className="subtle-button" onClick={search}>
                <Search size={14} />
                {searching ? "Searching" : "Search"}
              </button>
            </div>

            {searchMessage && <div className="inline-message">{searchMessage}</div>}

            {results.length > 0 && (
              <div className="workspace-results">
                {results.map((workspace) => (
                  <label
                    key={workspace.id}
                    className={`workspace-result ${
                      String(form.workspaceId) === String(workspace.id) ? "active" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="workspaceId"
                      value={workspace.id}
                      checked={String(form.workspaceId) === String(workspace.id)}
                      onChange={(event) =>
                        setFormField(setForm, "workspaceId", event.target.value)
                      }
                    />
                    <span>
                      <strong>{workspace.name}</strong>
                      <small>
                        {workspace.slug} - {workspace.memberCount} members -{" "}
                        {workspace.projectCount} projects
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <label>
              Workspace password
              <input
                type="password"
                value={form.password}
                onChange={(event) => setFormField(setForm, "password", event.target.value)}
                placeholder="Workspace password"
              />
            </label>
          </>
        ) : (
          <label>
            Invite code
            <input
              value={form.inviteCode}
              onChange={(event) =>
                setFormField(setForm, "inviteCode", event.target.value.toUpperCase())
              }
              placeholder="DEVTRACK-DEMO"
            />
          </label>
        )}

        <div className="inline-message">
          New members join as Developer. The workspace creator can change roles from Workspace
          Members.
        </div>

        <button className="primary-button full-width">
          <LogIn size={16} />
          Join workspace
        </button>
      </form>
    </Modal>
  );
}

function SidebarOverview({ stats, issueCount, highPriorityCount }) {
  const completion =
    stats.totals.totalIssues > 0
      ? Math.round((stats.totals.doneIssues / stats.totals.totalIssues) * 100)
      : 0;

  return (
    <section className="sidebar-overview">
      <div className="overview-top">
        <div>
          <span>Board Summary</span>
          <strong>{completion}% ready</strong>
        </div>
        <div className="overview-icon">
          <Gauge size={18} />
        </div>
      </div>
      <div
        className="overview-progress"
        style={{ "--progress-value": `${completion}%` }}
        aria-label={`${completion}% completed`}
      >
        <span />
      </div>
      <div className="overview-grid">
        <span>
          <BarChart3 size={14} />
          {issueCount} visible
        </span>
        <span>
          <Target size={14} />
          {highPriorityCount} high
        </span>
      </div>
    </section>
  );
}

function MetricPill({ icon, label, value, tone }) {
  return (
    <span className={`metric-pill ${tone}`}>
      {icon}
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function ColumnHeader({ status, issues }) {
  const highCount = issues.filter((issue) => issue.priority === "high").length;
  const bugCount = issues.filter((issue) => issue.type === "bug").length;
  const nextDueDate = getNextDueDate(issues);

  return (
    <div className="column-header">
      <div className="column-title">
        <span>
          <span className="column-dot" style={{ "--column-color": statusPalette[status] }} />
          {statusLabels[status]}
        </span>
        <small>{issues.length}</small>
      </div>
      <p>{statusDescriptions[status]}</p>
      <div className="column-stats">
        <span>
          <Bug size={13} />
          {bugCount}
        </span>
        <span>
          <Target size={13} />
          {highCount}
        </span>
        <span>
          <Clock3 size={13} />
          {nextDueDate ? formatShortDate(nextDueDate) : "No due"}
        </span>
      </div>
    </div>
  );
}

function Dashboard({ stats }) {
  const completion =
    stats.totals.totalIssues > 0
      ? Math.round((stats.totals.doneIssues / stats.totals.totalIssues) * 100)
      : 0;
  const totalByStatus = Math.max(
    1,
    Object.values(stats.byStatus).reduce((sum, count) => sum + count, 0)
  );
  const totalByPriority = Math.max(
    1,
    Object.values(stats.byPriority).reduce((sum, count) => sum + count, 0)
  );

  return (
    <section className="dashboard-area">
      <div className="dashboard-grid">
        <StatCard
          icon={<ClipboardList size={18} />}
          label="Total Issues"
          value={stats.totals.totalIssues}
          caption="Tracked items"
          tone="neutral"
          delay="0ms"
        />
        <StatCard
          icon={<AlertCircle size={18} />}
          label="Open Issues"
          value={stats.totals.openIssues}
          caption="Need attention"
          tone="warning"
          delay="55ms"
        />
        <StatCard
          icon={<CheckCircle2 size={18} />}
          label="Done"
          value={`${completion}%`}
          caption="Completion rate"
          tone="success"
          delay="110ms"
        />
        <StatCard
          icon={<LayoutDashboard size={18} />}
          label="Projects"
          value={stats.totals.activeProjects}
          caption="Active spaces"
          tone="info"
          delay="165ms"
        />
      </div>

      <div className="insight-grid">
        <article className="insight-card workflow-card">
          <div className="insight-head">
            <div>
              <span>Workflow</span>
              <strong>Status distribution</strong>
            </div>
            <small>{stats.totals.totalIssues} issues</small>
          </div>
          <div className="workflow-track" aria-label="Status distribution">
            {statusOrder.map((status) => {
              const count = stats.byStatus[status] || 0;
              const width = Math.max(count === 0 ? 0 : 8, (count / totalByStatus) * 100);

              return (
                <span
                  key={status}
                  style={{
                    "--segment-color": statusPalette[status],
                    "--segment-width": `${width}%`
                  }}
                  title={`${statusLabels[status]}: ${count}`}
                />
              );
            })}
          </div>
          <div className="status-legend">
            {statusOrder.map((status) => (
              <span key={status}>
                <i style={{ "--legend-color": statusPalette[status] }} />
                {statusLabels[status]}
                <strong>{stats.byStatus[status] || 0}</strong>
              </span>
            ))}
          </div>
        </article>

        <article className="insight-card priority-card">
          <div className="insight-head">
            <div>
              <span>Priority</span>
              <strong>Current risk level</strong>
            </div>
            <small>{stats.totals.openIssues} open</small>
          </div>
          {["high", "medium", "low"].map((priority) => {
            const count = stats.byPriority[priority] || 0;
            const width = Math.max(count === 0 ? 0 : 7, (count / totalByPriority) * 100);

            return (
              <div className="priority-row" key={priority}>
                <span>{priorityLabels[priority]}</span>
                <div className={`priority-meter ${priority}`}>
                  <i style={{ "--meter-width": `${width}%` }} />
                </div>
                <strong>{count}</strong>
              </div>
            );
          })}
        </article>
      </div>
    </section>
  );
}

function StatCard({ icon, label, value, caption, tone, delay }) {
  return (
    <article className={`stat-card ${tone}`} style={{ "--card-delay": delay }}>
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{caption}</small>
      </div>
    </article>
  );
}

function FilterBar({ filters, setFilters, users, activeFilterCount, onReset }) {
  return (
    <section className="filter-card">
      <div className="filter-header">
        <div className="filter-title">
          <Filter size={16} />
          <div>
            <span>Filters</span>
            <small>{activeFilterCount > 0 ? `${activeFilterCount} active` : "All issues"}</small>
          </div>
        </div>
        {activeFilterCount > 0 && (
          <button className="subtle-button" onClick={onReset}>
            Clear
          </button>
        )}
      </div>

      <div className="filter-grid">
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
      </div>
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

function ProjectButton({ active, name, meta, onClick, onDelete }) {
  return (
    <div
      className={`project-button ${active ? "active" : ""} ${onDelete ? "with-action" : ""}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span>{name}</span>
      <small>{meta}</small>
      {onDelete && (
        <button
          className="project-delete-button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          title={`Delete ${name}`}
          aria-label={`Delete ${name}`}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function IssueCard({ issue, onClick, onStatusChange }) {
  return (
    <article className={`issue-card ${issue.type} priority-${issue.priority}`} onClick={onClick}>
      <div className="issue-card-head">
        <span className={`type-pill ${issue.type}`}>
          {issue.type === "bug" ? <Bug size={12} /> : <ClipboardList size={12} />}
          {typeLabels[issue.type]}
        </span>
        <span className={`priority-pill ${issue.priority}`}>{priorityLabels[issue.priority]}</span>
      </div>

      <h3>{issue.title}</h3>
      <p>{issue.description}</p>

      <div className="issue-meta">
        <span className="issue-reference">
          {issue.projectKey}-{issue.id}
        </span>
        <span>
          <CalendarDays size={14} />
          {formatShortDate(issue.dueDate)}
        </span>
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
          className="status-select"
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

function IssuePanel({ issue, users, projects, canDelete, onClose, onUpdate, onDelete, onComment }) {
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
          <div className="detail-badges">
            <span className={`type-pill ${issue.type}`}>
              {issue.type === "bug" ? <Bug size={12} /> : <ClipboardList size={12} />}
              {typeLabels[issue.type]}
            </span>
            <span className={`priority-pill ${issue.priority}`}>
              {priorityLabels[issue.priority]}
            </span>
            <span className="date-pill">
              <CalendarDays size={12} />
              {formatShortDate(issue.dueDate)}
            </span>
          </div>
        </div>
        <div className="detail-actions">
          {canDelete && (
            <button
              className="icon-button danger"
              onClick={onDelete}
              title="Delete assignment"
              aria-label="Delete assignment"
            >
              <Trash2 size={17} />
            </button>
          )}
          <button className="icon-button" onClick={onClose} title="Close" aria-label="Close">
            <X size={18} />
          </button>
        </div>
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

function getWorkspaceInitials(name) {
  return (
    String(name || "Workspace")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "W"
  );
}

function setFormField(setForm, field, value) {
  setForm((current) => ({ ...current, [field]: value }));
}

function getNextDueDate(issues) {
  return issues
    .map((issue) => issue.dueDate)
    .filter(Boolean)
    .sort((left, right) => new Date(left) - new Date(right))[0];
}

function formatShortDate(value) {
  if (!value) {
    return "No date";
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}
