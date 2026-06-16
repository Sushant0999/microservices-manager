# Microservice Manager — Documentation

> A desktop-grade GUI tool for managing multiple microservices across projects. Run, stop, rebuild, and stream logs for any local service — all from a single dark-themed React dashboard, powered by a Spring Boot backend.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Directory Structure](#4-directory-structure)
5. [Data Models](#5-data-models)
6. [Backend — Component Reference](#6-backend--component-reference)
   - [Application.java](#61-applicationjava)
   - [ProcessManagerService.java](#62-processmanagerservicejava)
   - [ProjectController.java](#63-projectcontrollerjava)
   - [FileBrowserController.java](#64-filebrowsercontrollerjava)
7. [REST API Reference](#7-rest-api-reference)
8. [Frontend — Component Reference](#8-frontend--component-reference)
9. [Configuration](#9-configuration)
10. [Build & Deployment](#10-build--deployment)
11. [Garbage Collector Analysis & Recommendation](#11-garbage-collector-analysis--recommendation)

---

## 1. Project Overview

**Microservice Manager** is a self-contained desktop application that lets developers manage multiple local microservices from a unified dashboard. You register services by pointing to their local directories, and the manager handles process lifecycle (start, stop, restart, rebuild) while streaming stdout/stderr logs in real time via Server-Sent Events (SSE).

**Key capabilities:**
- Group services into **Projects** for organizational clarity
- **Start / Stop / Restart / Rebuild** any registered service with a single click
- **Live log streaming** via SSE — both per-service modal and inline grid cards
- **Framework auto-detection** (Spring Boot, Gradle, Angular, React/Vite, Node, Python/FastAPI/Flask/venv)
- **Smart command suggestions** — inferred from the project directory's structure
- **Port suggestion** — reads `application.properties`, `vite.config.ts`, `.env`, etc.
- **File browser** for selecting service paths from within the UI
- **Port-kill safety** — uses PowerShell (Windows) or `lsof` (Linux/macOS) to free ports before starting a service
- **Log rotation** — keeps only the 5 most-recent log files on startup
- **Single-executable deployment** — frontend is built into the backend JAR's static resources

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser (localhost:9009)                    │
│                                                                 │
│   React + MUI + Framer Motion (Vite, TypeScript)               │
│   App.tsx  →  axios HTTP + native EventSource SSE               │
└────────────────────┬────────────────────────────────────────────┘
                     │  HTTP / SSE
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│           Spring Boot 3.2 Backend  (port 9009)                  │
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │ ProjectController│    │    FileBrowserController          │  │
│  │  /api/projects   │    │    /api/fs                        │  │
│  └────────┬─────────┘    └──────────────────────────────────┘  │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              ProcessManagerService                        │   │
│  │  - ConcurrentHashMap<project:service → Process>          │   │
│  │  - CachedThreadPool for log capture                      │   │
│  │  - SSE consumer registry (CopyOnWriteArrayList)          │   │
│  │  - JSON persistence  (services.json)                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Spawned Child Processes  (OS processes)                  │   │
│  │  auth-service, api-gateway, media-service, …             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                     │
                     ▼
              services.json  (persistence)
```

**Data flow — start a service:**
1. Frontend `POST /api/projects/{proj}/services/{name}/start`
2. `ProjectController` delegates to `ProcessManagerService.startService()`
3. Service kills any existing process on the port (PowerShell / lsof)
4. `ProcessBuilder` spawns the child process
5. A thread from `CachedThreadPool` reads stdout line-by-line and pushes to in-memory log buffer + all registered SSE consumers
6. Frontend `EventSource` receives each log line and renders it

---

## 3. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Backend Language | Java | 17 |
| Backend Framework | Spring Boot | 3.2.2 |
| HTTP Server | Embedded Tomcat (via Spring Web) | — |
| JSON | Jackson Databind | — |
| Boilerplate reduction | Lombok | — |
| Monitoring | Spring Actuator | — |
| Frontend Language | TypeScript | 5.x |
| Frontend Framework | React | 18.2 |
| UI Component Library | MUI (Material UI) | 5.14 |
| Animation | Framer Motion | 10.12 |
| HTTP Client | Axios | 1.4 |
| Build Tool (frontend) | Vite | 5.1 |
| Build Tool (backend) | Maven | — |

---

## 4. Directory Structure

```
microservice_manager/
├── build_executable.bat        # One-shot build script (frontend → backend JAR)
├── run_executable.bat          # Shortcut to run the built JAR
├── services.json               # Persistent config — projects & registered services
├── TestRun.java                # Scratch / test file (not part of the app)
│
├── backend/
│   ├── pom.xml                 # Maven build descriptor
│   ├── services.json           # Backend-local copy (fallback)
│   └── src/main/
│       ├── java/com/micro/manager/
│       │   ├── Application.java                  # Entry point + browser auto-open
│       │   ├── controller/
│       │   │   ├── ProjectController.java         # REST: project & service CRUD + lifecycle
│       │   │   └── FileBrowserController.java     # REST: FS browsing & smart suggestions
│       │   ├── model/
│       │   │   ├── Project.java                   # Data model — project
│       │   │   └── ServiceConfig.java             # Data model — registered service
│       │   ├── service/
│       │   │   └── ProcessManagerService.java     # Core business logic
│       │   └── utils/                             # (empty — reserved)
│       └── resources/
│           ├── application.properties             # Server config
│           └── static/                            # Served frontend build artifacts
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx            # React entry point
        ├── App.tsx             # Entire UI (single-file SPA)
        ├── components/         # (empty — all UI in App.tsx)
        ├── hooks/              # (empty)
        └── utils/              # (empty)
```

---

## 5. Data Models

### `Project`
```java
public class Project {
    String name;           // Unique project identifier
    String description;    // Human-readable description
    List<ServiceConfig> services;  // Services belonging to this project
}
```

### `ServiceConfig`
```java
public class ServiceConfig {
    String name;                        // Unique within a project
    String projectName;                 // Back-reference to parent project
    String path;                        // Absolute filesystem path to service root
    int port;                           // Port the service listens on
    String startCommand;                // e.g. "mvn spring-boot:run"
    String rebuildCommand;              // e.g. "mvn clean install -DskipTests"
    String status;                      // "RUNNING" | "STOPPED" | "REBUILDING"
}
```

### `services.json` (persistence format)
```json
{
  "projects": [
    {
      "name": "MyProject",
      "description": "...",
      "services": [
        {
          "name": "auth-service",
          "projectName": "MyProject",
          "path": "D:\\codes\\myapp\\auth-service",
          "port": 8081,
          "startCommand": "mvn spring-boot:run",
          "rebuildCommand": "mvn clean install -DskipTests",
          "status": "STOPPED"
        }
      ]
    }
  ]
}
```

---

## 6. Backend — Component Reference

### 6.1 `Application.java`

**Package:** `com.micro.manager`

Entry point for the Spring Boot application.

| Responsibility | Detail |
|---|---|
| JVM headless mode | Sets `java.awt.headless=false` so `Desktop` API works |
| Auto browser launch | On `ApplicationReadyEvent`, opens `http://localhost:9009` in the default browser using `Desktop.getDesktop().browse()` or `rundll32` fallback |

---

### 6.2 `ProcessManagerService.java`

**Package:** `com.micro.manager.service`

This is the **core engine** of the application. It is a Spring `@Service` singleton holding all runtime state.

#### Internal State

| Field | Type | Purpose |
|---|---|---|
| `projects` | `ConcurrentHashMap<String, Project>` | In-memory project registry |
| `activeProcesses` | `ConcurrentHashMap<String, Process>` | Running OS processes keyed by `"projectName:serviceName"` |
| `logs` | `ConcurrentHashMap<String, List<String>>` | In-memory log buffer (capped at 1000 lines per service) |
| `logConsumers` | `ConcurrentHashMap<String, List<Consumer<String>>>` | SSE subscriber callbacks per service |
| `executorService` | `ExecutorService` (cached thread pool) | Threads for log-capture I/O loops |
| `configFile` | `File` | Resolved path to `services.json` |

#### Key Methods

| Method | Description |
|---|---|
| `init()` | `@PostConstruct` — rotates old log files, then loads `services.json` |
| `rotateLogFiles()` | Scans root and backend dirs for `.log` files, keeps newest 5, deletes rest |
| `loadConfigs()` | Reads `services.json`; supports both `projects[]` and legacy `services[]` format |
| `saveConfigs()` | Serialises in-memory state back to `services.json` (synchronized) |
| `startService(project, name)` | Resolves config, calls `killProcessByPort`, waits for port to free, then spawns a `ProcessBuilder`, submits a log-capture task |
| `stopService(project, name)` | Calls `Process.destroy()` + `destroyForcibly()`, then kills port |
| `rebuildService(project, name)` | Stops service, sets status to `REBUILDING`, runs `rebuildCommand` via `ProcessBuilder`, captures logs |
| `captureLogs(project, name, process)` | Blocking I/O loop; reads stdout line-by-line, appends to buffer, notifies all registered consumers |
| `killProcessByPort(port)` | PowerShell (Windows) or `lsof` (Linux/macOS) — retries up to 3× with 400 ms delay |
| `waitForPortFree(port)` | Polls `ServerSocket.bind()` every 250 ms, up to 3 seconds |
| `addLogConsumer / removeLogConsumer` | Registers/deregisters SSE callbacks; replays historical logs on registration |
| `shutdown()` | `@PreDestroy` — gracefully stops all running services |

#### Service Key Convention

```
key = "{projectName}:{serviceName}"
// Example: "smrty:auth-service"
```

---

### 6.3 `ProjectController.java`

**Package:** `com.micro.manager.controller`
**Base path:** `/api/projects`

Thin REST adapter — validates and delegates every operation to `ProcessManagerService`.

| Endpoint | Method | Description |
|---|---|---|
| `/api/projects` | GET | List all projects |
| `/api/projects` | POST | Create project |
| `/api/projects/{name}` | PUT | Update project |
| `/api/projects/{name}` | DELETE | Delete project (stops all services) |
| `/api/projects/{proj}/services` | POST | Add service to project |
| `/api/projects/{proj}/services/{name}` | PUT | Update service config |
| `/api/projects/{proj}/services/{name}` | DELETE | Remove service |
| `/api/projects/{proj}/services/{name}/start` | POST | Start service |
| `/api/projects/{proj}/services/{name}/stop` | POST | Stop service |
| `/api/projects/{proj}/services/{name}/restart` | POST | Stop then start |
| `/api/projects/{proj}/services/{name}/rebuild` | POST | Clean & rebuild |
| `/api/projects/{proj}/services/{name}/logs` | GET (SSE) | Stream logs via `text/event-stream` |

**SSE log streaming detail:**
- Returns a `SseEmitter(Long.MAX_VALUE)` (no timeout)
- Registers a synchronized `Consumer<String>` with `ProcessManagerService`
- Deregisters automatically on `onCompletion`, `onTimeout`, and `onError`

---

### 6.4 `FileBrowserController.java`

**Package:** `com.micro.manager.controller`
**Base path:** `/api/fs`

Utility REST controller providing filesystem intelligence to the UI.

| Endpoint | Method | Description |
|---|---|---|
| `/api/fs/browse?path=` | GET | List subdirectories of `path`; returns drive roots if empty |
| `/api/fs/suggest-commands?path=` | GET | Heuristic start-command suggestions |
| `/api/fs/suggest-rebuild-commands?path=` | GET | Heuristic rebuild-command suggestions |
| `/api/fs/suggest-port?path=` | GET | Infers the service's listening port |
| `/api/fs/detect-framework?path=` | GET | Returns a framework identifier string |

**Framework detection logic (in priority order):**

| Detected marker | Framework string |
|---|---|
| `pom.xml` | `spring-boot` |
| `build.gradle` / `build.gradle.kts` | `gradle` |
| `angular.json` | `angular` |
| `package.json` + Vite config + `"react"` in deps | `react-vite` |
| `package.json` + Vite config | `vite` |
| `package.json` + `"react"` in deps | `react` |
| `package.json` | `node` |
| venv + FastAPI | `python-venv-fastapi` |
| venv + Flask | `python-venv-flask` |
| venv | `python-venv` |
| Python project + FastAPI | `python-fastapi` |
| Python project + Flask | `python-flask` |
| Python project | `python` |
| fallback | `unknown` |

**Port detection logic (in priority order):**

1. `angular.json` — regex for `"port": <n>`
2. `vite.config.*` — regex for `port: <n>`
3. React/CRA — defaults to 3000
4. Generic Node — defaults to 3000
5. Python — checks `.env` `PORT=`, then regex in `main.py/app.py/run.py`, then framework defaults (FastAPI=8000, Flask=5000)
6. Spring Boot — parses `src/main/resources/application.{properties,yml,yaml}` for `server.port`
7. Final fallback — 8080

---

## 7. REST API Reference

### Base URL
`http://localhost:9009`

### Projects

#### `GET /api/projects`
Returns all projects with their services.

**Response:** `200 OK`
```json
[
  {
    "name": "smrty",
    "description": "",
    "services": [
      {
        "name": "auth-service",
        "projectName": "smrty",
        "path": "D:\\codes\\smrty\\services\\auth-service",
        "port": 8081,
        "startCommand": "mvn spring-boot:run",
        "rebuildCommand": "mvn clean install -DskipTests",
        "status": "RUNNING"
      }
    ]
  }
]
```

#### `POST /api/projects`
Create a new project.

**Request body:**
```json
{ "name": "MyProject", "description": "Optional description" }
```

#### `PUT /api/projects/{name}`
Update project name/description. `{name}` is the **current** project name.

#### `DELETE /api/projects/{name}`
Delete project and stop all its services.

---

### Services

#### `POST /api/projects/{projectName}/services`
Add a new service.

**Request body:**
```json
{
  "name": "auth-service",
  "path": "D:\\codes\\myapp\\auth-service",
  "port": 8081,
  "startCommand": "mvn spring-boot:run",
  "rebuildCommand": "mvn clean install -DskipTests"
}
```

#### `PUT /api/projects/{projectName}/services/{name}`
Update service config. The service is stopped first if the name changes.

#### `DELETE /api/projects/{projectName}/services/{name}`
Remove service (stops it first).

#### `POST /api/projects/{projectName}/services/{name}/start`
Start the service process.

#### `POST /api/projects/{projectName}/services/{name}/stop`
Stop the service process.

#### `POST /api/projects/{projectName}/services/{name}/restart`
Stop then start.

#### `POST /api/projects/{projectName}/services/{name}/rebuild`
Stop, run `rebuildCommand`, and capture its logs.

#### `GET /api/projects/{projectName}/services/{name}/logs`
**SSE stream.** Connect with `EventSource`. Each message contains one log line.

---

### File System

#### `GET /api/fs/browse?path=<absolute-path>`
Returns list of subdirectory absolute paths. If `path` is empty, returns drive roots.

#### `GET /api/fs/suggest-commands?path=<absolute-path>`
Returns ordered list of suggested start commands.

#### `GET /api/fs/suggest-rebuild-commands?path=<absolute-path>`
Returns ordered list of suggested rebuild commands.

#### `GET /api/fs/suggest-port?path=<absolute-path>`
Returns a single integer — the inferred port.

#### `GET /api/fs/detect-framework?path=<absolute-path>`
Returns a string like `spring-boot`, `react-vite`, `python-fastapi`, etc.

---

## 8. Frontend — Component Reference

The entire UI lives in **[`App.tsx`](file:///d:/codes/microservice_manager/frontend/src/App.tsx)** as a single-file React application.

### State Architecture

| State | Purpose |
|---|---|
| `projects: Project[]` | Source of truth — polled every 5 seconds |
| `selectedProject: string` | `'All'` or a project name — controls sidebar selection & filter |
| `viewMode: 'list' \| 'grid'` | Toggle between table view and live-log grid |
| `selectedLogService` | Controls the log modal (project+service name) |
| `logs: string[]` | Lines in the log modal (capped at 1000) |
| `openForm / formData` | Add/Edit service dialog |
| `openProjectForm / projectFormData` | Add/Edit project dialog |
| `openBrowse / currentPath / dirs` | File browser dialog |
| `sidebarVisible` | Controls left panel visibility (animated with Framer Motion) |
| `detectedFramework` | Badge shown in the service form |
| `suggestedCommands / suggestedRebuildCommands` | Autocomplete chips |

### Key Functions

| Function | Description |
|---|---|
| `fetchProjects()` | `GET /api/projects` — runs on mount + every 5 s |
| `handleAction(project, name, action)` | Generic `POST /api/projects/{proj}/services/{name}/{action}` |
| `openLogs(project, name)` | Opens SSE stream to log modal |
| `closeLogs()` | Closes EventSource and resets modal state |
| `fetchSuggestions(path)` | Parallel `Promise.all` for commands, rebuild commands, port, framework |
| `browseDirs(path)` | Loads subdirectory listing into file browser |
| `handleSelectPath(path)` | Closes browser, sets path, auto-fetches suggestions |
| `startAll() / stopAll()` | Bulk start/stop for the currently filtered service set |
| `handleSaveProject()` | Creates or updates a project |
| `handleSaveService()` | Creates, updates, or moves a service to a different project |

### `LogCard` (memoized component)

An inline live-log card used in **grid view**. Each card:
- Opens its own `EventSource` SSE connection when `status === 'RUNNING'`
- Maintains its own `logs` state (capped at 100 lines)
- Auto-scrolls to the bottom on new lines
- Shows start/stop controls per-service

### UI Features

| Feature | Implementation |
|---|---|
| Sidebar animation | Framer Motion `AnimatePresence` + `motion.div` with slide-in/out |
| View mode switch | MUI `ToggleButtonGroup`, animated with Framer Motion `AnimatePresence mode="wait"` |
| Log colouring | `getLogColor()` — red for ERROR/EXCEPTION/FAIL, amber for WARN, gray for DEBUG |
| Framework badges | Emoji + styled `Chip` from a lookup map |
| Open in browser | `window.open(`http://localhost:${port}`, '_blank')` — visible when RUNNING |

---

## 9. Configuration

### `application.properties`

| Property | Default | Description |
|---|---|---|
| `server.port` | `9009` | HTTP server port |
| `spring.jackson.serialization.WRITE_DATES_AS_TIMESTAMPS` | `false` | ISO date format |
| `management.endpoints.web.exposure.include` | `*` | Expose all actuator endpoints |
| `management.endpoint.health.show-details` | `always` | Full health details |

### `services.json` Location Resolution

The backend resolves `services.json` in this order:
1. `../services.json` (parent directory — used when running from `backend/` dir)
2. `./services.json` (current directory — used when running the JAR from root)
3. Falls back to creating `../services.json` with a default empty project

---

## 10. Build & Deployment

### Development Mode

```bash
# Terminal 1 — Backend
cd backend
mvn spring-boot:run

# Terminal 2 — Frontend (with HMR proxy to :9009)
cd frontend
npm install
npm run dev
```

Frontend dev server proxies API requests to the backend. The Vite config should include:
```ts
// vite.config.ts
server: { proxy: { '/api': 'http://localhost:9009' } }
```

### Production — Single Executable JAR

Run `build_executable.bat`. It does:

1. **`npm install && npm run build`** in `frontend/` → produces `frontend/dist/`
2. Copies `frontend/dist/*` → `backend/src/main/resources/static/`
3. **`mvn clean package -DskipTests`** in `backend/` → produces `backend/target/manager-0.0.1-SNAPSHOT.jar`

Run the application:
```bash
java -jar backend\target\manager-0.0.1-SNAPSHOT.jar
```

Or double-click `run_executable.bat`:
```bat
java -jar backend\target\manager-0.0.1-SNAPSHOT.jar
```

The JAR serves the React SPA from `/` (Spring's static resource handler) and the REST API from `/api/`.

### OS Compatibility

| OS | Notes |
|---|---|
| **Windows** | Primary target. Uses `cmd.exe /c`, PowerShell for port killing (`Get-NetTCPConnection`), `taskkill /F` |
| **Linux / macOS** | `sh -c` for commands, `lsof -ti tcp:<port>` for port killing, `kill -9` |

---

## 11. Garbage Collector Analysis & Recommendation

### Context

The Microservice Manager backend is:
- **Long-running** (runs for hours or days as a desktop daemon)
- **Low-throughput** — very few requests per second (human interaction only, 5-second polling)
- **Memory profile**: small heap; objects are mostly short-lived (`String` log lines) with some long-lived singletons (`ConcurrentHashMap` state)
- **Latency-sensitive** — while not a hard real-time system, UI responsiveness is expected
- **Desktop application** — runs on a single machine, not a cloud server; GC pauses are visible to the user

### Available GC Options (Java 17)

| GC | Pause type | Best for | Notes |
|---|---|---|---|
| **G1GC** *(default in Java 9+)* | Short, concurrent | General purpose, large heaps | Default; good balance of throughput & latency |
| **ZGC** | Sub-millisecond concurrent | Low-latency services | Scalable, min pauses, slightly higher footprint |
| **Shenandoah** | Low-pause concurrent | Similar to ZGC (Red Hat) | Available in OpenJDK 17+ |
| **Parallel GC** | Stop-the-world | Max throughput batch jobs | Not suitable — long STW pauses |
| **Serial GC** | Stop-the-world | Tiny heaps, embedded | Suitable for very small apps |
| **Epsilon GC** | No GC (no collection) | Testing/benchmarking only | Not suitable for production |

### Analysis for This Application

This is a **desktop tool with a tiny heap** (well under 256 MB in practice) and **infrequent short-lived allocations** (log line strings). The dominant workload is:
1. Background log-capture threads appending `String` objects to in-memory lists
2. HTTP request/response serialization (rare — human-driven clicks)
3. SSE emitter callbacks dispatching to registered consumers

Given this profile:

- **G1GC (default)** — Already a solid choice. However, its region-based approach is designed for heaps ≥ 1 GB and may add unnecessary overhead for this tiny heap.
- **ZGC** — Excellent sub-millisecond pauses, but designed for very large heaps (multi-GB). Overhead is disproportionate for this use case.
- **Serial GC** — Surprisingly viable. For a single-user desktop app with a heap under 64 MB, Serial GC's simplicity wins: no background GC threads competing with the log-capture threads, deterministic behavior.

### ✅ Recommendation: **Serial GC with a capped heap**

For this specific application profile (small heap, low allocation rate, desktop use):

```bash
java -XX:+UseSerialGC -Xms32m -Xmx128m -jar backend\target\manager-0.0.1-SNAPSHOT.jar
```

**Why Serial GC:**
- The heap stays small (< 64 MB typical usage), which Serial GC handles with near-zero overhead
- No competing GC background threads — log-capture I/O threads get full CPU when needed
- STW pauses with a 64 MB heap are imperceptibly short (< 5 ms)
- Simplest and most predictable memory model for a single-user daemon

**Alternative — G1GC (if you expect heap growth):**

If you plan to extend the tool (e.g., persisting more logs in memory, adding metrics history), G1GC is the safer default:

```bash
java -XX:+UseG1GC -Xms64m -Xmx256m -XX:MaxGCPauseMillis=50 -jar backend\target\manager-0.0.1-SNAPSHOT.jar
```

**Update `run_executable.bat` to apply your chosen flags:**

```bat
@echo off
java -XX:+UseSerialGC -Xms32m -Xmx128m -jar backend\target\manager-0.0.1-SNAPSHOT.jar
```

### GC Tuning Summary

| Flag | Value | Purpose |
|---|---|---|
| `-XX:+UseSerialGC` | — | Use Serial collector |
| `-Xms32m` | 32 MB | Initial heap (avoid unnecessary initial allocation) |
| `-Xmx128m` | 128 MB | Max heap (plenty for this app, prevents OS thrashing) |
| `-verbose:gc` | — | (Optional) Enable GC logging for diagnostics |
| `-Xlog:gc*:file=gc.log` | — | (Optional) Write GC log to file |

> [!TIP]
> If you see log lag or UI stutters (unlikely, but possible under heavy log output), switch to `-XX:+UseG1GC -XX:MaxGCPauseMillis=20`. G1GC will keep pauses under 20 ms even with a larger heap.

> [!NOTE]
> The `Executors.newCachedThreadPool()` used in `ProcessManagerService` creates threads on demand and may accumulate idle threads over time. If you run many services simultaneously, consider switching to `Executors.newFixedThreadPool(N)` or a `VirtualThreadPerTaskExecutor` (Java 21+ virtual threads) for better resource control — this also reduces GC pressure from thread-local allocations.

---

*Generated on 2026-06-17 | Microservice Manager v0.0.1-SNAPSHOT*
