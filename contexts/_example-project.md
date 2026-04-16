---
name: example-project
description: Example project context — copy and adapt for your own project
tags: [project, example]
---

# Example Project

This is a template. Copy this file and adapt it for your project.

## Projects

### MyApp (frontend)
- Path: C:/repos/my-app
- Source: src/
- Tech: React 18, TypeScript, Vite, Zustand
- Description: Single-page application for task management

### MyAPI (backend)
- Path: C:/repos/my-api
- Source: src/
- Tech: ASP.NET Core 8, Entity Framework, SQL Server
- Description: REST API serving the frontend

### Relationship
MyApp calls MyAPI via REST. Auth via Azure AD B2C tokens.

## Dev Environment

Prerequisites:
- Node.js >= 20
- .NET 8 SDK
- SQL Server (local or Docker)

Setup:
1. `cd my-app && npm install`
2. `cd my-api && dotnet restore`
3. `docker compose up -d` (starts SQL Server)
4. `dotnet ef database update` (apply migrations)

## Build & Test

| Scope | Command | Notes |
|-------|---------|-------|
| Frontend build | `npm run build` | |
| Frontend test | `npm test` | Jest + React Testing Library |
| Backend build | `dotnet build` | |
| Backend test | `dotnet test` | xUnit |

## Architecture

Overview: React SPA → ASP.NET Core API → SQL Server

Key decisions:
- Zustand for state management (simpler than Redux for this scale)
- EF Core code-first migrations
- Azure AD B2C for auth

## Conventions

- Branch naming: `u/{alias}/feature-name`
- PR: 2 approvers, squash merge
- All user-facing text uses i18n
- New components use Fluent UI v9

## Known Issues

- `npm install` fails behind VPN on first run — retry once
- EF migrations must be applied manually in local dev (no auto-migrate)
