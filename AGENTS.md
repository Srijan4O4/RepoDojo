# RepoDojo — Agent Operating Instructions & Harness Constraints

> **Tagline:** Train on real codebases. Prepare for real engineering.  
> **Workspace Root:** `D:\RepoDojo` (Strictly enforced)  
> **Primary Methodology:** The New SDLC With Vibe Coding — From Ad-hoc Prompting to Agentic Engineering (Osmani, Saboo, Kartakis — Google, May 2026).

---

## 1. Core Principles for AI Agents

1. **Structure Over Uncontrolled Prompting:** Follow the Factory Model: Specification → Planning → Implementation → Automated Verification → Review. Never write code without verifiable acceptance criteria.
2. **Verification Is Mandatory:** Every meaningful feature or fix must have deterministic tests (Vitest for frontend, Jest for backend, pytest for Python). An implementation is not done because it compiles or seems to work.
3. **The 80% Problem Awareness:** Be intensely skeptical of code that "looks right." Scrutinize edge cases, error handling, off-by-one errors, database indexes, and network timeout handling.
4. **Harness Integrity (`Agent = Model + Harness`):** Follow established tool contracts, directory structures, and git conventions. Never bypass permission checks, mock out security filters, or disable tests.
5. **D-Drive Compliance:** All repository operations, virtual environments (`apps/ai-service/.venv`), local caches, and temporary artifacts must live under `D:\RepoDojo`. Never write project code or virtual environments to `C:\`.

---

## 2. Monorepo Structure

```
D:\RepoDojo/
├── apps/
│   ├── web/          # React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui
│   ├── api/          # Express 5 + TypeScript (modular feature-based modules)
│   └── ai-service/   # Python 3.12+ + FastAPI + uv + Google Gen AI SDK
├── packages/
│   └── shared/       # Shared TypeScript types, schemas, and API contracts
├── docs/             # Architecture documentation, ADRs, specifications
│   └── adr/          # Architecture Decision Records (ADR-001-all-domains-master.md)
├── infra/            # Docker Compose (dev/prod), Terraform, Cloud-Init, Caddy
├── scripts/          # Automation, verification, backup, and restore drills
├── .agent/           # Reusable Agent Skills, prompts, and evaluation datasets
├── graphify/         # Platform & Challenge Graphify configs and artifacts
├── evaluation/       # Hidden evaluation test suites, test datasets, rubrics
└── tools/            # Monorepo build and linting tooling
```

---

## 3. Technology Stack & Tool Commands

| Domain | Technology | Commands |
|---|---|---|
| Package Manager | `pnpm` (workspaces) | `pnpm install`, `pnpm add <pkg> --filter <workspace>` |
| Build System | `turbo` | `pnpm run dev`, `pnpm run build`, `pnpm run test`, `pnpm run lint` |
| Python Environment | `uv` | `cd apps/ai-service && uv sync`, `uv run pytest`, `uv run ruff check` |
| Formatting & Lint | Prettier + ESLint v9 (flat config) + Ruff | `pnpm run format`, `pnpm run lint` |
| Local Databases | Docker Compose | `pnpm run infra:up`, `pnpm run infra:down` |
| Codebase Intelligence | Graphify | `pnpm run graphify:platform` |

---

## 4. Guardrails & Prohibited Actions

- **NEVER** commit API keys, secrets, or `.env` files (enforced by Gitleaks and pre-commit hooks).
- **NEVER** introduce unverified or hallucinated npm / PyPI packages ("slopsquatting"). Every dependency must be from official registries with legitimate provenance.
- **NEVER** use mutable `latest` Docker tags in production configurations. Pin exact image digests or semantic Git SHA tags.
- **NEVER** execute untrusted candidate code outside isolated Docker containers.
- **NEVER** expose the clean `solution` branch code or hidden evaluation tests to candidate-facing environments or the candidate AI assistant.

---

## 5. Architectural Reference

Before making architectural modifications, consult the master architecture decision record:
[ADR-001-all-domains-master.md](file:///D:/RepoDojo/docs/adr/ADR-001-all-domains-master.md)
