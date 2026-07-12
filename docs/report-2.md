# Report 2 - Minimal Design and Prototype

## System Architecture

DevTrack uses a client-server architecture.

```text
React frontend -> Express REST API -> SQLite database
```

## Frontend Design

The frontend is a single-page React application. It contains:

- Login screen
- Project sidebar
- Dashboard statistics
- Kanban issue board
- Issue filters and search
- Issue detail panel
- New issue and new project dialogs

## Backend Design

The backend is an Express API. It exposes endpoints for authentication, users, projects, issues, comments, and dashboard statistics.

## Database Design

Main tables:

- `users`
- `projects`
- `issues`
- `comments`
- `activity`

## Prototype Status

The prototype includes:

- Working login
- Seeded users, projects, issues, comments, and activity
- Project list
- Issue creation
- Issue status updates
- Issue detail view
- Comments
- Dashboard counters
- Filtering and search

## API Overview

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/login` | Authenticate user |
| GET | `/api/users` | List team members |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/issues` | List and filter issues |
| POST | `/api/issues` | Create issue |
| GET | `/api/issues/:id` | View issue details |
| PATCH | `/api/issues/:id` | Update issue |
| POST | `/api/issues/:id/comments` | Add comment |
| GET | `/api/dashboard/stats` | View dashboard data |
