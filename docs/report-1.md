# Report 1 - Project Proposal

## Project Title

DevTrack: Web-Based Bug and Task Tracking System for Small Software Teams

## Problem Statement

Small software teams need a simple way to track tasks, bugs, responsibility, progress, and feedback during development. Without a structured tool, project status becomes difficult to follow and traceability is weak.

## Proposed Solution

DevTrack is a web application that allows team members to create projects, report tasks and bugs, assign work, update issue status, add comments, and view dashboard statistics.

## Actors

- Admin: manages projects, creates and assigns issues, monitors progress.
- Developer: works on tasks and bugs, updates status, comments on progress.
- Tester: reports bugs, validates fixes, comments on test results.

## Functional Requirements

| ID | Requirement |
| --- | --- |
| FR-01 | The system allows users to authenticate with role-based demo accounts. |
| FR-02 | The admin can create projects. |
| FR-03 | Users can create tasks and bugs. |
| FR-04 | Users can assign issues to team members. |
| FR-05 | Users can update issue status. |
| FR-06 | Users can set issue priority and due date. |
| FR-07 | Users can add comments to issues. |
| FR-08 | The system displays dashboard statistics. |
| FR-09 | The system allows filtering and searching issues. |
| FR-10 | The system records basic activity history. |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-01 | The system should be easy to run locally. |
| NFR-02 | The interface should be responsive for desktop and mobile screens. |
| NFR-03 | The project should use Git for traceability. |
| NFR-04 | The code should be organized into frontend, backend, and documentation modules. |

## Tools and Technologies

- React and Vite for frontend development
- Node.js and Express for backend API development
- SQLite through sql.js for local persistence
- Git and GitHub for version control
- Mermaid or draw.io for diagrams
- VS Code or Codex for code editing

## Use Case Diagram

The use case diagram is available in `docs/use-case-diagram.mmd`.

## Expected Deliverables

- Source code for frontend and backend
- SQLite-backed local prototype
- Project documentation
- Functional demo
- Git repository with meaningful commits
