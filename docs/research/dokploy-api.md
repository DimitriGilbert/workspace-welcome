# Research: Dokploy API (plus a Coolify survey) — showing deployments per project in the dashboard

Date: 2026-09-03. Question: for workspace-welcome's plan (register Dokploy
instances, link a local project to an app on an instance, display deployment
data per project — with possible Coolify support later) — how do the Dokploy and
Coolify APIs actually work, and what should a provider-agnostic client cover?

All claims were checked against primary sources on 2026-09-03: the official docs
(docs.dokploy.com, coolify.io), and the source of both repos on GitHub
(`Dokploy/dokploy` `canary` @ v0.30.5; `coollabsio/coolify` `main`). Response
shapes below are read from the drizzle schema files because **the OpenAPI spec
ships empty `200` schemas** (`{"type":"object","properties":{}}` for every
endpoint — verified in the committed
[openapi.json](https://github.com/Dokploy/dokploy/blob/canary/openapi.json) and
visible as "loading..." placeholders on docs.dokploy.com), so the DB schema +
router source is the only field-level source of truth. File:line references are
from the sources as served that day.

## TL;DR

**Dokploy's API is enough to power every dashboard feature we sketched, with
these concrete choices.**

1. **Auth is a plain `x-api-key` header against `https://<instance>/api`** —
   generated in the dashboard (Settings → API), scoped to one organization,
   optional expiry, shown once ([docs][dp-api], [generator][dp-gen], [auth
   source][dp-authsrc]). Not `Authorization: Bearer`, not `x-auth-api-key`.
   Store the key in our local JSON store per registered instance; send
   everything server-side.
2. **Calls must be made from our tRPC backend, never the browser**: the API is
   Next.js API routes with **no CORS headers at all** (`next.config.mjs` sets
   only security headers, no `Access-Control-Allow-*`
   ([next.config.mjs][dp-nextcfg])) — a cross-origin call from
   `localhost:37420` will fail. Bonus: a server-side client also dodges
   self-signed-cert problems (Node-side `undici` dispatcher per instance) which
   we could never fix in a browser.
3. **The hierarchy is organization → project → environment → services**
   (`applications`, `compose`, plus 6 database types). `GET /api/project.all`
   returns the whole tree in one call with `applicationId`, `name`,
   `applicationStatus` per app and `composeId`, `name`, `composeStatus` per
   compose service ([project router][dp-projrouter], [project schema][dp-projschema],
   [environment schema][dp-envschema]). That single call powers instance-wide
   registration + the link picker.
4. **There is no `application.status` endpoint** (the OpenAPI spec has 31
   `application.*` paths; none is `status` — [openapi.json][dp-openapi]). Status
   comes back as the `applicationStatus` **field** (`idle | running | done |
   error`) on `application.one` / `project.all` — and note it is a
   **build/deploy lifecycle flag**, not container health: the router sets
   `idle` when a deploy starts, `running` while building, `done`/`error` at the
   end ([application router][dp-approuter]). For "is it actually up" use
   `GET /api/docker.getContainersByAppNameMatch?appName=…` (live Docker
   container state) or `GET /api/application.readAppMonitoring?appName=…`
   (returns `null` when the container isn't running — [source][dp-appsvc]).
5. **Deploys: `POST /api/application.deploy` /
   `POST /api/application.redeploy`** with `{ applicationId, title?,
   description? }` — **no commit-hash / force parameter exists**; it queues a
   BullMQ job and returns immediately (async) ([deploy handler][dp-approuter],
   [input schema][dp-appschema]). Follow it by polling
   `GET /api/deployment.all?applicationId=…` (ordered `createdAt desc` —
   [service][dp-depsvc]) and reading build output via
   `GET /api/deployment.readLogs?deploymentId=…&tail=…`.
6. **Deployment history fields**: `status: running|done|error|cancelled`,
   `title`, `description`, `errorMessage`, `logPath`, `createdAt`,
   `startedAt`, `finishedAt` — **there is no commit hash / commit message /
   branch on a Dokploy deployment record** ([deployment schema][dp-depschema]).
   For "what commit is live", match a deployment's timestamp against the local
   repo's log, or show the app's configured `repository`/`owner`/`branch`.
7. **Auto-linking local repos works well**: every git-sourced app carries
   `sourceType` + per-provider fields — GitHub: `owner`, `repository`, `branch`;
   custom git: `customGitUrl`, `customGitBranch`; plus `gitlab*`/`bitbucket*`/
   `gitea*` variants; Docker-source apps only have `dockerImage`/`registryUrl`;
   compose services mirror the same fields ([application schema][dp-appschema],
   [compose schema][dp-composeschema]). Even better,
   `GET /api/application.search?repository=…&owner=…` is a server-side matcher
   with `limit`/`offset` returning `{ items, total }`
   ([application router][dp-approuter]).
8. **Coolify diverges in shape but not in capability** — Bearer token
   (`Authorization: Bearer <token>`, `https://<host>/api/v1`), RESTful paths
   (`/applications`, `/deployments/applications/{uuid}`, `POST /deploy`),
   snake_case fields, deployments *do* carry `commit`/`commit_message`
   ([auth docs][cf-auth], [openapi.json][cf-openapi]). A thin provider
   interface of ~8 operations covers both; see "Provider interface
   implications".
9. **Pin the integration loosely, not per-version**: Dokploy releases weekly
   (v0.30.0 → v0.30.5 between Aug 14 and Sep 2, 2026 — [releases][dp-rel]) and
   the REST surface is auto-generated from internal tRPC routers
   ([generator][dp-gen]), so paths/fields can change with any release. Build
   against a minimum Dokploy version, read the instance's own spec from its
   `/swagger` UI when debugging, and tolerate unknown fields.

---

## 1. Authentication (Dokploy)

| Question | Answer | Source |
|---|---|---|
| Header | `x-api-key: <key>` — OpenAPI `securitySchemes.apiKey`, `in: header`, `name: x-api-key` | [docs.dokploy.com/docs/api][dp-api], [generate-openapi.ts L88-93][dp-gen] |
| Where created | Dashboard → Settings → API → "Generate API Key" dialog (name, optional expiration, organization selector); "Please copy your API key now. You won't be able to see it again!" The docs page still points at the older `/settings/profile` → "API/CLI Section" flow | [add-api-key.tsx][dp-apikey], [docs][dp-api] |
| Scoping | Each key stores `metadata.organizationId`; verification resolves the member + organization and builds a session with `activeOrganizationId` = that org. All routers filter by it. Keys are therefore **org-scoped**; a multi-org user needs one key per org | [auth.ts L511-580][dp-authsrc] |
| Expiry | Optional — the dialog exposes `expiresIn` (`expiresIn: values.expiresIn \|\| undefined`); verification uses better-auth's `@better-auth/api-key` `verifyApiKey`, which enforces expiry | [add-api-key.tsx L41,124][dp-apikey], [auth.ts L442-445,515][dp-authsrc] |
| Who may call | By default only admins/owners; regular members need "Generate access tokens" granted by an admin | [docs][dp-api] |
| JWT vs API key | The docs describe JWT tokens from the profile page (used by the CLI); the REST/OpenAPI endpoints validate a **session cookie or `x-api-key`** and return `401 {"message":"Unauthorized"}` otherwise. No `Authorization: Bearer` handling exists for the REST API | [docs][dp-api], [auth.ts validateRequest][dp-authsrc], [[...trpc].ts][dp-handler] |
| Swagger UI | `<host>:3000/swagger` (admins only) — serves the instance's own generated spec; handy for debugging a specific instance | [docs][dp-api], [swagger.tsx][dp-swagger] |

Base URL: "the OpenApi base url is http://localhost:3000/api … replace with the
ip of your dokploy instance or the domain name" ([docs][dp-api]) — i.e.
**`https://<host>/api/<router>.<procedure>`**. Default port 3000
([server.ts][dp-server]).

## 2. API shape and conventions

- The REST surface is **generated from the internal tRPC appRouter** by
  `@dokploy/trpc-openapi` and served by a Next.js catch-all handler at
  `pages/api/[...trpc].ts` → `createOpenApiNextHandler({ router: appRouter, … })`
  ([generator][dp-gen], [handler][dp-handler]). Consequences:
  - **Path = `/api/<router>.<procedure>`** (e.g. `/api/project.all`,
    `/api/application.deploy`); tRPC `query` → **GET** (input as query
    params), `mutation` → **POST** (JSON body). 554 paths total as of
    v0.30.5 ([openapi.json][dp-openapi]).
  - It is **not versioned** — no `/v1`, no deprecation headers; the spec is
    regenerated from the routers on every release ([sync workflow][dp-syncwf]).
  - Body caps: JSON 10 MB, uploads 1 GB (env-overridable
    `OPENAPI_MAX_JSON_BODY_SIZE` / `OPENAPI_MAX_UPLOAD_SIZE`)
    ([handler][dp-handler], [constants][dp-constants]).
- **Error shape** (uniform, from the generator's components):
  `{ "code": "BAD_REQUEST"|"UNAUTHORIZED"|"FORBIDDEN"|"NOT_FOUND"|"INTERNAL_SERVER_ERROR", "message": "…", "issues": [] }`
  with HTTP 400/401/403/404/500 ([reference-server][dp-refserver],
  [openapi.json components][dp-openapi]). Note the pre-handler auth rejection
  is a different shape: `401 {"message":"Unauthorized"}` ([handler][dp-handler]).
- **Pagination: mostly none.** List endpoints (`project.all`, `server.all`,
  `deployment.all`, `domain.byApplicationId`) take no paging params. The
  exceptions are the `search` endpoints: `application.search` /
  `project.search` take `limit` (default 20, max 100) + `offset` and return
  `{ items, total }` ([application router L1095-1225][dp-approuter],
  [project router L688+][dp-projrouter]).
- **No rate limiting** is implemented or documented server-side (the handler
  chain has none — [handler][dp-handler]; the docs page mentions none —
  [docs][dp-api]). Contrast with Coolify's documented 200 req/min.

## 3. Endpoint inventory for our use case

Method/path as generated for v0.30.5; "verified" = where the behavior/shape was
read. Full spec: [openapi.json][dp-openapi].

### 3.1 Projects, environments, applications

| Method + path | Purpose | Verified |
|---|---|---|
| `GET /api/project.all` | All projects of the active org with nested `environments[]` → `applications[]` / `compose[]` / db services (see shape below) | [project.ts L223-403][dp-projrouter] |
| `GET /api/project.one?projectId=…` | One project, full service objects per environment | [project.ts L111-222][dp-projrouter] |
| `POST /api/project.create` | `{ name, description?, env? }` | [docs reference-project][dp-refproject] |
| `GET /api/environment.byProjectId?projectId=…` | Environments of a project | [environment router][dp-envrouter] |
| `GET /api/application.one?applicationId=…` | Full application record (+ `hasGitProviderAccess`, `unauthorizedProvider`) | [application.ts L255-306][dp-approuter] |
| `GET /api/application.search?q&repository&owner&projectId&environmentId&limit&offset` | Filter apps by repo/owner/name/… → `{ items, total }` | [application.ts L1095-1225][dp-approuter] |
| `POST /api/application.start` / `POST /api/application.stop` | Start/stop the container (sets status `done`/`idle`) | [application.ts L402-445][dp-approuter] |
| `POST /api/application.move` | Move app to another project/environment | [application.ts L1009+][dp-approuter] |

### 3.2 Status

There is **no `application.status` endpoint**. Three layers of status:

| Layer | Where | Values | Source |
|---|---|---|---|
| Build/deploy lifecycle flag | `applicationStatus` field on every application row (returned by `application.one`, embedded in `project.all`/`project.one`) | `idle` \| `running` \| `done` \| `error` (`running` = **build in progress**) | [shared.ts L4-9][dp-shared], [application.ts (setters at L317-328, L414-436, L751)][dp-approuter] |
| Live containers | `GET /api/docker.getContainersByAppNameMatch?appName=…` (+`getContainersByAppLabel`, `getContainers`) | Docker `ContainerState` (`running`, `exited:…`, health) | [docker router (12 paths)][dp-openapi], [input][dp-openapi] |
| CPU/RAM stats | `GET /api/application.readAppMonitoring?appName=…` — returns `null` if the container isn't running; separate `GET /api/server.getServerMetrics?url&token&dataPoints` for host metrics | docker stats | [application.ts L996-1008][dp-approuter], [application service L613-633][dp-appsvc], [reference-server][dp-refserver] |

### 3.3 Deployments (history) and logs

| Method + path | Purpose | Verified |
|---|---|---|
| `GET /api/deployment.all?applicationId=…` | Deployment history for an app, newest first (`createdAt desc`) | [deployment.ts L38-45][dp-deprouter], [deployment service L798-806][dp-depsvc] |
| `GET /api/deployment.allByCompose?composeId=…` | Same for compose services | [deployment.ts L47-54][dp-deprouter] |
| `GET /api/deployment.allCentralized` | Recent deployments across the whole org (dashboard-wide feed!) | [deployment.ts L67-79][dp-deprouter] |
| `GET /api/deployment.readLogs?deploymentId=…&tail=100` | **Build log** — `tail -n <tail>` of the deployment's `logPath` on the target server; `tail` ≤ 10000 | [deployment.ts L238-283][dp-deprouter] |
| `GET /api/application.readLogs?applicationId=…&tail=100&since=all\|<n>s\|m\|h\|d&search=…` | **Runtime log** — `docker logs` of the app container with grep | [application.ts L1227-1260][dp-approuter] |
| `GET /api/compose.readLogs` | Runtime logs for compose services | [compose.ts L1220][dp-composerouter] |

**Deployment record** (every field of the row — [deployment schema][dp-depschema]):

```json
{
  "deploymentId": "…",
  "title": "Manual deployment",
  "description": "",
  "status": "running",              // running | done | error | cancelled
  "logPath": "/etc/dokploy/logs/…",
  "pid": "1234",                    // present while building
  "applicationId": "…", "composeId": null, "serverId": null,
  "isPreviewDeployment": false,
  "createdAt": "2026-09-03T10:00:00.000Z",
  "startedAt": "…", "finishedAt": null,
  "errorMessage": null
}
```

No commit hash, no commit message, no branch, no git author — see §5 for what
that means for the UI.

**Live streaming** exists but is UI-session-only: the server mounts WebSocket
endpoints on the same port — `/listen-deployment` (build logs),
`/docker-container-logs`, `/drawer-logs`, `/listen-docker-stats-monitoring`,
`/terminal` — and authorizes them with the **browser session cookie**, not API
keys ([server.ts L36-42][dp-server], [authorize.ts][dp-wssauth]). Our backend
cannot reuse them with a key; polling the two readLogs endpoints is the API-key
path.

### 3.4 Deploy / redeploy

| Method + path | Body | Behavior | Source |
|---|---|---|---|
| `POST /api/application.deploy` | `{ applicationId, title?, description? }` | Enqueues a BullMQ job (`type: "deploy"`, "Manual deployment" default title); returns when queued — **async** | [application.ts L814-856][dp-approuter] |
| `POST /api/application.redeploy` | same | Same with `type: "redeploy"` ("Rebuild deployment") | [application.ts L446-489][dp-approuter] |
| `POST /api/application.cancelDeployment` | `{ applicationId }` — **Cloud-only**; self-hosted answers `400 "Deployment cancellation only available in cloud version"`. Self-hosted cancellation = `POST /api/deployment.killProcess` `{ deploymentId }` (kills the build PID, status → `error`) | [application.ts L1045-1093][dp-approuter], [deployment.ts L162-205][dp-deprouter] |
| `POST /api/application.reload` | `{ applicationId, appName }` | Recreate container without rebuild | [application.ts L308-336][dp-approuter] |
| `POST /api/compose.deploy` / `POST /api/compose.redeploy` | `{ composeId, title?, description? }` | Compose equivalents | [compose.ts L415-514][dp-composerouter] |

**No commit hash / force flag**: the input schema is literally
`{ applicationId, title?, description? }` ([apiDeployApplication /
apiRedeployApplication][dp-appschema]) — deploys always build the branch head.
There is a rollback system (`POST /api/rollback.rollback`) to return to a
previous image. Follow-up: poll `deployment.all`; the new row's `status`
goes `running → done|error`; `finishedAt`/`errorMessage` get set.

### 3.5 Domains

| Method + path | Purpose | Verified |
|---|---|---|
| `GET /api/domain.byApplicationId?applicationId=…` | Domains of an app | [domain.ts L68-75][dp-domrouter] |
| `GET /api/domain.byComposeId?composeId=…` | Domains of a compose service | [domain.ts L76-83][dp-domrouter] |
| `POST /api/domain.create` / `update` / `delete` | Manage domains (Traefik config is updated server-side) | [domain.ts L36-246][dp-domrouter] |

**Domain record** ([domain schema][dp-domschema]):

```json
{
  "domainId": "…",
  "host": "app.example.com",
  "path": "/",
  "port": 3000,
  "https": true,
  "certificateType": "letsencrypt",   // letsencrypt | none | custom
  "customCertResolver": null,
  "domainType": "application",        // application | compose | preview
  "serviceName": null,                 // for compose domains
  "internalPath": "/", "stripPath": false,
  "uniqueConfigKey": 1,
  "enabled": true,
  "createdAt": "2026-09-03T…"
}
```

### 3.6 Compose-type services

Compose services are a sibling of applications under an environment, not a
flavor of them: separate table + router, `composeId`, `appName` prefixed
`compose-…`, `composeStatus` reusing the same `idle|running|done|error` enum,
`sourceType: git|github|gitlab|bitbucket|gitea|raw`, `composeType:
docker-compose|stack`, `composeFile`/`composePath`, `isolatedDeployment`
([compose schema][dp-composeschema]). Endpoints mirror applications:
`compose.one`, `compose.deploy/redeploy/start/stop`, `compose.loadServices`
(parses the services inside the compose file), `compose.readLogs`,
`deployment.allByCompose`, `domain.byComposeId`
([compose router][dp-composerouter], [openapi.json][dp-openapi]). Any
dashboard feature that lists "apps" must decide whether compose services
appear alongside; our provider interface should treat them as a second
service kind from day one (Coolify instead splits these into
`/services` + `/databases` + `/applications`).

### 3.7 Monitoring / metrics

- App container stats: `application.readAppMonitoring` (above).
- Host metrics: `server.setupMonitoring` configures a metrics collector per
  server (`refreshRate`, `retentionDays`, `thresholds`), read back via
  `server.getServerMetrics?url&token&dataPoints`
  ([reference-server][dp-refserver]).
- Docker disk usage: `docker-disk-usage` router; raw container ops (start/
  stop/restart/remove/kill/uploadFileToContainer) under `docker.*`
  ([openapi.json][dp-openapi]). Nothing here is required for v1 of the
  dashboard, but `getContainersByAppNameMatch` is the pragmatic "is it
  serving" check.

## 4. Load-bearing response shapes

`GET /api/project.all` (owner/admin branch; members get the same tree filtered
by their grants — [project.ts L223-403][dp-projrouter]):

```json
[
  {
    "projectId": "…", "name": "my-project", "description": null,
    "createdAt": "2026-09-03T…", "organizationId": "…",
    "environments": [
      {
        "name": "production", "environmentId": "…", "isDefault": true,
        "applications": [
          { "applicationId": "…", "name": "web", "applicationStatus": "done" }
        ],
        "compose": [
          { "composeId": "…", "name": "stack", "composeStatus": "idle" }
        ],
        "postgres": [{ "postgresId": "…" }], "mysql": […], "mariadb": […],
        "mongo": […], "redis": […], "libsql": […]
      }
    ],
    "projectTags": []
  }
]
```

`GET /api/application.one` — the full application record plus two computed
fields (excerpt below: identity/source fields only; the row also carries
preview-deployment, swarm and resource-limit columns — every name shown is a
real column, [application schema][dp-appschema]):

```json
{
  "applicationId": "…", "name": "web", "appName": "app-abc123",
  "description": null,
  "sourceType": "github",             // docker|git|github|gitlab|bitbucket|gitea|drop
  "buildType": "nixpacks",            // dockerfile|heroku_buildpacks|paketo_buildpacks|nixpacks|static|railpack
  "applicationStatus": "done",
  "repository": "workspace-welcome", "owner": "didi", "branch": "main",
  "buildPath": "/", "triggerType": "push", "autoDeploy": true,
  "customGitUrl": null, "customGitBranch": null, "customGitBuildPath": null,
  "gitlabProjectId": null, "gitlabRepository": null, "gitlabOwner": null, "gitlabBranch": null,
  "bitbucketRepository": null, "bitbucketOwner": null, "bitbucketBranch": null,
  "giteaRepository": null, "giteaOwner": null, "giteaBranch": null,
  "dockerImage": null, "registryUrl": null, "username": null,
  "dockerfile": "Dockerfile", "dockerContextPath": null, "dockerBuildStage": null,
  "icon": null, "createdAt": "2026-09-03T…",
  "environmentId": "…", "serverId": null,
  "hasGitProviderAccess": true, "unauthorizedProvider": null
}
```

Note: **no `updatedAt`** on applications/projects/domains (only `createdAt`).

## 5. Auto-linking signal (Dokploy)

For a local repo with remote `git@github.com:didi/workspace-welcome.git`:

| App sourceType | Matching fields | Notes |
|---|---|---|
| `github` | `owner` + `repository` (+ `branch`) | cleanest signal; exact GitHub owner/name |
| `git` | `customGitUrl` (full URL) + `customGitBranch` | parseable as any git remote |
| `gitlab`/`bitbucket`/`gitea` | `<provider>Owner` + `<provider>Repository` (+ branch); gitlab adds `gitlabProjectId`/`gitlabPathNamespace` | same pattern per provider |
| `docker` | `dockerImage`, `registryUrl` | no git signal; match on image name at best |
| `drop` (zip upload) | none | name-only fallback |

Compose services expose the same git/docker fields ([compose
schema][dp-composeschema]). `application.search` accepts `repository` and
`owner` as server-side filters, so a scan can propose links without pulling
every app — but `project.all` already returns every app's identity fields when
we register an instance, so matching client-side in the api package is simpler.
Deployment records add nothing for linking (no commit fields), so "which commit
is deployed" cannot be answered from the API alone — we can either parse the
build log fetched via `deployment.readLogs` (fragile) or show
`branch` + deployment timestamps and let the user correlate with the local
repo's history.

## 6. Coolify survey (for the provider abstraction)

Auth and mechanics ([Coolify authorization docs][cf-auth], [spec][cf-openapi]):

- **Header**: `Authorization: Bearer <token>`. Token created under **Security →
  API Tokens** (or Keys & Tokens in older builds), shown once, stored as
  SHA-256 hash, optional expiry (7/30/60/90 days, 1 year, or none).
- **Permissions are discrete**: `read`, `read:sensitive` (secrets/envs/logs),
  `write`, `deploy`, `root` — missing ones → 403. A trigger-deploy token needs
  `deploy`; we'd want `read` + `deploy`.
- **Team-scoped**: a token only sees the team active at creation; multi-team
  users need one token per team.
- **The API can be disabled**: Settings → Advanced → API Settings → API Access
  must be on (or `POST /api/v1/enable`, needs `root`); optional IP allowlist.
- **Rate limit**: 200 req/min default (`API_RATE_LIMIT` env), 429 on excess.
- **Base**: `https://<host>/api/v1`; health is `GET /api/health` (outside
  `/v1`), plain `OK`.

Equivalent operations (paths from [openapi.json][cf-openapi]; field names from
its `Application` / `ApplicationDeploymentQueue` schemas):

| Operation | Coolify | Response highlights |
|---|---|---|
| List apps | `GET /applications` | array of full `Application` objects |
| Get app | `GET /applications/{uuid}` | `Application`: `uuid`, `name`, `fqdn` (comma-separated domains), `git_repository`, `git_branch`, `git_commit_sha`, `git_full_url`, `docker_registry_image_name`, `build_pack`, `status`, `created_at`, `updated_at`, `environment_id`, … |
| Status | `status` field on the app object | string like `running:healthy`, `exited:unhealthy` — `status:health` composed server-side ([Application.php L866-885][cf-appmodel]); no separate endpoint |
| Project hierarchy | `GET /projects`, `GET /projects/{uuid}/{environment_name_or_uuid}` | project → environments; resources fetched per environment (no single tree call like Dokploy's `project.all`) |
| Deployments | `GET /deployments` (currently running), `GET /deployments/applications/{uuid}?skip&take` (history, real pagination), `GET /deployments/{uuid}` | `ApplicationDeploymentQueue`: `deployment_uuid`, `status`, `commit`, `commit_message`, `force_rebuild`, `logs`, `created_at`, `updated_at`, `application_name`, `deployment_url` |
| Trigger deploy | `POST /deploy?uuid=…|tag=…&force=…&pr=…&docker_tag=…` | `{ deployments: [{ deployment_uuid, resource_uuid, message }] }` — async; follow via `GET /deployments/{uuid}`. Unlike Dokploy it **does** accept a force flag and PR id (still no arbitrary commit) |
| Restart/start/stop | `POST /applications/{uuid}/restart|start|stop` | — |
| Domains | no per-app endpoint — `fqdn` field on the app (comma-separated), plus `GET /servers/{uuid}/domains` | per-app TLS config lives inside the app object |
| Logs | `GET /applications/{uuid}/logs` | runtime logs |
| Version/health | `GET /version`, `GET /health` | — |

### Dokploy vs Coolify comparison

| Concern | Dokploy | Coolify |
|---|---|---|
| Auth | `x-api-key` header | `Authorization: Bearer <token>` |
| Key/token creation | Settings → API, shown once | Security → API Tokens, shown once |
| Scoping | organization (implicit via key metadata) | team (implicit via token) |
| Permissions on token | role-based only (admin/owner by default) | discrete: read / read:sensitive / write / deploy / root |
| Base path | `https://<host>/api` | `https://<host>/api/v1` |
| Path style | RPC-ish `/api/router.procedure`, GET=query POST=mutation | RESTful resources |
| Case | camelCase | snake_case |
| Pagination | none (except `*.search` limit/offset) | `skip`/`take` on deployment history |
| Rate limits | undocumented/none | 200 req/min default |
| Hierarchy | org → project → environment → apps+compose+dbs (one `project.all` call) | team → project → environment → apps/dbs/services (per-resource calls) |
| Status model | `applicationStatus` = build state; container state via `docker.*` | `status:health` string ≈ container state |
| Deployment commit info | none | `commit`, `commit_message` |
| Deploy options | no force/commit | `force`, `pr`, `docker_tag` |
| Build log | `deployment.readLogs` (tail) | `logs` field on deployment object |
| Runtime log | `application.readLogs` (tail/since/search) | `GET /applications/{uuid}/logs` |
| Live streaming | WebSockets, session-cookie auth only | none over API |
| Compose-like | first-class `compose` service type | separate `/services` (templates) + `/databases` |
| CORS | none → server-side only | none documented → assume server-side only |

## 7. Practical integration concerns

- **Base path**: yes, `https://<host>/api` + `/api/router.procedure`
  ([docs][dp-api]).
- **CORS**: no `Access-Control-Allow-*` anywhere — `next.config.mjs` sets only
  `X-Frame-Options`/CSP/etc. ([source][dp-nextcfg]); the API route handler adds
  none. **All Dokploy calls must run in our tRPC server**, with per-instance
  base URL + key from the JSON store; the browser only ever talks to us.
- **TLS / self-signed certs**: self-hosted instances frequently sit behind
  self-signed or freshly-issued certs. There is no Dokploy-side setting for
  this; the client decides. In Node we can build one `undici` `Agent` per
  registered instance (`connect: { rejectUnauthorized: <user toggle> }`) —
  make it an explicit per-instance checkbox, default strict.
- **Rate limits**: none documented or implemented — still self-limit polling
  (a scan of many projects is one `project.all`, which is cheap).
- **Error handling**: match both documented shapes — `{code,message,issues}`
  (400/401/403/404/500 from the OpenAPI layer) and the bare
  `{"message":"Unauthorized"}` 401 from the Next handler (§2).
- **Stability/versioning**: the whole REST surface is derived from internal
  tRPC routers and regenerated per release ([generator][dp-gen], [sync
  workflow][dp-syncwf]); response schemas are undocumented (`{}` in the spec),
  and the routers churn weekly (6 releases between 2026-08-14 and 2026-09-02 —
  [releases][dp-rel]; `environments` themselves are a newer layer). Practical
  stance: target "Dokploy ≥ 0.30"-ish behavior, treat unknown fields as
  free-pass, feature-detect via the instance's `/swagger` spec if a capability
  check is needed, and keep every parse in one provider module.
- **API key handling on our side**: keys are org-scoped and can expire — store
  `baseUrl`, `apiKey`, optional `allowSelfSignedTls`, and record which
  `organizationId` was active when the user tested the key, so a multi-org
  instance can register multiple entries.

## Decisions for workspace-welcome (provider interface implications)

**Model**: `DokployInstance { id, name, baseUrl, apiKey, allowSelfSignedTls?,
organizationId?, status }` in the JSON store; `ProjectLink { localProjectId,
instanceId, serviceKind: "application"|"compose", serviceId }`. Keep
`serviceKind` in the link from day one — compose services have parallel
endpoints (`compose.one`, `deployment.allByCompose`, `domain.byComposeId`,
`compose.deploy`).

**Minimal common operation set** (Dokploy + Coolify):

1. `verifyInstance()` — Dokploy: `GET /api/project.all` (or `server.count`);
   Coolify: `GET /api/v1/version` + any cheap read. Returns instance/version
   info for display.
2. `listServices()` — one call returning `{ id, kind, name, status,
   projectPath }` per service. Dokploy: `project.all` (tree incl. env names);
   Coolify: `/applications` (+ optionally `/databases`, `/services`) joined
   with `/projects`.
3. `getService(id)` — full record incl. repo identity fields.
4. `getStatus(id)` — normalized: Dokploy `applicationStatus` (+ optional
   `docker.getContainersByAppNameMatch` for container truth); Coolify parse
   `status:health`.
5. `listDeployments(serviceId)` — history; Dokploy `deployment.all`, Coolify
   `GET /deployments/applications/{uuid}`. Normalize to `{ id, status, startedAt,
   finishedAt?, message?, commit? }` — `commit` stays `null` on Dokploy.
6. `triggerDeploy(serviceId, opts?)` — Dokploy `application.deploy` (no opts);
   Coolify `POST /deploy?uuid=&force=` (opts honored when present).
7. `getDeploymentLog(deploymentId)` — Dokploy `deployment.readLogs`; Coolify
   `logs` field on the deployment object.
8. `getRuntimeLog(serviceId)` — Dokploy `application.readLogs`; Coolify
   `GET /applications/{uuid}/logs`.
9. `listDomains(serviceId)` — Dokploy `domain.byApplicationId` (rich objects);
   Coolify `fqdn` string split on commas (cert info not exposed per-domain).

**Dokploy-only extras worth exposing later** (not in the common interface):
org-wide deployment feed (`deployment.allCentralized`) for a dashboard-wide
"recent deploys" panel; container-level status (`docker.*`); app/host metrics
(`readAppMonitoring`, `getServerMetrics`); start/stop/reload; rollbacks;
websockets (blocked for API-key clients — note as unsupported, poll instead).

**Risks to carry into the design**: (1) API churn — regenerate expectations
per release, validate minimally, never assume documented response types;
(2) no CORS — browser must never call instances directly, so the backend owns
keys and timeouts; (3) self-signed TLS — per-instance opt-out, default strict;
(4) `applicationStatus === "running"` means *building*, not *serving* — the UI
must not present it as uptime; (5) key expiry/org scope — a stored key can go
invalid silently; surface verify-failures as instance-level alerts, not scan
errors.

[dp-api]: https://docs.dokploy.com/docs/api
[dp-refserver]: https://docs.dokploy.com/docs/api/reference-server
[dp-refproject]: https://docs.dokploy.com/docs/api/reference-project
[dp-gen]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/scripts/generate-openapi.ts
[dp-syncwf]: https://github.com/Dokploy/dokploy/blob/canary/.github/workflows/sync-openapi-docs.yml
[dp-openapi]: https://github.com/Dokploy/dokploy/blob/canary/openapi.json
[dp-authsrc]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/lib/auth.ts
[dp-handler]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/pages/api/%5B...trpc%5D.ts
[dp-constants]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/constants/index.ts
[dp-swagger]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/pages/swagger.tsx
[dp-apikey]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/components/dashboard/settings/api/add-api-key.tsx
[dp-nextcfg]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/next.config.mjs
[dp-server]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/server.ts
[dp-wssauth]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/wss/authorize.ts
[dp-projrouter]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/api/routers/project.ts
[dp-envrouter]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/api/routers/environment.ts
[dp-approuter]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/api/routers/application.ts
[dp-deprouter]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/api/routers/deployment.ts
[dp-domrouter]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/api/routers/domain.ts
[dp-composerouter]: https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/api/routers/compose.ts
[dp-projschema]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/db/schema/project.ts
[dp-envschema]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/db/schema/environment.ts
[dp-appschema]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/db/schema/application.ts
[dp-depschema]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/db/schema/deployment.ts
[dp-domschema]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/db/schema/domain.ts
[dp-composeschema]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/db/schema/compose.ts
[dp-shared]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/db/schema/shared.ts
[dp-appsvc]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/services/application.ts
[dp-depsvc]: https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/services/deployment.ts
[dp-rel]: https://github.com/Dokploy/dokploy/releases
[cf-auth]: https://coolify.io/docs/api-reference/authorization
[cf-openapi]: https://github.com/coollabsio/coolify/blob/main/openapi.json
[cf-appmodel]: https://github.com/coollabsio/coolify/blob/main/app/Models/Application.php
