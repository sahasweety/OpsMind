# OpsMind: AI-Powered DevOps Incident Intelligence Platform

[![React](https://img.shields.io/badge/React-19-blue.svg?logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express%205-green.svg?logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%209-brightgreen.svg?logo=mongodb)](https://www.mongodb.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--time-black.svg?logo=socket.io)](https://socket.io/)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker)](https://www.docker.com/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

**OpsMind** is a production-oriented, full-stack operational monitoring and incident intelligence platform built with the MERN stack and GenAI. It bridges application runtime telemetry with developer delivery pipelines by ingesting real-time service logs, automatically detecting degradations and failures, monitoring GitHub Actions CI/CD workflows, providing AI-assisted root-cause investigations, and broadcasting authenticated outbound webhooks to external response systems.

---

## Table of Contents

- [Core Capabilities](#core-capabilities)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Project Directory Structure](#project-directory-structure)
- [Local Setup & Getting Started](#local-setup--getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Option A: Running with Docker Compose (Recommended)](#option-a-running-with-docker-compose-recommended)
  - [Option B: Running Bare-Metal Locally](#option-b-running-bare-metal-locally)
- [Telemetry & Ingestion Simulator](#telemetry--ingestion-simulator)
- [API Reference & Route Specifications](#api-reference--route-specifications)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [Security & Defenses](#security--defenses)
- [Verification & Automated Test Suites](#verification--automated-test-suites)
- [Troubleshooting & Common Questions](#troubleshooting--common-questions)
- [Contributing](#contributing)

---

## Core Capabilities

### 1. Multi-Tenant Organization & Role-Based Access Control
- Granular authorization hierarchy: **Organizations** contain **Projects**, which house **Services** and **Connected GitHub Repositories**.
- Scoped access levels: `owner`, `admin`, and `member` enforced via strict middleware (`hasRole`, `getMembership`).
- URL-safe auto-slugification for clean organization identifiers.

### 2. High-Throughput Log Ingestion & Credential Management
- Dedicated high-performance ingestion endpoint (`POST /api/ingest/:serviceId/logs`).
- Authenticated via raw 64-hexadecimal ingestion secrets passed as `Bearer` tokens. Secrets are hashed (`SHA-256`) at rest in MongoDB.
- Dynamic credential rotation (`POST /api/services/:serviceId/rotate-credential`) featuring immediate invalidation of old secrets, one-time plaintext reveal, and clipboard protection.

### 3. Automated Incident Detection Engine
- **Service Health Incidents**: Ingestion pipeline counts `error` and `fatal` logs in a tumbling time window. Exceeding thresholds automatically generates a `high` or `critical` incident, marks the service status as `degraded`, and broadcasts events over WebSockets.
- **Incident Lifecycle Management**: Endpoints for full incident lifecycle states: `open` &rarr; `acknowledged` &rarr; `investigating` &rarr; `resolved` &rarr; `reopened`.
- Comprehensive audit history tracks every actor, state change timestamp, and comment.

### 4. AI-Powered Root Cause Investigation
- Investigation engine parses log evidence and constructs structured prompt payloads protected against prompt injection.
- Dual-provider strategy:
  - **Gemini 1.5 Flash**: Invoked when `GEMINI_API_KEY` is provided, generating structured hypotheses, confidence scores, supporting log references, recommended steps, and uncertainties.
  - **Deterministic Rule-Based Fallback**: Built-in mock provider generates contextual hypotheses directly from log patterns if no API key is supplied or when upstream rate limits occur.
- Safeguards: Log references are strictly validated against existing incident evidence IDs before persisting.

### 5. GitHub REST API Integration & CI/CD Incident Detection
- Connect public and private GitHub repositories to organizations.
- Live inspection of commit history, repository health, and GitHub Actions workflow runs directly from the UI.
- Automated or on-demand CI/CD incident creation (`source: 'github_actions'`) from failed workflow runs.
- Compound unique index (`organization + owner + repo + runId`) guarantees that a failed workflow run can trigger at most one incident, preventing duplicate alerts during concurrent webhooks or retries.

### 6. Secure Outbound Webhooks (Phase 13.1)
- Organization-scoped webhook notification engine dispatching JSON event envelopes for newly created incidents.
- **SSRF Defenses**: Full IP parser and DNS resolver rejecting loopback (`127.0.0.0/8`, `::1`), private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local metadata endpoints (`169.254.169.254`), non-HTTP schemes, and DNS rebinding hosts.
- **HMAC Signatures**: Every payload is signed with a destination secret via `X-OpsMind-Signature: sha256=<hex64>`.
- **Bounded Delivery**: 5-second hard timeout abort signal, 64KB response truncation, automatic rejection of HTTP redirects (`redirect: 'error'`), and real-time capture of `lastDelivery` statuses.
- **Zero Secret Leakage**: Database schema declares `secret` with `select: false`, preventing exposure in general queries and Express API responses.

### 7. Real-Time Observability Dashboard
- Socket.IO integration delivers sub-second incident alerts and live log streaming to the browser.
- Health statistics, severity breakdowns, and service status graphs rendered with Recharts.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Layer (Port 5173 / Nginx)"]
        UI["React 19 + Vite Dashboard"]
        SocketClient["Socket.IO Client"]
    end

    subgraph Gateway ["Reverse Proxy & Ingress"]
        Nginx["Nginx Reverse Proxy (client/nginx.conf)"]
    end

    subgraph Backend ["Application Layer (Port 5000)"]
        API["Express 5 REST API"]
        AuthMiddleware["JWT & RBAC Middleware"]
        IngestEngine["Log Ingest Controller"]
        DetectionEngine["Threshold Detection Engine"]
        AIEngine["AI Investigation Service (Gemini / Mock)"]
        GitHubClient["GitHub REST API Client"]
        WebhookDispatcher["Outbound Webhook Dispatcher"]
        SocketServer["Socket.IO Server"]
    end

    subgraph Database ["Persistence Layer"]
        MongoDB[(MongoDB Atlas / Local)]
    end

    subgraph External ["External Integrations & Receivers"]
        GitHubAPI["GitHub REST API v3"]
        Simulator["Telemetry Simulator (Port 5001)"]
        WebhookDestinations["Outbound Webhooks (Slack/Discord/PagerDuty)"]
        GeminiAPI["Google Gemini 1.5 Flash API"]
    end

    UI --> Nginx
    SocketClient <--> Nginx
    Nginx -->|/api/*| API
    Nginx -->|/socket.io/*| SocketServer

    Simulator -->|POST /api/ingest/:serviceId/logs| API
    API --> AuthMiddleware
    AuthMiddleware --> IngestEngine
    IngestEngine --> DetectionEngine
    DetectionEngine -->|Trigger Incident| WebhookDispatcher
    DetectionEngine -->|Broadcast| SocketServer
    API --> AIEngine
    AIEngine -.->|Optional| GeminiAPI
    API --> GitHubClient
    GitHubClient <--> GitHubAPI
    WebhookDispatcher -->|HMAC-Signed POST| WebhookDestinations

    API <--> MongoDB
```

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Vite 8, React Router 7, Tailwind CSS 4, Recharts 3, Lucide React, Axios |
| **Backend** | Node.js (v20+), Express 5, Mongoose 9, JWT (`jsonwebtoken`), `bcryptjs`, Socket.IO 4 |
| **Security & Utilities** | Helmet, Express Rate Limit, Node.js native `crypto` (HMAC-SHA256), native `dns` & `net` for SSRF validation |
| **Database** | MongoDB Atlas / MongoDB 7+ with compound indexes and unique partial constraints |
| **Reverse Proxy** | Nginx Alpine (embedded DNS resolver `127.0.0.11` with variable upstream resolution) |
| **Containerization** | Docker, Docker Compose |
| **Telemetry Simulator** | Node.js, Express 5, Axios (configurable anomaly generator) |

---

## Project Directory Structure

```text
OpsMind/
├── client/                     # Frontend SPA (React + Vite)
│   ├── nginx.conf              # Production Nginx reverse proxy configuration
│   ├── Dockerfile              # Multi-stage Docker build for frontend
│   ├── src/
│   │   ├── api/                # Axios and Socket.IO API clients
│   │   ├── components/         # Modular UI panels (Webhooks, Logs, Incidents, Services, GitHub)
│   │   ├── context/            # AuthContext (JWT session state & persistence)
│   │   ├── pages/              # Dashboard, Organizations, GitHub, Login, Register
│   │   └── utils/              # Client-side GitHub and date mappers
│   └── vite.config.js          # Vite configuration with Tailwind CSS plugin
├── server/                     # Backend API Server (Node.js + Express)
│   ├── config/db.js            # MongoDB Mongoose connection handler
│   ├── controllers/            # Auth, Org, Project, Service, Log, Incident, GitHub, Webhook
│   ├── middleware/             # JWT auth guard, error handling, 404 handler
│   ├── models/                 # Mongoose schemas (User, Organization, Project, Service, Log, Incident, Webhook, GitHubRepo)
│   ├── routes/                 # Express route definitions
│   ├── services/               # AI investigation service & outbound webhook delivery service
│   ├── utils/                  # Credential hashing, slug generation, GitHub client, SSRF URL validator
│   ├── server.js               # Application bootstrap, Socket.IO init, rate limiting
│   └── Dockerfile              # Container definition for API server
├── simulator/                  # Standalone telemetry simulator
│   ├── server.js               # Express mock log emission generator
│   └── Dockerfile              # Simulator container definition
├── docker-compose.yml          # Multi-container orchestration (client, server, simulator)
├── mock_receiver.js            # Host-level mock HTTP receiver for webhook verification
├── webhook_verify.js           # 96-assertion Phase 13.1 verification test suite
├── test-webhooks.js            # Automated webhook integration test script
├── test-github-api.js          # Automated GitHub CI/CD integration test suite
├── test-credential-rotation.js # Automated credential security & rotation test suite
├── test-phase11.js             # Automated incident lifecycle test suite
└── README.md                   # Project documentation
```

---

## Local Setup & Getting Started

### Prerequisites

- **Docker Desktop** (recommended) or **Node.js v20+** with **npm v10+**
- A **MongoDB Atlas** database connection string (or a running local MongoDB instance)
- A **GitHub Personal Access Token (classic or fine-grained)** with `repo` or `public_repo` permissions *(optional, for GitHub CI monitoring)*
- A **Google Gemini API Key** *(optional, falls back automatically to the rule-based mock engine)*

---

### Environment Configuration

Before launching the platform, create the local environment files from their examples.

#### 1. Backend (`server/.env`)
Create `server/.env`:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/opsmind?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_signing_key_at_least_32_characters
GITHUB_TOKEN=ghp_yourPersonalAccessTokenHereOptional
GEMINI_API_KEY=your_gemini_api_key_optional
```

#### 2. Simulator (`simulator/.env` - Bare-metal only)
If running the simulator outside Docker, create `simulator/.env`:
```env
PORT=5001
INGEST_URL=http://localhost:5000/api/ingest
SERVICE_ID=your_target_service_object_id_from_dashboard
INGEST_SECRET=your_plain_text_service_ingest_secret
```
*(When running via Docker Compose, the simulator automatically uses the values in `docker-compose.yml`).*

---

### Option A: Running with Docker Compose (Recommended)

Docker Compose starts the backend, the production-built frontend inside Nginx, and the telemetry simulator in an isolated bridge network.

```bash
# 1. Clone the repository
git clone https://github.com/sahasweety/OpsMind.git
cd OpsMind

# 2. Build and start all services
docker compose up --build -d

# 3. Check service health
docker compose ps
```

The application is now accessible at:
- **Web Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API (via Nginx)**: [http://localhost:5173/api/health](http://localhost:5173/api/health)
- **Telemetry Simulator**: [http://localhost:5001](http://localhost:5001)

To view real-time logs across all containers:
```bash
docker compose logs -f server
```

To stop containers:
```bash
docker compose down
```

---

### Option B: Running Bare-Metal Locally

To run the application natively without Docker containers:

#### 1. Start the API Server
```bash
cd server
npm install
npm run dev
# Server starts on http://localhost:5000
```

#### 2. Start the Frontend Client
In a new terminal:
```bash
cd client
npm install
npm run dev
# Vite dev server starts on http://localhost:5173
```

#### 3. Start the Telemetry Simulator (Optional)
In a third terminal:
```bash
cd simulator
npm install
npm run dev
# Simulator listens on http://localhost:5001
```

---

## Telemetry & Ingestion Simulator

OpsMind includes a standalone telemetry simulator (`simulator/server.js`) designed to push steady-state normal traffic or inject error spikes to trigger incident workflows.

### Generating Ingest Traffic via HTTP
With the simulator running on port 5001:

1. **Trigger Normal Traffic Burst**:
   ```bash
   curl -X POST http://localhost:5001/api/simulate/traffic \
     -H "Content-Type: application/json" \
     -d '{"count": 10, "intervalMs": 100}'
   ```

2. **Trigger Anomaly / Error Spike (Creates Incident)**:
   ```bash
   curl -X POST http://localhost:5001/api/simulate/error-spike \
     -H "Content-Type: application/json" \
     -d '{"count": 6, "level": "fatal", "message": "Connection refused to database replica"}'
   ```

---

## API Reference & Route Specifications

All endpoints under `/api` require a valid JWT token in the `Authorization: Bearer <token>` header, with the exception of public authentication routes and the service ingestion endpoint.

### 1. System Health
| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | No | Returns API runtime and MongoDB connectivity status |

### 2. Authentication (`/api/auth`)
| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/auth/register` | No | Register a user (`name`, `email`, `password`) |
| `POST` | `/api/auth/login` | No | Login with email and password |
| `GET` | `/api/auth/me` | Yes | Get the authenticated user profile |

### 3. Organizations (`/api/organizations`)
| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/organizations` | Yes | Create an organization (caller becomes `owner`) |
| `GET` | `/api/organizations` | Yes | List organizations where user is a member |
| `GET` | `/api/organizations/:id` | Yes | Get organization details (members only) |
| `PATCH`| `/api/organizations/:id` | Yes | Update organization name (`owner` or `admin`) |
| `DELETE`|`/api/organizations/:id` | Yes | Delete organization and cascade child entities (`owner` only) |

### 4. Projects (`/api/projects`)
| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/projects` | Yes | Create a project in an organization |
| `GET` | `/api/projects?organizationId=:id` | Yes | List all projects belonging to an organization |
| `GET` | `/api/projects/:id` | Yes | Get project details |
| `PATCH`| `/api/projects/:id` | Yes | Update project name or description |
| `DELETE`|`/api/projects/:id` | Yes | Delete project and associated services |

### 5. Services (`/api/services`)
| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/services` | Yes | Register a new service; returns plaintext ingest secret once |
| `GET` | `/api/services?projectId=:id` | Yes | List all services in a project |
| `GET` | `/api/services/:id` | Yes | Get service details and current operational status |
| `PATCH`| `/api/services/:id` | Yes | Update service metadata |
| `PATCH`| `/api/services/:id/status` | Yes | Update status (`healthy`, `degraded`, `down`) |
| `POST` | `/api/services/:id/rotate-credential`| Yes | Rotate ingestion secret; immediately returns new raw secret |
| `DELETE`|`/api/services/:id` | Yes | Delete service and related logs |

### 6. Log Ingestion & Querying
| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/ingest/:serviceId/logs` | Ingest Secret | High-speed ingestion. Bearer token matches service ingest secret |
| `GET` | `/api/services/:serviceId/logs` | Yes | Paginated query of ingested logs with level filtering |

### 7. Incidents & AI Investigation (`/api/incidents`)
| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/incidents?organizationId=:id` | Yes | Paginated list of incidents (`source`, `status`, `severity`) |
| `GET` | `/api/incidents/:id` | Yes | Get incident details and associated evidence log records |
| `POST` | `/api/incidents/:id/investigate` | Yes | Trigger AI root-cause investigation (Gemini or Mock fallback) |
| `POST` | `/api/incidents/:id/acknowledge` | Yes | Transition status to `acknowledged` with audit record |
| `POST` | `/api/incidents/:id/resolve` | Yes | Transition status to `resolved` with resolution timestamp |
| `POST` | `/api/incidents/:id/reopen` | Yes | Reopen an incident to `open` status |

### 8. GitHub CI/CD Integration (`/api/github`)
| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/github/status` | Yes | Check if `GITHUB_TOKEN` is configured on the backend |
| `GET` | `/api/github/repos?organizationId=:id` | Yes | List connected GitHub repositories for an organization |
| `POST` | `/api/github/repos` | Yes | Connect a repo (`owner`, `repo`, `organizationId`) |
| `GET` | `/api/github/repos/:id` | Yes | Fetch repository metadata and live GitHub rate limits |
| `GET` | `/api/github/repos/:id/commits` | Yes | Fetch recent commit history from GitHub REST API |
| `GET` | `/api/github/repos/:id/workflows` | Yes | Fetch workflow runs and CI execution conclusions |
| `POST` | `/api/github/repos/:id/create-incident` | Yes | Create an incident from a failed workflow run |
| `DELETE`|`/api/github/repos/:id` | Yes | Disconnect repository from organization |

### 9. Outbound Webhooks (`/api/organizations/:organizationId/webhooks`)
| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/` | Yes (`owner`/`admin`) | List configured webhook destinations (secrets redacted) |
| `POST` | `/` | Yes (`owner`/`admin`) | Register webhook (`name`, `url`, optional `secret`) |
| `PATCH`| `/:webhookId` | Yes (`owner`/`admin`) | Update webhook name, URL, secret, or enabled status |
| `DELETE`|`/:webhookId` | Yes (`owner`/`admin`) | Delete a webhook destination |
| `POST` | `/:webhookId/test` | Yes (`owner`/`admin`) | Dispatch a real mock test event (`webhook.test`) |

---

## Role-Based Access Control (RBAC)

OpsMind enforces permission boundaries based on organization membership:

| Operation | Organization Owner | Organization Admin | Organization Member | Non-Member |
| :--- | :---: | :---: | :---: | :---: |
| View Org / Projects / Services / Logs | ✅ | ✅ | ✅ | ❌ (403) |
| Create Projects & Register Services | ✅ | ✅ | ✅ | ❌ (403) |
| Update Project / Service / Rotate Credential | ✅ | ✅ | ❌ (403) | ❌ (403) |
| Acknowledge / Resolve / Reopen Incidents | ✅ | ✅ | ✅ | ❌ (403) |
| Trigger AI Incident Investigation | ✅ | ✅ | ✅ | ❌ (403) |
| Connect / Disconnect GitHub Repositories | ✅ | ✅ | ❌ (403) | ❌ (403) |
| Create / Update / Delete / Test Webhooks | ✅ | ✅ | ❌ (403) | ❌ (403) |
| Delete Organization | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |

---

## Security & Defenses

1. **SSRF Hardening**:
   - Webhook URLs are parsed and evaluated before dispatch. Loopback addresses, IPv4-mapped IPv6, RFC 1918 private ranges, and cloud provider metadata IPs are systematically rejected.
   - Hostnames undergo DNS resolution prior to requests; names resolving to private addresses (such as `localtest.me` &rarr; `127.0.0.1`) are blocked.
   - Automatic HTTP redirect following is disabled (`redirect: 'error'`), stopping redirect-based internal port probes.
   - The development convenience `host.docker.internal` is strictly disabled when `NODE_ENV === 'production'`.
2. **HMAC-SHA256 Payload Signatures**:
   - Payloads sent to external webhook endpoints are signed using the destination's secret key. The header `X-OpsMind-Signature: sha256=<hex64>` enables receivers to authenticate sender identity.
3. **Secret Redaction & Salted Hashing**:
   - Ingestion credentials are never stored in plaintext. They are hashed using `crypto.createHash('sha256')` with per-service salt before persistence.
   - Webhook signing secrets are declared with Mongoose `select: false` and explicitly deleted from Express controller response bodies.
4. **Prompt Injection Mitigation**:
   - Evidence logs ingested into the AI prompt template are sanitized to strip control characters and encapsulated in explicit `<user-data>` boundaries with system instructions directing the model to treat content strictly as untrusted telemetry data.
5. **Reverse Proxy & Rate Limiting**:
   - The Express application enforces proxy trust for exact single-hop headers (`trust proxy: 1`) and applies `express-rate-limit` across all endpoints to prevent brute-force attacks.

---

## Verification & Automated Test Suites

OpsMind includes a comprehensive automated test battery verifying functionality from security boundaries to integration flows.

### Summary of Test Suites

| Script | Test Focus | Target / Mode | Execution Command |
| :--- | :--- | :--- | :--- |
| **`webhook_verify.js`** | **Phase 13.1 Full Webhook Suite** (96 assertions: SSRF, HMAC, 200/500/404 delivery, timeouts, redirects, org isolation, API redaction) | Server Container | `docker exec -w /app opsmind-server-1 node webhook_verify.js` |
| **`test-webhooks.js`** | **Webhook End-to-End API Suite** (SSRF, RBAC, CRUD, delivery outcomes, GitHub incident dispatch) | Running App (`localhost:5173`) | `node test-webhooks.js` |
| **`test-github-api.js`** | **GitHub Integration Suite** (Token check, repo connection, live commits, workflow runs, CI incident dedup) | Running App (`localhost:5000`) | `node test-github-api.js` |
| **`test-credential-rotation.js`** | **Credential Rotation Suite** (Ingest token rotation, invalidation of old keys, one-time reveal) | Running App (`localhost:5000`) | `node test-credential-rotation.js` |
| **`test-phase11.js`** | **Incident Lifecycle & RBAC** (Acknowledge, resolve, reopen, pagination, audit history) | Running App (`localhost:5000`) | `node test-phase11.js` |

### Running the Webhook Verification Suite

To run the complete 96-test Phase 13.1 verification suite:

```powershell
# 1. Start the host-level mock receiver (if not already running)
node D:\OpsMind\mock_receiver.js

# 2. Copy the test suite into the running backend container
docker cp D:\OpsMind\webhook_verify.js opsmind-server-1:/app/webhook_verify.js

# 3. Execute the verification suite
docker exec -w /app opsmind-server-1 node webhook_verify.js
```

### Running Frontend Type & Lint Checks
```bash
cd client
npm run lint    # Executes oxlint for ultra-fast static analysis
npm run build   # Validates production Vite build
```

---

## Troubleshooting & Common Questions

#### 1. Login or API requests return "Route not found" or 404 through Nginx
- **Cause**: Nginx variable-based `proxy_pass` configuration forwarded duplicate paths when a trailing path was specified on the variable.
- **Resolution**: Ensure [client/nginx.conf](file:///D:/OpsMind/client/nginx.conf) specifies `set $backend http://server:5000; proxy_pass $backend;` without an extra `/api/` suffix. Nginx preserves the request URI path automatically.

#### 2. Simulator cannot reach the Ingest endpoint inside Docker
- **Cause**: The simulator tried to reach `localhost:5000` rather than the Docker service name.
- **Resolution**: In `docker-compose.yml`, verify `INGEST_URL=http://server:5000/api/ingest`. `server` resolves over the internal Docker network.

#### 3. AI Investigation returns `provider: 'mock'`
- **Explanation**: If `GEMINI_API_KEY` is omitted or invalid in `server/.env`, OpsMind falls back to the deterministic mock engine. Incident investigations will still succeed and return structured hypotheses without breaking runtime flows.

#### 4. GitHub Rate Limit Exceeded
- **Explanation**: Unauthenticated GitHub requests are capped at 60 requests/hour. Supplying a valid `GITHUB_TOKEN` in `server/.env` raises the limit to 5,000 requests/hour.

---

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/incident-enrichment`.
3. Commit your changes: `git commit -m "feat: add incident metric enrichment"`.
4. Run regression tests: `node test-phase11.js && node test-webhooks.js`.
5. Push to your branch and submit a Pull Request.

---

## License

This project is licensed under the **ISC License**.
