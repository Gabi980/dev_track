# DevTrack

DevTrack is a web-based bug and task tracking system for small software teams. It supports project tracking, issue management, assignment, priorities, status workflow, comments, dashboard statistics, and traceability through Git.

## Stack

- Frontend: React, Vite, CSS
- Backend: Node.js, Express
- Database: SQLite through sql.js
- Icons: lucide-react
- Version control: Git and GitHub

## Main Features

- Demo login for Admin, Developer, and Tester roles
- Project creation and project list
- Bug and task creation
- Kanban workflow: To Do, In Progress, Testing, Done
- Priority levels: Low, Medium, High
- Issue assignment to users
- Filtering by project, status, priority, type, and assignee
- Comment history per issue
- Dashboard statistics and recent activity
- Seed data for a complete first demonstration

## Local Setup

Install dependencies:

```bash
pnpm install
```

Run the backend and frontend together:

```bash
pnpm dev
```

Default URLs:

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@devtrack.local | admin123 |
| Developer | dev@devtrack.local | dev123 |
| Tester | tester@devtrack.local | tester123 |

## Project Structure

```text
client/          React application
server/          Express API and SQLite persistence
server/data/     Local generated SQLite database
docs/            Reports, diagrams, demo script, traceability matrix
```

## Useful Scripts

```bash
pnpm dev          # run server and client
pnpm dev:server   # run only backend
pnpm dev:client   # run only frontend
pnpm build        # build frontend
pnpm test         # run backend tests and frontend build
```

## Documentation

- `docs/report-1.md`: project proposal, specifications, tools, use case diagram reference
- `docs/report-2.md`: minimal design and prototype description
- `docs/final-report-outline.md`: final report structure
- `docs/use-case-diagram.mmd`: Mermaid use case diagram
- `docs/demo-script.md`: final presentation flow
- `docs/traceability-matrix.md`: requirement to implementation mapping

## Traceability Plan

The project should be pushed to GitHub. Each relevant change should be committed with a clear message, for example:

```bash
git add .
git commit -m "Implement issue workflow and dashboard"
```

Suggested milestones:

1. Project proposal and documentation
2. Backend API and database prototype
3. Frontend prototype
4. Complete functional system and final demo
