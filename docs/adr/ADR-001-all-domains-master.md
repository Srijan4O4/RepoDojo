# RepoDojo — Architecture Decision Record

## Domain 1: Product Requirements & Architecture

**Status:** ✅ Complete  
**Date:** 2026-11-02

---

### Decision 1.1 — Repository Structure
**Question:** Monorepo vs polyrepo?  
**Decision:** **Monorepo with workspaces**  
**Rationale:** Simpler for a small team, unified CI/CD, atomic cross-service changes, single version history. The SDLC paper emphasizes context engineering — a monorepo gives AI agents full project context in one place.  
**Rejected:** Polyrepo (too much overhead), Hybrid (unnecessary split)

---

### Decision 1.2 — Package Manager
**Question:** Which Node.js package manager?  
**Decision:** **pnpm workspaces**  
**Rationale:** Fastest, most disk-efficient (hard links), strict dependency isolation (prevents phantom dependencies), excellent monorepo support, built-in workspace protocol. Industry standard for monorepos.  
**Rejected:** npm workspaces (slower, phantom deps), Yarn Berry (PnP compatibility issues)

---

### Decision 1.3 — System Architecture Pattern
**Question:** Microservices vs monolith vs hybrid?  
**Decision:** **Modular monolith (Node.js) + separate Python microservice**  
**Rationale:** Node.js backend as a single Express application with clearly separated internal modules (auth, assessment, sandbox, evaluation). Python AI service runs independently via HTTP. Avoids premature microservice complexity while maintaining clean domain boundaries. Can be split later if needed.  
**Rejected:** Full microservices (operational overhead), Full monolith (forces Python into Node.js)

---

### Decision 1.4 — API Design
**Question:** REST vs GraphQL vs tRPC?  
**Decision:** **REST API with OpenAPI specification + WebSocket for real-time**  
**Rationale:** Well-understood, straightforward with Express, excellent documentation tooling (Swagger UI), easy to test. OpenAPI spec serves as the API contract the SDLC paper emphasizes. WebSocket used separately for terminal streaming and AI chat.  
**Rejected:** GraphQL (overkill for well-defined shapes), tRPC (requires TS everywhere, doesn't extend to Python)

---

### Decision 1.5 — Inter-Service Communication
**Question:** How should Node.js ↔ Python services communicate?  
**Decision:** **HTTP/REST for synchronous calls**  
**Rationale:** Simple, debuggable, works with any hosting. Python service exposes REST endpoints. Message queue deferred until async processing (report generation, graph updates) justifies it.  
**Rejected:** gRPC (complexity, HTTP/2 hosting issues), Message queue from start (premature)

---

### Decision 1.6 — Database Strategy
**Question:** Single vs multiple databases?  
**Decision:** **Single MongoDB database, logical separation by collection, Mongoose ORM**  
**Rationale:** Collections per domain: `users`, `assessments`, `sessions`, `ai_interactions`, `evaluations`, `repositories`. Single connection string, fits MongoDB Atlas free tier (one cluster). Mongoose for schema validation per module.  
**Rejected:** Multiple databases (complicates management, exceeds free tier), Hybrid MongoDB+PostgreSQL (doubles infrastructure)

---

### Decision 1.7 — Language Choice
**Question:** TypeScript or JavaScript?  
**Decision:** **TypeScript for both frontend (React) and backend (Express)**  
**Rationale:** Compile-time bug catching, better refactoring, self-documenting via types, excellent AI agent compatibility. Shared type definitions between frontend and backend in the monorepo. SDLC paper notes AI-generated code benefits from type systems.  
**Rejected:** JavaScript with JSDoc (no compile-time guarantees), JS backend + TS frontend (inconsistency)

---

### Decision 1.8 — Frontend Build Tooling
**Question:** What build tool for the React frontend?  
**Decision:** **Vite**  
**Rationale:** Lightning-fast HMR, native ES modules, excellent TypeScript support, minimal configuration, fast builds. Industry standard for new React projects in 2026.  
**Rejected:** Next.js (overkill with separate backend, deviates from MERN), CRA (deprecated)

---

### Decision 1.9 — Python AI Service Framework
**Question:** Which Python web framework?  
**Decision:** **FastAPI**  
**Rationale:** Modern async framework (ASGI/uvicorn), built-in OpenAPI docs, native type hints with Pydantic validation, WebSocket support, excellent AI/ML library ecosystem. Auto-generated API docs match our OpenAPI-first approach.  
**Rejected:** Flask (synchronous, manual validation), Django REST (heavyweight for orchestration service)

---

### Decision 1.10 — Backend Project Structure
**Question:** Feature-based vs layer-based module organization?  
**Decision:** **Feature-based (modular) structure**  
**Rationale:** Group by business domain: `/modules/auth/`, `/modules/assessment/`, `/modules/sandbox/`, `/modules/evaluation/` — each containing its own routes, controllers, services, models, middleware, and tests. Scales naturally, aligns with PRD's 15 domains. AI agents navigate better with co-located code.  
**Rejected:** Layer-based (scatters related code), Hybrid (still scatters)

---

### Decision 1.11 — Testing Framework Strategy
**Question:** Which testing frameworks?  
**Decision:** **Vitest (frontend) + Jest (backend) + Supertest (API integration)**  
**Rationale:** Vitest is the natural companion for Vite (same config, fast, native transforms). Jest for backend/Node.js (industry standard, excellent mocking). Supertest for HTTP endpoint testing. All support TypeScript natively.  
**Rejected:** Jest everywhere (slower for Vite frontend), Vitest everywhere (less mature for backend)

---

---

## Domain 2: Local Development Environment & Project Setup

**Status:** ✅ Complete  
**Date:** 2026-11-02

---

### Decision 2.1 — Directory Structure
**Question:** What should the top-level directory hierarchy look like under `D:\RepoDojo`?  
**Decision:** **Structured hierarchy (`apps/` + `packages/` + supporting directories)**  
**Rationale:**
```
D:\RepoDojo/
├── apps/
│   ├── web/          (React frontend)
│   ├── api/          (Express backend)
│   └── ai-service/   (Python FastAPI)
├── packages/
│   └── shared/       (shared TypeScript types, utils, constants)
├── docs/             (architecture, ADRs, API contracts)
├── infra/            (Docker, IaC, deployment configs)
├── scripts/          (dev scripts, setup automation)
├── .agent/           (agent instructions, skills, prompts)
├── graphify/         (Graphify configs, graph artifacts)
├── evaluation/       (test datasets, rubrics, eval scripts)
└── tools/            (dev tooling, linting configs)
```
Follows standard monorepo workspace patterns, cleanly separates deployables from shared packages and operational tooling, and makes codebase navigation unambiguous for both developers and AI agents.  
**Rejected:** Flat root structure (conflates app code with config), apps-only root (clutters discoverability)

---

### Decision 2.2 — Runtime Versions
**Question:** What Node.js and Python versions should be targeted?  
**Decision:** **Node.js LTS v22.x + Python 3.12+ (pinned via `.nvmrc` and `.python-version`)**  
**Rationale:** Node.js 22 is active LTS through April 2027, offering stable ESM, modern web standard APIs, and experimental strip-types. Python 3.12 provides enhanced performance and modern typing for FastAPI/Pydantic v2.  
**Rejected:** Node.js 20 / Python 3.11 (older, nearing maintenance), Node.js 23 / Python 3.13 (non-LTS/cutting-edge instability)

---

### Decision 2.3 — Code Quality & Linting Tooling
**Question:** What linting, formatting, and git hook setup should be used?  
**Decision:** **ESLint v9 (flat config) + Prettier + Husky + lint-staged (TypeScript), Ruff (Python)**  
**Rationale:** ESLint v9 flat config with `@typescript-eslint` and React rules provides rigorous compile/static checks. Prettier handles opinionated formatting without debates. Husky + lint-staged run checks on staged files only. Ruff serves as the lightning-fast all-in-one linter/formatter for Python.  
**Rejected:** Biome (younger ecosystem, fewer ecosystem plugins), ESLint-only formatting (slower, configuration bloat)

---

### Decision 2.4 — Environment Configuration & Secrets Management
**Question:** How should environment variables, API keys, and secrets be managed?  
**Decision:** **dotenv + per-environment `.env` files + pre-commit secret scanning**  
**Rationale:** Use `.env.example` committed with placeholders, `.env.development` and `.env.test` gitignored. Supported natively across Vite, Express (`dotenv`), and FastAPI (`pydantic-settings`). Pre-commit git hooks block accidental commits containing credential patterns.  
**Rejected:** Vault/Infisical (excessive setup overhead for initial MVP), Encrypted .env (key management complexity)

---

### Decision 2.5 — Git Branching Strategy
**Question:** What Git workflow and branching model should be followed?  
**Decision:** **Simplified Git Flow (`main`, `develop`, `feature/domain/desc`, Conventional Commits)**  
**Rationale:** `main` is deployable production; `develop` serves as the integration trunk. Domain tasks branch off `develop` as `feature/domain-name/description`. Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`) ensure traceable changelogs and auditability aligned with PRD requirements.  
**Rejected:** Trunk-based directly on `main` (risks releasing incomplete domain work), unconstrained commits (no traceability)

---

### Decision 2.6 — Monorepo Task Orchestration
**Question:** How should multi-package tasks (dev servers, builds, tests, linting) be orchestrated?  
**Decision:** **Turborepo**  
**Rationale:** High-performance monorepo build system by Vercel. Native task dependency pipeline (`turbo.json`), topological execution (builds `@repo/shared` before dependent apps), incremental local build caching, and seamless integration with pnpm workspaces.  
**Rejected:** Raw pnpm filtering (`pnpm -r`) (lacks task caching and build graph optimization), Nx (heavyweight enterprise bloat)

---

### Decision 2.7 — Python Dependency & Environment Management
**Question:** How should the Python AI service (`apps/ai-service`) manage dependencies, lockfiles, and virtual environments?  
**Decision:** **uv (Astral) with local virtualenv on D-drive (`apps/ai-service/.venv`)**  
**Rationale:** Blazing fast Rust-based tool replacing pip, pip-tools, venv, and poetry. Generates deterministic `uv.lock`, manages Python versions, and cleanly maintains the virtual environment strictly within the D-drive workspace.  
**Rejected:** Poetry (significantly slower dependency resolution), standard pip + venv (lacks robust lockfiles)

---

### Decision 2.8 — Local Supporting Services
**Question:** How should developers run MongoDB and optional Redis during local development?  
**Decision:** **Docker Compose (`docker-compose.dev.yml`) with data persisted on D-drive**  
**Rationale:** Single-command service spin-up (`pnpm run infra:up`). Isolates local MongoDB and optional Redis from the host OS, mounts persistent database volume to `D:\RepoDojo\infra\data\mongo`, and guarantees identical database behavior across machines.  
**Rejected:** Native Windows service installs (host clutter, version drift), Remote Atlas for local dev (network latency, burns free-tier quotas)

---

---

## Domain 3: Authentication and User Management

**Status:** ✅ Complete  
**Date:** 2026-11-02

---

### Decision 3.1 — Google OAuth 2.0 Implementation
**Question:** Which architectural flow and library combination should be implemented for Google OAuth?  
**Decision:** **Passport.js with `passport-google-oauth20` (Node/Express backend) + standard OAuth redirect flow**  
**Rationale:** Fully self-hosted with zero external SaaS auth vendor dependency or cost. Express handles the OAuth 2.0 handshake securely, retrieves verified Google user profile metadata, persists/upserts the candidate in MongoDB, and issues platform session tokens.  
**Rejected:** Managed SaaS Auth (Firebase/Supabase Auth) (vendor lock-in, free-tier limits, fragmented user storage), Pure client-side PKCE popup (more complex SPA lifecycle sync)

---

### Decision 3.2 — Session & Token Architecture
**Question:** How should candidate sessions and authenticated API requests be managed?  
**Decision:** **HTTP-only Secure SameSite JWT Cookies with Refresh Token Rotation**  
**Rationale:** Short-lived Access Token (15 mins) and long-lived Refresh Token (7 days) stored in HTTP-only, Secure, SameSite cookies. Immune to XSS token exfiltration. Refresh tokens are tracked in MongoDB for instantaneous session revocation upon logout, timeout, or security violation. Transparently maintains session integrity through browser reloads during an assessment.  
**Rejected:** Bearer token in LocalStorage (vulnerable to XSS), Server-side session store with DB lookup per request (unnecessary latency and database pressure)

---

### Decision 3.3 — Authorization Model & User Roles
**Question:** How should user roles and permissions be structured?  
**Decision:** **Role-Based Access Control (RBAC) with predefined roles (`candidate`, `admin`)**  
**Rationale:** Clear enum on the User schema (`candidate`, `admin`). Modular middleware (`requireAuth`, `requireRole('admin')`) guards challenge management and administrative actions while keeping candidate assessment workflows lightweight and clean.  
**Rejected:** ABAC / granular permissions array (premature schema complexity for MVP), Env-var email whitelist (brittle, non-auditable)

---

### Decision 3.4 — Rate Limiting & Abuse Prevention
**Question:** How should auth and API endpoints be protected against brute force, bots, and quota exhaustion?  
**Decision:** **express-rate-limit (memory store, upgradable to Redis) + Helmet + strict CORS**  
**Rationale:** Strict throttling on authentication routes (e.g., 5 attempts/minute for login/token exchange) and general API throttling (e.g., 100 req/min). Uses memory sliding-window in dev/single-node and drops in `rate-limit-redis` for multi-instance production. Hardened with Helmet HTTP security headers and strict origin-whitelisted CORS.  
**Rejected:** Reverse-proxy only rate limiting (leaves dev and direct instances unprotected), No app-level rate limiting (risks rapid free-tier burnout and DoS)

---

---

## Domain 4: Assessment Lifecycle Management

**Status:** ✅ Complete  
**Date:** 2026-11-02

---

### Decision 4.1 — Assessment Session State Machine
**Question:** How should the platform manage and enforce valid lifecycle states of an assessment session?  
**Decision:** **Strict Finite-State Machine (FSM) stored in MongoDB with atomic conditional transitions**  
**Rationale:** Enum states: `['CREATED', 'PROVISIONING', 'READY', 'IN_PROGRESS', 'SUBMITTING', 'SUBMITTED', 'TIMED_OUT', 'EVALUATING', 'COMPLETED', 'FAILED']`. Explicit valid transitions only. Atomic MongoDB queries (`findOneAndUpdate({ _id, status: 'IN_PROGRESS' }, { status: 'SUBMITTING' })`) eliminate race conditions, duplicate submissions, and phantom states.  
**Rejected:** Loose boolean flags (risks corrupt hybrid states), External workflow engine (Temporal) (heavyweight operational bloat for MVP)

---

### Decision 4.2 — Assessment Timer Authority & Expiration Enforcement
**Question:** How should the ~60-minute duration and expiration be enforced reliably?  
**Decision:** **Server-authoritative timestamps (`startedAt`, `expiresAt`) + backend worker check + client clock-drift sync**  
**Rationale:** The server controls time calculations. When the assessment starts, `startedAt = now` and `expiresAt = now + duration`. The client renders a synchronized countdown. A lightweight backend cron/timeout worker monitors sessions: if `now >= expiresAt`, the server auto-transitions the session to `TIMED_OUT` and queues evaluation. Client-side clock manipulation or closed tabs cannot extend assessment time.  
**Rejected:** Client-driven timer reporting (easily bypassed/tampered with), MongoDB TTL indexes (bypasses submission hooks and candidate state capture)

---

### Decision 4.3 — Concurrent Session Control & Idempotency
**Question:** How should simultaneous attempts and duplicate session creation requests be handled?  
**Decision:** **Strict single active session per candidate + Idempotency Key**  
**Rationale:** A MongoDB partial unique index on `{ candidateId: 1 }` where status is active (`['CREATED', 'PROVISIONING', 'READY', 'IN_PROGRESS']`) strictly prevents a candidate from running multiple concurrent sandboxes, conserving free-tier compute. Client requests pass an idempotency key: duplicate calls return the existing active session without spinning up duplicate containers.  
**Rejected:** Multiple concurrent sessions per user (burdens free-tier capacity), Blind auto-cancellation (destroys candidate progress on accidental clicks)

---

### Decision 4.4 — Disconnect Detection, Heartbeats & Idle Reclamation
**Question:** How should disconnected sessions be managed to protect resources while handling network drops?  
**Decision:** **30s heartbeat + 10-minute disconnect grace period + sandbox hibernation / auto-submit**  
**Rationale:** The candidate workspace sends a heartbeat ping every 30 seconds. If heartbeats stop (browser closed or network lost), a 10-minute grace window begins. If the candidate reconnects within 10 minutes, the session resumes seamlessly. If 10 minutes elapse without reconnection, the sandbox container is safely suspended to free RAM/CPU, but the authoritative session timer keeps running. If time expires while disconnected, the session auto-submits with the last-persisted disk snapshot.  
**Rejected:** Instant kill on disconnect (destroys work during brief Wi-Fi glitches), Unconditional 60-min run regardless of user abandonment (wastes scarce free-tier compute)

---

---

## Domain 5: Repository and Challenge Management

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 5.1 — Challenge Structure & Repository Separation
**Question:** How should RepoDojo store and manage the clean working codebase, the 8 intentional defects, and the hidden evaluation test suite?  
**Decision:** **Hybrid Branch-Authoring + Private Evaluation Repository**  
**Rationale:**
- **Challenge Authoring Repository:** Contains `solution` branch (golden reference), `starter` branch (with exactly 8 defects introduced), Git version tags (`v1.0.0`), and defect documentation.
- **Private Evaluation Repository:** Contains hidden test suites, evaluation runner scripts, test configs, and scoring logic. Strictly separated with restricted credentials.
- **Candidate Workspace:** Receives starter code only (zero access to hidden tests or solution).
- **Isolated Evaluation Runner:** Retrieves candidate submission snapshot, mounts private tests in an isolated worker, executes tests, computes score, returns structured results.  
Combines the simplicity of branch-based authoring with absolute security of private test assets.  
**Rejected:** Flat patch/diff files (brittle across refactors), 3 repos per challenge (operational bloat at scale)

---

### Decision 5.2 — Challenge Specification & Metadata Schema
**Question:** How should internal evaluation specifications, rubrics, and defect relationships be formatted and maintained?  
**Decision:** **Authoritative `repodojo.challenge.yml` + Markdown Candidate Docs + JSON Schema Validation + DAG Modeling**  
**Rationale:**
- **Single Source of Truth:** `repodojo.challenge.yml` in authoring repo defines: 8 problem definitions, expected behavior, affected files, DAG dependencies between bugs, evaluation rubrics, runtime requirements, hidden test mappings.
- **Candidate Docs:** `README.md` and `PROBLEMS.md` provide candidate-facing instructions.
- **Validation Pipeline:** Enforces JSON Schema (types, required fields, exactly 8 problems, valid file paths), cross-references, DAG circular dependency detection, and rubric constraints.
- **MongoDB Projection:** Stores validated, published challenge versions as an immutable read projection (pinned by challenge version and manifest SHA-256 hash).  
**Rejected:** Database-only metadata via Web Portal (drifts from git version control), Hardcoded backend definitions (inflexible)

---

### Decision 5.3 — Candidate Workspace Provisioning & Startup Performance
**Question:** How should the starter codebase and dependencies be delivered to the sandbox for instant boot and security?  
**Decision:** **Layered Immutable Docker Images (built on `repodojo/base-node22`) + Worker Pre-pulling + Ephemeral Scratch Volume**  
**Rationale:**
- **Layered Base Images:** Common runtime base images (`repodojo/base-node22`) cached across workers. Challenge-specific images (`repodojo/challenge-node-001:v1.0.0@sha256:...`) layer starter files and pre-installed `node_modules` on top, stripping all `.git` metadata and internal files.
- **Pre-pulled by Workers:** Execution nodes maintain popular challenge images locally, yielding <2 second container boot.
- **Candidate Hardening:** Non-root user (`node:node`), ephemeral writable scratch volume, bounded resource limits (e.g. 2 vCPUs, 2 GB RAM, 2 GB disk, PID limits, restricted outbound network).
- **Automated Lifecycle Cleanup:** Stops container on timer expiration, snapshots candidate disk to storage for grading, destroys writable container, and releases resources.  
**Rejected:** Dynamic Git clone + pnpm install on startup (30–90s cold start), Tarball unpack into generic container (slower than native container layer cache)

---

### Decision 5.4 — Challenge Quality Gate & Verification Pipeline ("Dogfooding")
**Question:** How must newly created or updated assessment challenges be verified before publishing?  
**Decision:** **6-Stage Automated Verification CI Pipeline + Lifecycle Simulation**  
**Rationale:**
1. **Static Validation:** YAML schema, file paths, dependency DAG (cycles/reachability), rubric math.
2. **Golden Solution Verification:** Runs private test suite against `solution` branch -> MUST score 100% pass (0 regressions).
3. **Starter Defect Verification:** Runs private test suite against `starter` branch -> MUST fail exactly the 8 targeted tests and 0 baseline tests (valid syntax, servers boot, only intended bugs fail).
4. **Runtime Verification:** Automated smoke tests verify backend/frontend start, health-check endpoints succeed, and application processes bind ports cleanly.
5. **Graph Verification:** Python AI service runs Graphify AST extraction & graph construction -> verifies all 8 defect-related functions and files are properly indexed.
6. **Artifact Verification:** Builds Docker image, scans for vulnerabilities, pins image digest, and simulates full candidate lifecycle (boot, heartbeat, snapshot capture, teardown).  
Only when all 6 stages pass is the version tagged and published to MongoDB.  
**Rejected:** Manual admin review (error-prone, misses regressions), Unit-test only check (fails to verify defect behavior and Graphify)

---

---

## Domain 6: Sandbox and Execution Infrastructure

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 6.1 — Container / Sandbox Runtime Engine
**Question:** How should candidate execution environments be virtualized and managed across local dev and production?  
**Decision:** **Docker Engine with Dockerode API + Dedicated Execution Worker Architecture (runtime-agnostic)**  
**Rationale:**
- **Local Development:** Docker Desktop with WSL2 Linux backend on Windows. Exposes standard Docker Engine API for local container management.
- **Production/Staging:** Dedicated Linux execution-worker VMs running Docker Engine. The Sandbox Provisioning Service communicates via authenticated Docker APIs.
- **Candidate Isolation:** Non-root execution (`node:node`), dropped Linux capabilities, seccomp and AppArmor security profiles, read-only root filesystem with tmpfs/scratch, strict cgroup limits (CPU, memory, PIDs, disk quotas), isolated bridge network without host/metadata access.
- **Runtime-Agnostic Interface:** Keeps the provisioning contract abstract so Firecracker microVMs or other hypervisor-level isolation runtimes can be introduced later without changing backend code.  
**Rejected:** Fly.io Machines API only (cannot run locally on Windows), WebContainers (in-browser) (cannot run native compiled addons, browser tab RAM limits, leaks runtime to candidate)

---

### Decision 6.2 — Interactive Terminal Architecture
**Question:** How should the interactive terminal bridge between the browser UI (`xterm.js`) and the container shell be architected?  
**Decision:** **Authenticated WebSocket Terminal Gateway (`/ws/terminal/:sessionId`) + Docker Exec Interactive PTY + Bounded Output Replay**  
**Rationale:**
- **Browser Frontend:** `xterm.js` connecting over authenticated WebSocket (`/ws/terminal/:sessionId`).
- **Backend Gateway:** Validates session ownership via secure cookie, then invokes Dockerode `container.exec()` with PTY (`Tty: true`, `AttachStdin`, `AttachStdout`, `AttachStderr`, user: `node`).
- **Protocol:** Binary WebSocket frames for raw ANSI stream; structured JSON control frames for terminal resize (`exec.resize()`), heartbeats, and status.
- **Reconnection Resilience:** Terminal session state is decoupled from the WebSocket connection. A bounded circular buffer (e.g. 100 KB) in the gateway retains recent output to replay smoothly upon reconnects without spawning new shells or losing context.  
**Rejected:** Direct WebSocket to container with embedded daemon (`ttyd`) (punches open ports into untrusted containers, bypasses central audit), HTTP request/response polling (destroys interactive CLI semantics)

---

### Decision 6.3 — Application Preview & Port Routing
**Question:** How should the candidate inspect and interact with their full-stack running application in the workspace preview panel?  
**Decision:** **Dedicated Dynamic Reverse Proxy (Caddy/Traefik) + Session-Bound Subdomain Routing + Path-Based Multi-Port Routing**  
**Rationale:**
- **Private Container Network:** Candidate containers run standard internal ports (e.g., Vite frontend on 5173, Express backend on 5000) on an isolated Docker bridge network. Zero host ports exposed.
- **Unified Origin Routing:** Opaque preview hostname (e.g., `https://<sessionId>.preview.repodojo-preview.net`) on a separate registrable domain. Paths route internally:
  - `/` → Frontend service (port 5173)
  - `/api/*` → Backend service (port 5000)
  - WebSocket upgrades → Respective frontend HMR or backend WebSocket services.
- **Preview Gateway:** Caddy or Traefik acts as the dynamic data plane with routes registered/deregistered by the Provisioning Service.
- **Security:** Strict iframe sandbox and restrictive CSP. Browser preview cannot access the main RepoDojo application origin, tokens, or internal infrastructure.  
**Rejected:** Dynamic Host Port Mapping (`-p <port>`) (exposes dynamic ports to internet, mixed content warnings, CORS headaches), Screen capture streaming (VNC) (excessive CPU/RAM overhead)

---

### Decision 6.4 — Filesystem Sync, Change Tracking & Workspace Persistence
**Question:** How should source code files be synchronized between browser editor, container disk, and platform storage?  
**Decision:** **REST Workspace File Gateway + WebSocket Notifications + Debounced Auto-Save + Ephemeral Git Change Tracking + Versioned Object Storage Snapshots**  
**Rationale:**
- **Workspace File Gateway:** Authenticated REST APIs (`/api/workspace/:sessionId/tree`, `/file`) with path traversal guards, atomic file writes, and monotonic revision numbering.
- **Browser Auto-Save:** Debounced auto-save (~500ms). Explicit flush-before-run/submit ensures terminal commands and evaluation always execute against latest editor state.
- **Change Tracking:** Ephemeral Git repository initialized on the scratch volume with the starter commit. Real-time `git status` and `git diff` power the UI Changes panel, supplemented by filesystem watchers (`chokidar`/`inotify`).
- **Durable Persistence:** 60-second periodic incremental checkpoints and full lifecycle snapshots saved to platform object storage (S3/MinIO) asynchronously.
- **Immutable Submission:** On submit or expiration, an immutable submission artifact (complete workspace files + content hashes + revision number) is persisted for evaluation.  
**Rejected:** In-memory browser storage with batch submit (stale disk files during terminal commands), Network filesystem mounts (WebDAV/NFS) (brittle over web)

---

### Decision 6.5 — Resource Quota Management, Concurrency & Janitor Reclamation
**Question:** How should the platform manage concurrent sandbox capacity under free-tier limits and prevent zombie container leaks?  
**Decision:** **Distributed Concurrency Semaphore + Durable Session Leases + Autonomous Per-Worker Janitor Agents + Hard Container Watchdogs**  
**Rationale:**
- **Resource-Aware Semaphore:** Atomic capacity reservations based on available worker RAM/CPU rather than fixed counts. When full, assessment requests enter a fair wait-time queue.
- **Durable Session Leases:** Expiration deadline stored in MongoDB and stamped as container labels (`repodojo.session_id`, `repodojo.expires_at`).
- **Independent Janitor Agent:** Runs out-of-band every 30–60 seconds on every Docker host. Reconciles running containers against database leases. Terminates expired/orphaned containers via graceful SIGTERM then SIGKILL. Functions autonomously even if the main Express backend crashes.
- **Safe Reclamation:** Final submission snapshot is verified in object storage before destroying ephemeral container volumes. Docker `--init` ensures no zombie child processes survive.  
**Rejected:** Express backend in-memory `setTimeout` (timers lost on server restart), Self-killing container scripts (candidate can kill sleep process from terminal)

---

## Summary — Domain 6 Technology Stack

| Component | Decision |
|---|---|
| Container Engine | Docker Engine + Dockerode (runtime-agnostic for Firecracker future) |
| Host Environments | Docker Desktop/WSL2 (local dev), Dedicated Linux workers (staging/prod) |
| Container Security | Non-root `node:node`, dropped caps, seccomp/AppArmor, read-only rootfs + scratch |
| Terminal Bridge | WebSocket gateway (`/ws/terminal/:sessionId`) + Docker Exec PTY + ring buffer replay |
| Application Preview | Caddy/Traefik reverse proxy + unified path routing (`/`, `/api/*`) on separate domain |
| Filesystem Sync | REST file gateway + 500ms auto-save + pre-run flush + monotonic revisions |
| Change Tracking | Ephemeral Git repo on scratch volume (`git diff` / `git status`) + inotify |
| Durability | 60-sec incremental checkpoints + S3/MinIO snapshots + immutable submission artifact |
| Concurrency & Leases | Dynamic RAM/CPU semaphore + MongoDB leases + container expiration labels |
---

## Domain 7: Candidate Workspace and Frontend

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 7.1 — Code Editor Component & Integrated Diff Viewer
**Question:** Which in-browser code editor engine should power the candidate's code editing and change-tracking experience?  
**Decision:** **Monaco Editor (`@monaco-editor/react`) + Built-in `DiffEditor` + Workspace File Gateway Integration**  
**Rationale:**
- **Code Editor:** VS Code-like editing capabilities via Monaco Editor (`@monaco-editor/react`), including syntax highlighting, IntelliSense, auto-completion, bracket matching, code folding, multi-cursor editing, minimap, diagnostics, and keyboard shortcuts.
- **Model Management:** Stable virtual file URIs mapped to workspace paths, maintaining independent editor models and view states per open file. Language-specific configurations for JS, TS, JSON, HTML, CSS. Lazy-loading editor resources and language workers to optimize initial load time.
- **Language Intelligence:** Native Monaco TS/JS language services for client-side type-checking. External Language Server Protocol (LSP) routed through authenticated backend gateway when advanced project-level intelligence is needed, strictly scoped to candidate's workspace.
- **Integrated Diff Viewer:** Monaco's built-in `<DiffEditor />` for side-by-side comparison between the immutable starter baseline and current workspace contents retrieved via Workspace Gateway APIs. Visual diffs reflect server-generated Git diffs (modified, added, deleted, renamed files).
- **Workspace Synchronization:** Model change events connected to 500ms debounced auto-save. Monotonic workspace revisions acknowledge successful writes. Pending edits flushed before executing terminal commands, running tests, or submitting. Filesystem watcher events refresh editor models without clobbering unsaved local edits.
- **Security:** Workspace source files treated as untrusted content with CSP protection.  
**Rejected:** CodeMirror 6 (requires extensive custom plugin work for TS IntelliSense, multi-model management, and side-by-side diffs), Ace Editor (outdated UX, no modern LSP)

---

### Decision 7.2 — Workspace Layout & Multi-Panel Windowing System
**Question:** How should the 10 workspace components be organized, docked, and resized on screen?  
**Decision:** **Dockview (`dockview-react`) Multi-Panel Docking Engine + Persistent Assessment Header + Resizable Tabbed Groups**  
**Rationale:**
- **IDE Layout Architecture:** Dockview (`dockview-react`) manages 8 dockable content panels grouped into tabbed docking regions:
  - **Left Group:** File Tree and Problem Statement (tabbed).
  - **Center Group:** Code Editor and Changes/Diff Viewer (tabbed, primary workspace area).
  - **Right Group:** Application Preview and AI Assistant (tabbed).
  - **Bottom Group:** Interactive Terminal and Logs (tabbed).
- **Persistent Header:** Assessment Timer and Process Controls (Run, Test, Restart, Stop, Submit) live in a fixed, non-dockable top header to guarantee visibility and prevent accidental hiding.
- **Docking Capabilities:** Candidates can drag panels, create arbitrary horizontal/vertical splits, rearrange tabs, collapse sidebars, and maximize panels. Minimum/maximum dimensions prevent panels from collapsing into unusable sizes.
- **Layout Persistence:** Layout state serialized via Dockview `api.toJSON()` and saved to browser `localStorage` (debounced, keyed by assessment ID and layout version). Preserves exact layout across tab refreshes and reconnections.
- **Component Lifecycle:** Moving or hiding a panel does not destroy underlying Monaco models, terminal PTY sessions, or running app previews. Floating popouts outside the main browser window are disabled to prevent assessment fragmentation.  
**Rejected:** Fixed CSS Grid (rigid, cannot customize splits), Modal/Dialog-heavy popups (prevents simultaneous side-by-side editing and terminal/preview inspection)

---

### Decision 7.3 — Frontend State Management Architecture
**Question:** How should client-side state and high-frequency events be managed across the candidate workspace?  
**Decision:** **Zustand (Domain-Specific Stores) + TanStack Query (Server State Cache) + Isolated Event Channels**  
**Rationale:**
- **Zustand (Client & Workspace Store):** Manages high-frequency, transient UI states (active tabs, view states, dirty flags, panel visibility, process status, AI streaming state, preferences) split across domain-specific stores. Selector-based subscriptions ensure granular re-renders. Actions callable directly from WebSocket handlers outside React's render loop.
- **TanStack Query (Server State & API Cache):** Manages asynchronous server data (challenge metadata, problem statements, file tree responses, session details, submission status). Scoped query keys (`['workspace', sessionId, 'tree']`), optimistic mutations, and targeted invalidations.
- **High-Frequency Isolation:**
  - *Assessment Timer:* Local 1-second countdown computed from server authoritative expiration; re-renders only the timer widget.
  - *AI Assistant:* Isolated assistant store with batched token streaming.
  - *Code Editor:* Source buffers kept directly in Monaco models; Zustand tracks dirty indicators only.
  - *Terminal:* Raw ANSI stream pipes directly from WebSocket into xterm.js instance; Zustand tracks connection state and metadata only.
- **Persistence:** Lightweight preferences and Dockview layout saved to `localStorage`; authoritative assessment state fetched from backend APIs.  
**Rejected:** Redux Toolkit / RTK Query (heavy boilerplate, excessive ceremony for team size), Pure React Context + useReducer (triggers workspace-wide re-render cascade on 1s timer ticks and streaming AI tokens)

---

### Decision 7.4 — UI Design System, Component Library & Styling
**Question:** What styling framework and UI component library should be used for the workspace interface?  
**Decision:** **Tailwind CSS v4 + shadcn/ui (Radix UI Base) + Lucide React + Dark-Mode-First Design Tokens**  
**Rationale:**
- **Tailwind CSS v4:** Zero runtime CSS-in-JS overhead; CSS-first configuration via `@theme` and custom properties; compiles to minimal static CSS.
- **shadcn/ui + Radix UI:** Accessible, unstyled primitives (`@radix-ui/react-*` for dialogs, dropdowns, tooltips, popovers, tabs, context menus, scroll areas). Source code owned directly inside `apps/web/src/components/ui/` without package lock-in.
- **Iconography:** `lucide-react` for clean, consistent developer icons.
- **Dark-Mode-First:** Semantic CSS variables for editor surfaces, panel backgrounds, elevated surfaces, borders, and status indicators. Themed identically across Monaco Editor, xterm.js, and Dockview panels via CSS custom properties.  
**Rejected:** Material UI (MUI v6) (CSS-in-JS runtime overhead, mobile-app aesthetic unsuited for IDEs), Chakra UI (runtime styling overhead, less tailored for IDE split views)

---

---

## Domain 8: AI-Agent Integration

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 8.1 — AI Assistant Interaction Model & LLM Provider
**Question:** Which LLM provider, model, and interaction paradigm should power the candidate AI assistant?  
**Decision:** **HackerRank-Style Guarded AI Assistant + Google Gemini 3.8 Flash Exclusively + Ask-Only Mode**  
**Rationale:**
- **Model:** Google Gemini 3.8 Flash (`gemini-3.8-flash`) exclusively via the official Google Gen AI SDK. No automated fallback to alternative providers when quota is exhausted. Generous allowances match free-tier constraints (PRD §15).
- **Interaction Paradigm:** Ask Mode. Candidates submit natural language questions alongside active file context, selected code snippets, problem statement references, and terminal error excerpts.
- **Guarded Assistance Boundaries:**
  - *Permitted:* Explaining existing repository architecture, functions, classes, and execution flows; diagnosing syntax and runtime exceptions; conceptual debugging guidance; edge cases; small illustrative snippets.
  - *Prohibited:* Generating complete assessment solutions, autonomous implementation plans, multi-file code modifications, inline autocomplete, or direct command execution. The candidate remains 100% responsible for implementing and testing fixes.
- **Streaming & Telemetry:** Server-Sent Events (SSE) streaming with per-candidate token budgets and full audit logging.  
**Rejected:** Autonomous coding agents (takes away problem-solving evaluation), Anthropic Claude / OpenAI GPT-4o exclusively (no free tier, high per-candidate dollar costs)

---

### Decision 8.2 — Dual-Layer AI Service Pipeline Architecture
**Question:** How should responsibilities be divided between the Express backend (MERN) and the Python FastAPI service (`apps/ai-service`)?  
**Decision:** **Express Platform Gateway + Python FastAPI Orchestration & Graphify Layer + Gemini 3.8 Flash + SSE Relay**  
**Rationale:**
- **Express Backend (Control Plane):** Exposes authenticated `/api/ai/chat/stream`. Authenticates candidate, validates active session, enforces rate limits, atomically reserves candidate token budget, and forwards authorized requests to Python service over internal private network using signed service JWTs. Relays SSE response stream to React.
- **Python FastAPI Service (`apps/ai-service`):** Exposes `/internal/ai/chat/stream`. Attaches precomputed Graphify AST/code dependency context and authorized workspace snippets, injects Socratic Guarded System Instructions, applies prompt-injection defenses, invokes Google Gemini 3.8 Flash via Python SDK, validates outputs, and streams tokens back to Express.
- **Streaming Pipeline:** React Workspace → Express API Gateway → Python FastAPI Orchestration → Gemini 3.8 Flash → FastAPI Async Stream → Express SSE Relay → React Workspace.
- **Budget Reconciliation:** Provider-reported usage (input, output, and thinking tokens) is reconciled against the reserved budget upon stream completion and persisted to MongoDB.  
**Rejected:** Direct Express-to-Gemini (duplicates prompt orchestration and fragments Graphify in Python), Direct Client-to-Gemini (exposes API keys, leaks system prompts, bypasses guardrails)

---

### Decision 8.3 — Multi-Layer Guardrail Architecture & Solution-Leak Prevention
**Question:** How should the AI service prevent complete solution generation, full function replacements, or adversarial prompt jailbreaks?  
**Decision:** **Multi-Layer Guardrail Defense + Strict Context Isolation + Socratic Persona + 7-Line Snippet Cap + Deterministic Output Validator**  
**Rationale:**
- **Context Isolation (Primary Boundary):** The AI service NEVER receives the `solution` branch, golden reference, hidden evaluation tests, expected patches, or grading rubrics. It only accesses candidate-visible starter code and problem statements. It physically cannot leak the answer key.
- **Socratic System Persona:** Configures Gemini 3.8 Flash as a senior programming mentor in Guarded Assessment Mode. Conceptual guidance and progressive debugging hints only; explicitly refuses complete solutions or function replacements.
- **Structural Code Output Limits:** Hard limit of maximum 7 lines of code total across all code blocks per response (matching PRD §3.2 missing logic size). Rejects unified diffs, patches, or full-file replacements.
- **Deterministic Output Validator:** Python service parses generated markdown before streaming; violating code blocks are replaced with safe conceptual explanations or guided debugging hints without incurring additional LLM latency.
- **Conversation-Level Progressive Hints:** Tracks assistance levels per problem (Level 1: Concepts → Level 2: File/Function Locators → Level 3: Debugging Guidance). Detects multi-turn attempts to incrementally reconstruct prohibited code.
- **Adversarial Red-Team CI Suite:** Automated test suite covering direct solution requests, role-playing, and incremental reconstruction run before publishing challenge versions.  
**Rejected:** System prompt instructions only (vulnerable to jailbreaks), Secondary LLM classifier guardrail (doubles inference latency and burns 2x token quota)

---

### Decision 8.4 — AI Usage Telemetry & Evaluation Instrumentation
**Question:** How should candidate AI interactions be instrumented, recorded, and correlated with code changes for scoring?  
**Decision:** **Comprehensive AI Telemetry in MongoDB (`ai_interactions`) + Workspace Revision Correlation + Independent Output & Trajectory Evaluation**  
**Rationale:**
- **Interaction Telemetry:** Dedicated `ai_interactions` collection capturing session IDs, turn number, timestamp, latency, prompt text, attached file/error context, Graphify nodes queried, Gemini 3.8 Flash token metrics (input/output/total), guardrail decisions, and assistance progression levels.
- **Workspace Revision Correlation:** Workspace Management Service emits structured events for file mutations with monotonic revision numbers. Telemetry links AI interaction IDs with the workspace revision immediately preceding and succeeding the interaction.
- **Execution Event Correlation:** Run, Test, and Submit events log exit codes, test passes/fails, and workspace revisions, connecting subsequent debugging outcomes to preceding AI guidance.
- **Output vs. Trajectory Scoring (PRD §7.2, §18.8):**
  - *Output Evaluation:* Functional correctness, hidden test suite pass rate (Domain 10).
  - *Trajectory Evaluation:* AI usage efficiency, hint progression, token consumption, debugging sequence, and whether candidate validated suggestions vs blindly copying.
- **Privacy & Security:** Encrypted at rest, restricted to authorized evaluators, transparent candidate disclosure, with no collection of raw OS clipboard data.  
**Rejected:** Basic chat messages array on session document (lacks token metrics, latency, and code correlation), Third-party analytics SaaS (SaaS cost, data fragmentation away from MongoDB)

---

---

## Domain 9: Codebase Intelligence and Graphify Integration

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 9.1 — Graphify Lifecycle & Challenge Pre-computation Strategy
**Question:** When and how should the Graphify knowledge graph be generated for assessment repositories?  
**Decision:** **Offline Graphify Pre-computation in Challenge CI + Immutable Versioned Graph Artifacts + Python AI Service Caching**  
**Rationale:**
- **Build-Time Generation:** Integrated into Stage 5 of the Domain 5 Challenge Quality Gate pipeline. Executes exclusively on the candidate-visible `starter` commit after validation.
- **Deterministic Code-Only Extraction:** Uses Graphify's Tree-sitter AST extraction with code-only processing (zero LLM token spend, no external transmission, immune to comment prompt-injection).
- **Canonical Artifacts:** Native `graphify-out/graph.json` stored in platform object storage (S3/MinIO) alongside challenge version metadata in MongoDB, verified with SHA-256 checksums. Immutable: every challenge version pins its own graph artifact.
- **Python Service Caching:** Loaded into memory / local disk cache by Python FastAPI workers during provisioning, shared across concurrent candidates attempting the same challenge version.
- **Candidate Workspace Modifications:** Published graph acts as immutable structural baseline. Live file contents (10-30 LOC) are retrieved from candidate's live workspace volume via Workspace Context API. Optional asynchronous session-scoped incremental overlays for significant saves.
- **Graceful Fallback:** Controlled fallback to direct authorized workspace file retrieval if graph artifact is temporarily unavailable.  
**Rejected:** Dynamic graph generation on session boot (adds 15-60s cold start), Lazy on-demand generation on first user prompt (causes 30s chat lag)

---

### Decision 9.2 — Graph Query Interface & Context Assembly in Python AI Service
**Question:** How should the Python AI service query the Graphify knowledge graph and assemble structural repository context for Gemini 3.8 Flash?  
**Decision:** **In-Process Python Graph Query Engine (NetworkX/Native Adapter) + Deterministic 1-2 Degree Context Selection + Live Source Retrieval + Token-Budgeted Context Package**  
**Rationale:**
- **In-Process Engine:** FastAPI loads parsed `graph.json` into memory using NetworkX directed graph structures. Node lookups, caller/callee resolution, imports, and shortest-path queries execute in <2ms with zero IPC latency.
- **Deterministic Context Selection:** Ranks entities mentioned in candidate's prompt, active editor file, selected code, and terminal error. Traverses 1–2 relationship degrees around relevant nodes (callers, callees, direct module imports).
- **Live Source Snippets:** Graph provides topological structural mapping; actual source lines (10–30 lines per section with line numbers) are retrieved from candidate's live workspace volume via authorized Workspace Context API.
- **Context Assembly & Budgeting:** Assembles a structured payload (problem statement, graph relationships, file paths, line-numbered source snippets, terminal errors, bounded chat history) constrained by a configurable token budget.
- **Single-Pass Guarded Inference:** Context passed to Gemini 3.8 Flash in a single guarded inference call. Avoids multi-turn autonomous tool loops or agentic exploration, preserving low streaming latency and tight token economics.  
**Rejected:** Standalone MCP sidecar process (IPC overhead, subprocess management), Autonomous LLM tool loops (burns 3x-5x token budget, adds 5-10s streaming latency, violates guarded ask-only paradigm)

---

### Decision 9.3 — Dual-Track Graphify Architecture (Assessment Engine + Monorepo Dev Tooling)
**Question:** How should the platform-level Graphify integration be structured for monorepo self-understanding and AI-assisted development?  
**Decision:** **Dual-Track Architecture (Candidate Assessment Track + Internal Monorepo Development Track via Local MCP & Agent Skills)**  
**Rationale:**
- **Candidate Track:** As established in 9.1 & 9.2: offline challenge pre-computation, immutable versioned `graph.json`, in-memory Python caching, strictly isolated from platform internals.
- **Platform Track (RepoDojo Monorepo Intelligence):**
  - Dedicated script (`pnpm run graphify:platform`) processes `D:\RepoDojo` (`apps/web`, `apps/api`, `apps/ai-service`, `packages/shared`), excluding `.git`, `node_modules`, `.env`, and test artifacts.
  - Generates `D:\RepoDojo\graphify\platform-graph.json` and architecture digest `PLATFORM_GRAPH.md`.
  - Exposes knowledge graph via a local Graphify MCP server (stdio transport) providing `query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `graph_stats`.
  - Reusable Graphify Agent Skill with progressive disclosure enables internal AI coding agents (Antigravity, Claude Code) to inspect cross-module dependencies, API routes, and schema usages without hallucination.
  - Automated CI / pre-merge refresh keeps the platform architectural map synchronized with code changes.  
**Rejected:** Assessment-only track (misses opportunity for AI agents to understand our monorepo), Ad-hoc manual CLI execution (untracked, no MCP integration, easily neglected)

---

---

## Domain 10: Evaluation and Scoring

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 10.1 — Isolated Evaluation Execution Engine
**Question:** How and where should the private hidden evaluation test suite be executed against the candidate's submission?  
**Decision:** **Dedicated Ephemeral Evaluation Orchestrator + Immutable Submission Snapshot + Separate Trusted Test Controller + Restricted Network**  
**Rationale:**
- **Snapshot Capture:** When assessment ends (`SUBMITTED` or `TIMED_OUT`), workspace is frozen. An immutable submission snapshot (complete files, content hashes, revision, challenge version) is persisted to private object storage. Interactive container is terminated. Never run tests inside candidate's live container.
- **Dedicated Evaluation Orchestrator:** Allocates an isolated evaluation environment using a version-pinned evaluation runner image.
- **Test Controller vs. Candidate Workload Separation:** Candidate submission mounted as read-only base with ephemeral writable scratch overlay. Hidden tests live in a separate trusted Test Controller, communicating with candidate services over an isolated per-job private network or controlled IPC. Candidate code has zero access to test files, evaluator memory, or platform credentials.
- **Network & Container Hardening:** Internet egress disabled (`--network none` or per-job network only), non-root, dropped capabilities, read-only rootfs, strict CPU/RAM/PID/time limits. Future-ready for gVisor/Firecracker microVMs.
- **Structured Test Results:** Trusted test runner (Jest/Vitest) outputs authoritative `test-results.json` directly to orchestrator. Candidate scripts cannot manipulate or spoof evaluation outcomes.  
**Rejected:** Running tests inside candidate container before kill (compromised: candidate could have tampered with npm scripts or background processes), Running directly on host VM (untrusted code execution on host OS breaks sandbox security)

---

### Decision 10.2 — Quantitative Scoring Model & Weighting Methodology
**Question:** How should the overall 0–100 assessment score be calculated and weighted across Output Correctness and Trajectory/AI Usage?  
**Decision:** **Balanced 3-Pillar Normalized Scoring Model (60% Functional Correctness + 20% Code Quality + 20% Engineering Trajectory)**  
**Rationale:**
- **Pillar 1: Functional Correctness — 60 Points (Deterministic):**
  - *8 Defect Fixes (48 pts):* 6 pts per verified problem. Proportional partial credit based on weighted assertion pass rates: `6 × (weighted assertions passed / total weighted assertions)`.
  - *Baseline Regression Preservation (12 pts):* Weighted baseline test pass rate ensures fixing bugs did not break existing features.
  - 100% grounded in reproducible test outcomes; zero LLM subjectivity.
- **Pillar 2: Code Quality and Architecture — 20 Points (Measurable & Rubric-Based):**
  - *Static Analysis & Type Safety (8 pts):* ESLint and TypeScript checks evaluated relative to starter baseline.
  - *Implementation Maintainability (8 pts):* Modularity, readability, complexity, duplication, and error handling via deterministic metrics and structured rubric.
  - *Architectural & Change-Scope Compliance (4 pts):* Preservation of API contracts, module boundaries, and interfaces.
- **Pillar 3: Engineering Trajectory & Responsible AI Usage — 20 Points (Empirical Telemetry):**
  - *Verification & Testing Discipline (8 pts):* Running tests, inspecting failures, validating before submit.
  - *Effective AI Assistance (6 pts):* Prompt specificity, context hygiene, hint progression, critical validation. (No penalty for candidates who solve problems independently without AI).
  - *Evidence-Driven Iteration (6 pts):* Correlation between observed errors, code edits, and subsequent execution outcomes.
  - Derived from `ai_interactions`, `workspace_events`, and `execution_events` telemetry.
- **Score Normalization & Transparency:**
  - `Final Score (0–100) = Functional (60) + Quality (20) + Trajectory (20)`.
  - Pinned by rubric version, challenge version, test-suite version, and submission hash.
  - Every point awarded or deducted links directly to verifiable test, lint, or telemetry evidence.  
**Rejected:** Functional-only 100% test scoring (ignores code maintainability and AI engineering evaluation), LLM-heavy holistic scoring (subjective, non-reproducible, invites grade disputes)

---

### Decision 10.3 — Evaluation Pipeline Orchestration & Resilience
**Question:** How should the evaluation process be orchestrated upon assessment completion to avoid HTTP timeouts and ensure reliability?  
**Decision:** **Asynchronous Background Pipeline + BullMQ/Redis Job Queue + MongoDB Transactional Outbox + Dedicated Evaluation Workers + WebSocket Notifications**  
**Rationale:**
- **Asynchronous Enqueueing:** On submit or timer expiration, assessment transitions to `SUBMITTING`, workspace snapshot is persisted in object storage, and an evaluation job is written to a MongoDB transactional outbox. Express responds with HTTP `202 Accepted` immediately, eliminating any risk of HTTP 504 gateway timeouts.
- **BullMQ/Redis Queue:** Dedicated `process-evaluation` queue with persistent Redis storage. Job payloads contain references and IDs (never raw code). Enforces worker concurrency limits and job-level timeouts.
- **Dedicated Workers:** Independent evaluation workers consume jobs, provision isolated evaluation containers (Decision 10.1), compute the 3-pillar score (Decision 10.2), persist the immutable `Evaluation` document in MongoDB, and update session state to `COMPLETED`.
- **Retry & Failure Handling:** Up to 2 automatic retries with exponential backoff & jitter for transient infrastructure errors (worker reboot, container boot timeout). Distinguishes infrastructure failures from candidate test failures. Dead-letter queue and `EVALUATION_FAILED` state on exhaust.
- **State Machine:** `SUBMITTING` → `QUEUED` → `EVALUATING` → `COMPLETED` (or `RETRYING` / `EVALUATION_FAILED`).
- **Result Delivery:** Authenticated WebSocket events (`evaluation_started`, `evaluation_completed`) update workspace in real time and unlock "View Report". Fallback REST status endpoint (`/api/sessions/:id/evaluation-status`) supports page reloads.  
**Rejected:** Synchronous HTTP request/response evaluation (triggers browser and Cloudflare 524 timeouts), Client-only polling (unnecessary HTTP traffic spikes)

---

---

## Domain 11: Reporting and Feedback

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 11.1 — Report Generation Architecture & Qualitative Feedback Synthesis
**Question:** How should the platform generate candidate performance reports combining objective scores with personalized, actionable engineering feedback?  
**Decision:** **Deterministic Evaluation Summary + Constrained Gemini 3.8 Flash Qualitative Synthesis + Pydantic JSON Validation + Immutable MongoDB Reports**  
**Rationale:**
- **Deterministic Foundation (100% Code-Driven):** Scores, 3-pillar breakdown (60% Functional, 20% Quality, 20% Trajectory), pass/partial/fail status for the 8 defects, test assertions, lint metrics, and trajectory statistics are compiled directly from the immutable evaluation record in MongoDB. Zero AI hallucinations in numerical data.
- **Constrained Gemini 3.8 Flash Synthesis:** Invoked via Python FastAPI after deterministic scores are finalized. Provided with a compact evaluation summary and selected code diffs. Generates structured qualitative narrative:
  - `executiveSummary`: High-level assessment verdict.
  - `strengths`: Concrete engineering skills demonstrated in candidate diffs/trajectory.
  - `areasForImprovement`: Specific gaps backed by test failures or observed habits.
  - `practiceRecommendations`: Targeted exercises and concepts.
  - *Evidence Requirement:* Every qualitative observation must reference specific evidence IDs. Prohibited from modifying scores or making unsupported claims.
- **Pydantic Validation & Fallback:** Strict JSON schema validation; rejects unbacked numerical claims; deterministic fallback report generated if Gemini API is temporarily unavailable.
- **Immutable Storage:** Dedicated MongoDB `reports` collection, versioned and frozen upon creation.
- **Asynchronous Processing:** Enqueued to BullMQ/Redis `generate-report` queue immediately upon evaluation completion.  
**Rejected:** Pure rule-based boilerplate reports (sterile, generic, unhelpful), Unstructured free-form LLM generation (hallucinates scores and test results, violates PRD §9.1)

---

### Decision 11.2 — Candidate Report Visualization, Navigation & Export
**Question:** How should the final assessment report be presented, visualized, and exported in the React frontend?  
**Decision:** **Interactive React Dashboard + Read-Only Monaco Diff Viewer + Client-Side PDF Generation + Shareable Public Token URL**  
**Rationale:**
- **Interactive Dashboard (`apps/web/src/pages/report`):**
  - *Hero Scorecard:* 0–100 overall score gauge, duration, completion badge, percentile/tier.
  - *3-Pillar Breakdown:* Visual charts (Recharts / Tailwind charts) for Functional (60), Quality (20), and Trajectory (20).
  - *Defect Explorer:* Accordion of the 8 defects showing problem descriptions, pass/partial/fail badges, assertion details, and read-only Monaco `<DiffEditor />` toggle.
  - *AI Usage & Trajectory Timeline:* Chronological timeline of candidate's problem-solving trajectory (prompts asked, tests run, revisions saved).
  - *Actionable Growth Panel:* AI-synthesized strengths, areas for improvement, and clickable practice exercises.
- **Client-Side PDF Generation:** Generated directly in the browser using `@react-pdf/renderer` or optimized CSS print stylesheets. Completely eliminates the heavy 300–500 MB RAM overhead of server-side Puppeteer/Chromium, honoring free-tier container limits (PRD §15).
- **Shareable Public URL:** Secure, read-only endpoint (`/report/shared/:shareToken`) exposing candidate-approved report representation without sensitive authentication or internal evaluation details.  
**Rejected:** Server-side Puppeteer PDF rendering (excessive RAM overhead crashes free-tier containers), Raw JSON/Markdown download only (poor UX, unsuited for professional developer portfolio)

---

---

## Domain 12: Platform Security

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 12.1 — Trust Boundaries, Network Segmentation & Sandbox Isolation
**Question:** How should platform trust boundaries and network segmentation be enforced?  
**Decision:** **5-Zone Logical Segmentation + Default-Deny Host Firewall + Per-Session Bridge Networks + Hardened Container Isolation**  
**Rationale:**
- **5 Distinct Trust Zones:**
  1. *Public Edge Zone:* Caddy/Traefik reverse proxy terminating TLS, host-header validation, routing `repodojo.com` and isolated candidate previews on `*.preview.repodojo-preview.net`.
  2. *Trusted Platform Zone:* Express backend, MongoDB, and Redis on private internal network with least-privilege database credentials and TLS encryption in transit. Zero database ports exposed.
  3. *Intelligence Zone:* Python FastAPI AI service on private network, accessible only via signed internal service JWTs from Express, outbound to Gemini API only, zero database/Docker access.
  4. *Untrusted Execution Zone:* Dedicated Linux execution workers running candidate containers on isolated per-session Docker bridge networks. Default-deny host firewall blocks RFC 1918 private subnets and cloud metadata endpoints (`169.254.169.254`, `fd00:ec2::254`). Non-root (`node:node`), dropped caps (`cap-drop ALL`), `no-new-privileges`, read-only rootfs + scratch volume, zero host/socket mounts.
  5. *Evaluation Zone:* Independent trusted Test Controller and worker pool; candidate code mounted as read-only base with ephemeral writable overlay; hidden tests kept strictly private; communication via restricted per-job private network or IPC; zero external network egress.
- **Security Baseline:** Default-deny firewall policies, host-level network filtering, and automated network penetration tests to continuously validate isolation.  
**Rejected:** Flat Docker network with app-level JWTs only (candidate can run port scans to probe internal MongoDB/Redis), Full bare-metal Firecracker microVMs for MVP (exceeds free-tier feasibility and local Windows setup)

---

### Decision 12.2 — AI Prompt Injection, Untrusted Code Sanitization & Secret Redaction
**Question:** How should the Python AI service defend against prompt injections, code comment poisoning, and secret exfiltration?  
**Decision:** **Multi-Layer AI Security Pipeline + Context Isolation + Structured Untrusted Delimiters + Pre-Inference Secret Scrubbing + Output DLP Validator**  
**Rationale:**
- **Context Isolation & Data Minimization:** Treats candidate queries, source code, comments, READMEs, and terminal output as untrusted passive data. Never retrieves `.env`, private keys, hidden tests, or solution repositories.
- **Indirect Prompt Injection Inspection:** Detects unicode tricks (zero-width characters, encoded payloads), heuristic instruction override phrases. Wraps untrusted text in explicit boundary tags (`<candidate_prompt>`, `<repository_code file="...">`, `<terminal_error>`) with system instructions that content inside tags is strictly passive data, never executable commands.
- **Pre-Inference Secret Redaction:** In-memory regex scanner detects Google API keys, GitHub tokens, AWS keys, JWTs, DB connection strings, and PEM private keys, replacing them with typed placeholders (`[REDACTED_API_KEY]`, `[REDACTED_JWT]`). Never logs or persists original secrets.
- **Guarded System Prompt:** Version-controlled senior programming mentor in Guarded Assessment Mode; refuses complete solutions or function replacements.
- **Deterministic Post-Generation Output DLP:** Inspects Gemini responses before delivery; bounded streaming inspection buffer catches credential leaks, system prompt leakage, and code blocks exceeding 7 LOC; sanitizes markdown/HTML.
- **Red-Team CI Suite:** Automated adversarial tests covering direct jailbreaks, comment injection, and secret exfiltration.  
**Rejected:** Relying on Gemini default safety filters only (tuned for toxicity, not code injection or solution leaks), Secondary LLM classifier firewall (adds 1s latency and doubles API token cost)

---

### Decision 12.3 — Monorepo CI/CD Security, Dependency Hygiene & Package Hallucination Defense
**Question:** What security quality gates should be enforced in local development and CI/CD to protect against slopsquatting and CVEs?  
**Decision:** **Multi-Gate Security Pipeline (Local Husky/lint-staged + GitHub Actions CI + Dependency Admission Validation + Frozen Lockfiles)**  
**Rationale:**
- **Local Pre-Commit Guardrails (Husky + lint-staged on D:):** Gitleaks staged secret scanning (blocking accidental commits of keys/secrets), ESLint security plugin (`eslint-plugin-security` for unsafe eval, regex DoS, child_process), and dependency manifest change flags.
- **Mandatory PR & CI Security Gates (GitHub Actions):**
  - *Full History Secrets Scan:* Gitleaks action scanning full commit history.
  - *Dependency Vulnerability Audits:* `pnpm audit` (Node/React/Express) and `pip-audit` + OSV-Scanner (Python FastAPI) blocking high/critical CVEs.
  - *SAST Scanning:* Semgrep scanning TS, JS, and Python for injection, path traversal, and unsafe deserialization.
  - *Commit SHA Pinning:* GitHub Actions pinned to full-length commit SHAs.
- **"Slopsquatting" & Package Hallucination Defense (Cycode Best Practice / PRD §13.3, §18.14):**
  - Dedicated dependency admission script runs in CI whenever `package.json` or `pyproject.toml` changes.
  - Verifies newly introduced packages exist in official registries (npm, PyPI), validates package authenticity, provenance, and release age (>30 days), and applies typo-squatting heuristics.
  - Blocks AI coding agents from introducing hallucinated, malicious, or unverified packages.
- **Frozen Lockfiles:** Enforces `pnpm install --frozen-lockfile` and `uv sync --locked` in CI.  
**Rejected:** Passive weekly Dependabot only (doesn't block leaked secrets or hallucinated packages), Manual code review only (error-prone, misses obfuscated secrets)

---

---

## Domain 13: Observability and Monitoring

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 13.1 — Distributed Tracing, Correlation IDs & Centralized Logging
**Question:** How should candidate requests, AI interactions, terminal streams, and background jobs be correlated across services?  
**Decision:** **OpenTelemetry SDKs (Node.js & Python) + W3C Trace Context (`traceparent`) + Unified Assessment Identifiers + Structured JSON Logging + Centralized OTLP Export**  
**Rationale:**
- **Unified Correlation Identity:** Every assessment receives an `assessmentId`, every candidate attempt a `sessionId`, and every business interaction a `correlationId`. Distributed operations use OpenTelemetry `traceId` and `spanId` propagated via standard W3C `traceparent` and `tracestate` headers.
- **Express Backend (Gateway):** OpenTelemetry Node.js SDK instruments inbound routes, MongoDB, Redis, Docker API calls, and outbound Python HTTP calls. Serializes trace context into BullMQ evaluation job metadata.
- **Python FastAPI AI Service:** OpenTelemetry Python SDK extracts W3C trace context, instrumenting Graphify graph queries, context assembly, and Gemini 3.8 Flash streaming responses.
- **Streaming & Async Correlation:**
  - *Terminal & WebSockets:* Authenticated handshakes and connection lifecycle events (connect, reconnect, resize, error) are traced and bound to `sessionId` (avoiding tracing every raw byte).
  - *BullMQ Jobs:* Originating trace context propagated in job metadata; evaluation workers extract context and create linked child spans for container provisioning, test execution, and scoring.
  - *Docker Workers:* Stamped container labels (`repodojo.session_id`, `repodojo.trace_id`) link container lifecycle and Janitor reclamation events to the root trace.
- **Structured JSON Logging:** Uniform schema (`timestamp`, `service`, `level`, `msg`, `correlationId`, `assessmentId`, `sessionId`, `traceId`, `spanId`) emitted to stdout and collected centrally.  
**Rejected:** Independent unsynchronized logging (impossible cross-service debugging), Heavyweight Jaeger sidecar per container (unnecessary overhead for modular monolith on free-tier)

---

### Decision 13.2 — Health Check Probes, Dependency Monitoring & High-Signal Alerting
**Question:** What liveness/readiness probes and high-signal alert triggers should be established to protect assessment reliability?  
**Decision:** **3-Stage Health Probes (`/startupz`, `/livez`, `/readyz`) + Dependency Validation + SLO-Based Operational Alerts + Graceful Degradation**  
**Rationale:**
- **3-Stage Probes across All Services:**
  - `/startupz`: Verifies initialization and configuration loading have completed (prevents premature container restarts).
  - `/livez`: Lightweight check (<5ms) confirming event loop responsiveness; independent of external databases or APIs (triggers container restart only on deadlocks/hangs).
  - `/readyz`: Dependency-aware readiness check. Express verifies MongoDB, Redis, and Docker worker reachability; Python FastAPI verifies Gemini API configuration and Graphify cache; Evaluation workers verify BullMQ and storage access.
- **High-Signal SLO Operational Alerts (PRD §12.3):**
  - `ALERT_SANDBOX_PROVISION_FAILURE`: Sandbox startup failure rate > 5% over 5-minute rolling window.
  - `ALERT_EVALUATION_QUEUE_BACKLOG`: Oldest pending evaluation job breaches start SLO.
  - `ALERT_EVALUATION_DEAD_LETTER`: Evaluation job exhausts retries and enters `EVALUATION_FAILED`.
  - `ALERT_GEMINI_QUOTA_EXHAUSTED`: Sustained Gemini 3.8 Flash 429 quota exhaustion.
  - `ALERT_JANITOR_ORPHAN_SPIKE`: Janitor daemon detects > 3 unreclaimed containers across consecutive cycles.
  - `ALERT_DATABASE_UNAVAILABLE`: MongoDB or Redis connection lost.
  - `ALERT_SERVICE_RESTART_LOOP`: Critical service experiences repeated unexpected restarts.
  - `ALERT_WORKER_RESOURCE_EXHAUSTION`: Worker CPU/RAM limits prevent new container provisioning.
- **Graceful Degradation:** If Gemini is down, the candidate's core coding workspace, editor, and terminal remain fully operational. If the evaluation queue is down, candidate submission snapshots are safely frozen in object storage for recovery. Dispatches alerts via Slack/Discord/Email webhooks.  
**Rejected:** Single generic `/health` endpoint (cannot distinguish process responsiveness from database connection loss), Host CPU-only alerts (misses logical errors and queue backlogs)

---

---

## Domain 14: Deployment and Infrastructure

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 14.1 — Free-Tier Multi-Provider Topology & Hosting Architecture
**Question:** Which hosting providers and topologies should run each service to achieve zero hosting costs while supporting candidate execution?  
**Decision:** **Multi-Provider Cloud Architecture + OCI Always Free ARM64 Workers + Cloudflare Pages & R2 + Managed Free Data Services**  
**Rationale:**
- **Frontend (`apps/web`):** Cloudflare Pages (static React SPA, global edge CDN, automatic preview deployments on PRs, zero server load).
- **Control Plane VM (OCI Always Free ARM64):** 1 OCPU, 4 GB RAM running Express backend (`apps/api`), Python FastAPI AI service (`apps/ai-service`), and Caddy reverse proxy via Docker Compose.
- **Dedicated Execution Worker VM (OCI Always Free ARM64):** Separate VM with 1 OCPU, 8 GB RAM dedicated exclusively to Docker Engine sandboxes and evaluation runners. Conservative limits (0.1–0.2 CPU, 512–768 MB RAM) supporting ~5 concurrent sandboxes initially with an admission queue when capacity is full.
- **Database:** MongoDB Atlas M0 Free Tier (512 MB storage, shared RAM, TLS, IP allowlist to OCI VM). Large snapshots offloaded to R2.
- **Queue:** Upstash Serverless Redis (10,000 commands/day free tier) for BullMQ job references, backed by MongoDB transactional outbox.
- **Object Storage:** Cloudflare R2 (10 GB free tier, 0 egress fees, S3-compatible API for submission snapshots, Graphify JSON, and PDF reports).
- **AI Inference:** Google Gemini 3.8 Flash API (generous free-tier allowance: 15 RPM / 1M TPM, zero compute cost on our servers).
- **Cost Target:** $0.00/month initial hosting expense with a defined future upgrade path to paid compute.  
**Rejected:** Single paid VPS (incurs immediate credit card charges, violates PRD §15), Full AWS Free Tier (EC2 t2.micro crashes under Node.js sandboxes, expires after 12 months)

---

### Decision 14.2 — GitOps CI/CD Automation, IaC & Disaster Recovery
**Question:** How should infrastructure provisioning, application deployments, and automated backups be structured?  
**Decision:** **GitHub Actions CI/CD + Terraform / Cloud-Init IaC + Docker Compose + GHCR ARM64 Releases + Cloudflare R2 Encrypted Backups**  
**Rationale:**
- **Infrastructure as Code (`D:\RepoDojo\infra\`):** Terraform definitions for OCI resources (VMs, networking, security rules); Cloud-Init scripts for VM initialization; declarative `compose.prod.yml` and Caddyfile with automated Let's Encrypt TLS.
- **Automated GitHub Actions CI/CD Pipeline:**
  - *PR Validation:* Runs Domain 12 security gates, Vitest frontend tests, Jest backend tests, TypeScript checks, Terraform validation, and Cloudflare Pages PR previews.
  - *Production Release on merge to `main`:* Docker Buildx builds ARM64 images for `apps/api` and `apps/ai-service`, tagging with commit SHA and pushing to GitHub Container Registry (GHCR). Cloudflare Pages deploys frontend.
  - *Deployment:* Restricted SSH deployment user pulls verified image digests on OCI VM; blue-green switch behind Caddy when capacity permits, or graceful rolling restart with readiness verification.
- **Automated Rollback:** Instant rollback to previous known-good image digest if post-deployment readiness checks fail.
- **Disaster Recovery & Encrypted Backups (PRD §14.4):**
  - Daily automated cron script runs `mongodump --oplog`, client-side encrypts archive with GPG/AES-256, and uploads to private Cloudflare R2 bucket.
  - Scheduled restore verification drill (`scripts/verify-restore.sh`) periodically restores archives into an isolated temporary MongoDB instance, measuring RPO and RTO.  
**Rejected:** Manual SSH deployment & Compass exports (non-reproducible, lacks rollback automation, risks data loss), Full Kubernetes k3s + ArgoCD (consumes 2 GB of precious OCI RAM on daemons alone)

---

---

## Domain 15: Assessment Integrity and Proctoring

**Status:** ✅ Complete  
**Date:** 2026-11-03

---

### Decision 15.1 — Phased Integrity Strategy & Non-Invasive Telemetry Architecture
**Question:** How should assessment integrity and proctoring be phased between initial MVP launch and future platform evolution?  
**Decision:** **Phase 1 Non-Invasive Browser Visibility + Bulk Insertion Telemetry; Phase 2 Dolos / Tree-sitter AST Similarity Analysis + Human Review**  
**Rationale:**
- **Phase 1 — MVP: Non-Invasive Browser and Editor Telemetry:**
  - *Browser Visibility:* Tracks tab transitions via Page Visibility API (`document.visibilitychange`), recording hidden/visible durations and timestamps. Focus/blur recorded as supplementary weak signals.
  - *Bulk Insertion Detection:* Monitors Monaco paste and model change events, recording character-count and line-count buckets without capturing actual raw clipboard text.
  - *Event Store:* Stored in MongoDB `session_events` collection (`assessmentId`, `candidateId`, `sessionId`, `eventType`, `serverTimestamp`, `metadata`).
  - *Privacy & Policy:* Zero webcam, microphone, screenshot, or keystroke capture. No automated disqualifications or score deductions; transparent disclosure presented to candidate before assessment starts.
- **Phase 2 — Post-MVP: AST-Based Code Similarity Analysis:**
  - Asynchronous analysis using Dolos and Tree-sitter AST parsing.
  - Compares candidate-modified code regions against peer submissions for the same challenge version and known public implementations, normalizing syntax and formatting.
  - Generates similarity reports asynchronously without delaying assessment completion.
- **Integrity Correlation & Human Oversight:**
  - Activity timeline connects tab transitions, bulk pastes, AI questions, and test executions in an internal evaluator dashboard.
  - Mandatory human review and appeal policy for any integrity escalation; zero automated disqualifications.
  - Configurable retention periods for behavioral telemetry.  
**Rejected:** Strict active proctoring on Day 1 (webcam/mic video streaming destroys free-tier bandwidth/storage, high candidate friction for practice platform, violates PRD §13.5), Completely ignoring integrity (leaves evaluators blind to external paste dumps and prevents timeline correlation)

---

## Master Architecture Summary — All 15 Domains

| Domain | Core Architectural Decision | Key Technologies |
|---|---|---|
| **1. Requirements & Architecture** | Monorepo with workspaces, Modular Monolith + Python AI service | pnpm, TypeScript, Vite, Express, FastAPI, MongoDB, Vitest/Jest |
| **2. Local Dev & Setup** | Structured hierarchy on D:, Turborepo, pinned LTS runtimes | `D:\RepoDojo`, Node 22, Python 3.12, `uv`, Docker Compose, ESLint v9, Ruff |
| **3. Auth & User Management** | Google OAuth 2.0 via Passport.js, Dual JWT HTTP-only cookies | `passport-google-oauth20`, SameSite cookies, RBAC, `express-rate-limit` |
| **4. Assessment Lifecycle** | Strict MongoDB FSM, server-authoritative timer, single active session | MongoDB FSM (`IN_PROGRESS` → `SUBMITTING`), 30s heartbeat, 10-min grace |
| **5. Repo & Challenge Mgmt** | Authoring Repo (`solution`/`starter`) + Private Eval Repo, 6-Stage CI | `repodojo.challenge.yml`, JSON Schema, DAG, Base Docker images, Dogfooding CI |
| **6. Sandbox & Execution** | Dockerode + Linux workers, WebSocket PTY bridge, Reverse Proxy | Docker Engine, `xterm.js`, Caddy preview gateway, 60s checkpoints, Janitor daemon |
| **7. Candidate Workspace** | Monaco Editor + Diff viewer, Dockview 8 panels, Zustand + TanStack | `@monaco-editor/react`, `dockview-react`, Zustand, TanStack Query, Tailwind v4, shadcn |
| **8. AI-Agent Integration** | Guarded Socratic Assistant (Ask Mode), Gemini 3.8 Flash, Dual-layer | Google Gen AI SDK, Gemini 3.8 Flash, Express gateway → FastAPI SSE, 7-LOC cap |
| **9. Codebase Intelligence** | Offline Graphify pre-computation, In-process NetworkX query engine | Graphify, `graph.json`, NetworkX, Local MCP server + progressive Agent Skill |
| **10. Evaluation & Scoring** | Ephemeral Evaluation Runner, 3-Pillar Scoring (60/20/20), BullMQ | Isolated Test Controller, BullMQ + Redis, transactional outbox, Jest JSON reporter |
| **11. Reporting & Feedback** | Deterministic metrics + Constrained Gemini 3.8 Flash qualitative synthesis | Pydantic JSON validation, MongoDB `reports`, Client-side PDF, Share token URL |
| **12. Platform Security** | 5-Zone Network Segmentation, Default-Deny Firewall, Slopsquatting Gate | Host iptables, non-root, pre-inference secret scrubber, Gitleaks, Semgrep, dependency gate |
| **13. Observability & Monitoring** | OpenTelemetry W3C trace context, 3-stage health probes, SLO alerts | OpenTelemetry SDKs, `pino`, `structlog`, `/startupz`, `/livez`, `/readyz`, Webhook alerts |
| **14. Deployment & Infra** | Multi-Provider Free-Tier: Cloudflare Pages + OCI ARM64 VMs + R2 | Cloudflare Pages/R2, OCI Always Free ARM64 (Control VM + Worker VM), Atlas M0, GHCR |
| **15. Assessment Integrity** | Phased: MVP non-invasive visibility/paste telemetry → Post-MVP Dolos AST | `document.visibilitychange`, Monaco paste events, MongoDB `session_events`, Dolos |


| Component | Decision |
|---|---|
| Frontend Hosting | Cloudflare Pages (Static SPA, Global Edge CDN, Zero Server RAM) |
| Control Plane Host | OCI Always Free ARM64 Ampere A1 (1 OCPU, 4 GB RAM) |
| Sandbox Execution Host | Separate OCI Always Free ARM64 VM (1 OCPU, 8 GB RAM, ~5 concurrent sandboxes) |
| Reverse Proxy | Caddy (automated Let's Encrypt TLS, dynamic routing) |
| Database Hosting | MongoDB Atlas Free Tier M0 (512 MB, IP-whitelisted) |
| Queue / Cache | Upstash Serverless Redis (BullMQ job references) + Mongo outbox |
| Object Storage | Cloudflare R2 (10 GB free, 0 egress fees, S3-compatible) |
| Container Registry | GitHub Container Registry (GHCR, free tier, immutable SHA digests) |
| IaC Framework | Terraform (OCI provider) + Cloud-Init + Docker Compose (`compose.prod.yml`) |
| CI/CD Engine | GitHub Actions (security gates, multi-arch builds, SSH deploy) |
| Backup & DR | Daily `mongodump --oplog` + GPG encryption to R2 + `verify-restore.sh` drill |


| Component | Decision |
|---|---|
| Distributed Tracing | OpenTelemetry (Node.js & Python SDKs) with W3C `traceparent` headers |
| Trace Identifiers | `assessmentId` (persistent), `sessionId` (attempt), `correlationId` (request) |
| Logging Architecture | Structured JSON over stdout (`pino` in Express, `structlog` in Python) |
| Async Propagation | BullMQ job metadata serializes W3C trace context |
| Container Tracing | Container labels (`repodojo.session_id`, `repodojo.trace_id`) |
| Health Probes | 3-Stage: `/startupz` (init), `/livez` (process alive), `/readyz` (dependencies ready) |
| Alerting Strategy | High-signal SLO alerts (Sandbox failures, Queue backlogs, Gemini 429s, Janitor spikes) |
| Alert Dispatch | Webhook notifications to Slack/Discord/Email with deduplication |


| Component | Decision |
|---|---|
| Trust Segmentation | 5 Zones (Edge, Platform, Intelligence, Sandbox, Evaluation) with default-deny |
| Network Isolation | Per-session Docker bridge networks, host iptables blocking RFC 1918 & `169.254.169.254` |
| Container Hardening | Non-root `node:node`, dropped caps, `no-new-privileges`, read-only rootfs + scratch |
| Prompt Defense | Structural tagging (`<candidate_prompt>`, `<repository_code>`) + untrusted data policy |
| Secret Scrubbing | Pre-inference regex scrubber replacing keys/JWTs with typed placeholders |
| Output DLP | Pre-stream output validator blocking credential leaks and code exceeding 7 LOC |
| Secret Detection | Gitleaks in pre-commit (staged) and GitHub Actions CI (full git history) |
| Code SAST | Semgrep OSS + `eslint-plugin-security` |
| Dependency Auditing | `pnpm audit` (Node) + `pip-audit` / OSV-Scanner (Python) on frozen lockfiles |
| Slopsquatting Defense | Dependency admission script in CI verifying package registry, age, and provenance |


| Component | Decision |
|---|---|
| Report Pipeline | Hybrid: Deterministic scores/charts + Constrained Gemini 3.8 Flash synthesis |
| Synthesis Engine | Python FastAPI with Pydantic JSON schema & mandatory evidence cross-references |
| Fallback Strategy | Instant deterministic template report if Gemini API is unavailable |
| Report Storage | Dedicated immutable `reports` collection in MongoDB |
| Queue / Worker | BullMQ/Redis `generate-report` async queue |
| Frontend UI | Interactive React Dashboard (Recharts + Tailwind + Read-only Monaco `<DiffEditor />`) |
| PDF Export | Client-side `@react-pdf/renderer` / CSS print styles (zero server RAM overhead) |
| Public Sharing | Cryptographic share token endpoint (`/report/shared/:shareToken`) |


| Component | Decision |
|---|---|
| Evaluation Execution | Dedicated Ephemeral Evaluation Orchestrator + Isolated Test Controller |
| Security/Isolation | Read-only candidate snapshot mount, `--network none`, strict cgroup limits |
| Scoring Model | 60% Functional Correctness (48 pts defects + 12 pts regressions) |
| Code Quality Pillar | 20% (8 pts static/types + 8 pts maintainability + 4 pts architecture) |
| Trajectory Pillar | 20% (8 pts verification + 6 pts AI efficiency + 6 pts iterative debugging) |
| Pipeline Orchestration | BullMQ + Redis persistent queue with MongoDB transactional outbox |
| Worker Model | Independent evaluation workers + HTTP 202 async response |
| Resilience & Retries | Max 2 retries with backoff for infra glitches; dead-letter on exhaust |
| Notification Delivery | Authenticated WebSocket events (`evaluation_completed`) + REST fallback |


| Component | Decision |
|---|---|
| Candidate Graph Generation | Offline in Challenge CI (Stage 5) via Tree-sitter AST extraction |
| Candidate Artifact Format | Native `graphify-out/graph.json` + SHA-256 in Object Storage (S3/MinIO) |
| Query Engine | In-process Python FastAPI engine (NetworkX directed graph adapter, <2ms queries) |
| Context Strategy | Deterministic 1-2 degree traversal + live workspace source snippets (10-30 LOC) |
| Inference Pattern | Single-pass guarded Gemini 3.8 Flash inference with token-budgeted context package |
| Platform Monorepo Tooling | `pnpm run graphify:platform` generating `platform-graph.json` + `PLATFORM_GRAPH.md` |
| Internal Agent Integration | Local Graphify MCP server (stdio) + Graphify Agent Skill (progressive disclosure) |
| Boundary Isolation | Complete physical and logical separation between candidate and platform graphs |


| Component | Decision |
|---|---|
| AI Assistant Model | Google Gemini 3.8 Flash (`gemini-3.8-flash`) exclusively |
| Interaction Mode | Ask Mode (Conceptual guidance, error explanation, scoped hints, zero auto-coding) |
| Architecture | Dual-Layer: Express Control Plane (auth/budget) → Python FastAPI (orchestration/Graphify) |
| Context Retrieval | Assessment-scoped snippets via Workspace Context API + Graphify code graph |
| Streaming | Server-Sent Events (SSE) relayed through Express gateway |
| Guardrails | Context isolation (zero solution/test access) + Socratic persona + 7-LOC cap + output validator |
| Telemetry Store | MongoDB `ai_interactions`, `workspace_events`, `execution_events` |
| Evaluation Framework | Independent Output Evaluation (tests) + Trajectory Evaluation (AI efficiency) |


| Component | Decision |
|---|---|
| Code Editor | Monaco Editor (`@monaco-editor/react`) with virtual URIs & TS language services |
| Diff Viewer | Monaco `<DiffEditor />` (side-by-side starter vs current workspace) |
| Layout System | Dockview React (`dockview-react`) with 8 dockable panels + fixed header |
| Client State | Zustand (domain-specific stores with selector subscriptions) |
| Server State | TanStack Query v5 (scoped query keys, cache invalidation) |
| High-Frequency Handlers | Direct xterm.js stream, Monaco internal buffers, batched AI token store, local timer tick |
| Styling Framework | Tailwind CSS v4 (CSS-first, `@theme`, zero runtime CSS-in-JS) |
| Component Primitives | shadcn/ui + Radix UI primitives (`apps/web/src/components/ui/`) |
| Icon Library | Lucide React (`lucide-react`) |
| Theme Architecture | Dark-mode-first semantic CSS variables shared across Monaco, xterm, and Dockview |


