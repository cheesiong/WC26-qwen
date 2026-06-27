## Overview

This repository uses **npm** as its dependency management system for both the backend (Node.js/Express) and frontend (React/Vite) modules. Each module maintains its own independent `package.json` and `package-lock.json`, following a monorepo-like structure without a workspace orchestrator.

## System and Approach

### Package Manager: npm
- Both `backend/` and `frontend/` use npm exclusively (no yarn, pnpm, or other package managers detected).
- Lockfile version is **lockfileVersion 3**, indicating npm v7+ compatibility.
- All dependencies resolve from the public npm registry (`https://registry.npmjs.org/`).

### Version Pinning Strategy
- Dependencies in `package.json` use **caret ranges** (`^`) for minor/patch updates (e.g., `"express": "^4.19.2"`, `"react": "^18.3.1"`).
- Exact versions are locked in `package-lock.json`, ensuring reproducible builds across environments.
- No pinned exact versions (`x.y.z` without `^` or `~`) found in manifest files — relies on lockfiles for determinism.

### Installation in CI/CD and Containers
- **Backend Dockerfile**: Uses `npm ci --omit=dev` for production installs, skipping devDependencies to reduce image size.
- **Frontend Dockerfile**: Uses `npm ci` (full install including devDependencies) during the build stage, since tools like Vite and Vitest are needed at build time.
- `npm ci` is preferred over `npm install` because it:
  - Requires an existing `package-lock.json` (fails if missing or mismatched).
  - Installs exact versions from the lockfile.
  - Is faster and more deterministic for automated environments.

## Key Files

| File | Purpose |
|------|---------|
| `backend/package.json` | Backend dependency declarations (Express, SQLite, Axios, Cheerio, etc.) |
| `backend/package-lock.json` | Locked dependency tree for backend (~2,689 lines) |
| `frontend/package.json` | Frontend dependency declarations (React, Vite, Tailwind, Recharts, etc.) |
| `frontend/package-lock.json` | Locked dependency tree for frontend (~9,765 lines) |
| `backend/Dockerfile` | Defines `npm ci --omit=dev` for production backend image |
| `frontend/Dockerfile` | Multi-stage build using `npm ci` for full dependency install |
| `docker-compose.yml` | Orchestrates backend and frontend services with shared volumes |

## Architecture and Conventions

### Separate Dependency Trees
- Backend and frontend maintain **completely independent** dependency trees.
- No shared workspace configuration (no `workspaces` field in root `package.json`, no lerna/nx/turborepo).
- Common dependencies (e.g., `axios`, `eslint`, `prettier`) are duplicated across both modules rather than hoisted.

### Dev vs Production Separation
- **Backend devDependencies**: ESLint, Prettier, Nodemon — tooling only needed during development.
- **Frontend devDependencies**: Vite, Vitest, Testing Library, Tailwind, PostCSS — build-time and test-time tooling.
- Production Docker images for backend explicitly exclude devDependencies via `--omit=dev`.

### No Private Registries or Vendoring
- All packages resolve from the public npm registry.
- No `.npmrc` files detected for custom registry configuration.
- No vendor directories or offline package caching strategies.
- No GOPRIVATE or private registry authentication configured.

### Dependency Update Workflow
- No automated dependency update tooling detected (no Dependabot, Renovate, or Greenkeeper configuration).
- Updates require manual `npm update` followed by committing the updated `package-lock.json`.
- The `package-lock.json` files are committed to version control, ensuring team-wide consistency.

## Rules for Developers

1. **Always commit `package-lock.json`**: Never ignore lockfiles. They ensure deterministic builds across machines and CI/CD pipelines.

2. **Use `npm ci` in automated environments**: For Docker builds, CI pipelines, or fresh checkouts, always use `npm ci` instead of `npm install` to guarantee lockfile fidelity.

3. **Use `npm install` for adding/updating dependencies**: When adding a new package, run `npm install <pkg>` to update both `package.json` and `package-lock.json` atomically.

4. **Do not manually edit `package-lock.json`**: Let npm manage the lockfile. Manual edits can cause integrity check failures.

5. **Keep backend and frontend dependencies separate**: Do not attempt to share or hoist dependencies between modules. Each module is independently deployable.

6. **Verify lockfile integrity after merges**: If merge conflicts occur in `package-lock.json`, delete it and regenerate with `npm install` to avoid corruption.

7. **Production builds omit devDependencies**: The backend Docker image uses `--omit=dev`. Ensure no runtime code accidentally depends on a devDependency.

8. **No custom registries**: All packages must be available on the public npm registry. Do not introduce private or scoped packages requiring authentication unless `.npmrc` configuration is added.