# OpsMind: AI-Powered DevOps Incident Intelligence Platform

## Project Description
OpsMind is a full-stack MERN + GenAI project designed to act as an AI-powered DevOps Incident Intelligence Platform. It receives logs, detects failures, creates incidents, and uses AI to investigate and propose solutions.

## Problem Statement
Modern DevOps environments generate massive amounts of logs and metrics. When an incident occurs, identifying the root cause can be time-consuming. OpsMind aims to automate the detection and investigation of these incidents using AI.

## Project Goals
- Ingest logs from production applications
- Automatically detect failures and anomalies
- Generate actionable incident reports using AI
- Provide a clean, scalable dashboard for monitoring

## Technology Stack
- **Frontend**: React, Vite, React Router, Tailwind CSS, Recharts, Lucide React
- **Backend**: Node.js, Express, MongoDB
- **Future Additions**: Redis, BullMQ, Socket.IO, RAG, Embeddings, Vector Search, LLMs, Docker, CI/CD

## Current Architecture
- **Phase 4 — Organizations & Projects**: Users can create organizations, manage membership roles, and create projects.
- **Phase 5 — Services**: Register services inside projects.
- **Phase 6 — Dashboard**: View environment statuses, active incidents, and summary metrics.
- **Phase 7 — Log Ingestion**: Secure log ingestion via `/api/ingest`.
- **Phase 8 — Incident Detection**: Deterministic threshold-based incident creation from error logs.
- **Phase 9 — Real-time Updates**: Socket.IO integration for live logs and incidents.
- **Phase 10 — AI Investigation**: Root-cause analysis via LLM/Gemini (with deterministic mock fallback).
- **Phase 11 — Incident Lifecycle**: Endpoints for Acknowledge, Resolve, and Reopen with status history.

## Planned Future Features
- Complete Docker Containerization
- Background Jobs with BullMQ and Redis
- CI/CD Deployment

## Local Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- MongoDB Atlas account (or local MongoDB)

### Environment Variables
For the backend, you must configure environment variables. Create a `server/.env` file (which is git-ignored) and add:
```
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```
> **Warning**: Never commit your `server/.env` file to version control.

### How to run Client
```bash
cd client
npm install
npm run dev
```

### How to run Server
```bash
cd server
npm install
npm run dev
```

### How to run Simulator
```bash
cd simulator
npm install
npm run dev
```

### Authentication Endpoints
- `POST /api/auth/register`: Register a new user
- `POST /api/auth/login`: Login with email/password
- `GET /api/auth/me`: Get current authenticated user (requires auth)

### Organization Endpoints (all require auth)
- `POST /api/organizations`: Create an organization
- `GET /api/organizations`: List my organizations
- `GET /api/organizations/:id`: Get organization details (members only)
- `PATCH /api/organizations/:id`: Update org name (owner or admin)
- `DELETE /api/organizations/:id`: Delete org and its projects (owner only)

### Project Endpoints (all require auth)
- `POST /api/projects`: Create a project (`{ name, description, organizationId }`)
- `GET /api/projects?organizationId=ID`: List projects in an org (members only)
- `GET /api/projects/:id`: Get project details (members only)
- `PATCH /api/projects/:id`: Update project name/description (owner or admin)
- `DELETE /api/projects/:id`: Delete a project (owner or admin)

### Incident Endpoints (all require auth)
- `GET /api/incidents?organizationId=ID&page=1&limit=20`: List organization incidents (paginated)
- `GET /api/incidents/:id`: Get incident details and evidence logs
- `POST /api/incidents/:id/investigate`: Trigger AI root-cause investigation
- `POST /api/incidents/:id/acknowledge`: Acknowledge an incident
- `POST /api/incidents/:id/resolve`: Resolve an incident
- `POST /api/incidents/:id/reopen`: Reopen a resolved incident

### Membership Roles
| Role | Create Project | Update/Delete Project | Update Org | Delete Org |
|--------|---------------|----------------------|------------|------------|
| owner  | ✅             | ✅                    | ✅          | ✅          |
| admin  | ✅             | ✅                    | ✅          | ❌          |
| member | ✅             | ❌                    | ❌          | ❌          |

**Note:** This project has completed backend implementation up to **Phase 11 — Incident Lifecycle & Security Hardening**. Backend regression test suites (`test-phase4.js` to `test-phase11.js`) are available to run against a local MongoDB instance.
