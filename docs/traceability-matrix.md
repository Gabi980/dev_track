# Traceability Matrix

| Requirement | Implementation |
| --- | --- |
| FR-01 Authentication | `server/src/index.js`, `client/src/App.jsx` login flow |
| FR-02 Create projects | `POST /api/projects`, Project modal |
| FR-03 Create tasks and bugs | `POST /api/issues`, Issue modal |
| FR-04 Assign issues | Issue form and detail panel assignee field |
| FR-05 Update status | Kanban card status selector and detail panel |
| FR-06 Priority and due date | Issue modal and detail panel fields |
| FR-07 Comments | `POST /api/issues/:id/comments`, comment form |
| FR-08 Dashboard | `GET /api/dashboard/stats`, dashboard cards |
| FR-09 Filters and search | Filter bar and search box |
| FR-10 Activity history | `activity` table and issue detail activity list |
| NFR-01 Easy local run | `README.md` scripts |
| NFR-02 Responsive UI | `client/src/styles.css` media queries |
| NFR-03 Git traceability | Git repository and documentation plan |
| NFR-04 Modular code | `client`, `server`, and `docs` structure |
