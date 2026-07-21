# How Aegis Works Behind the Scenes

This document explains what happens under the hood when you use Aegis — from file upload through AI conversation, pipeline generation, execution, and visualization. It is written for developers, reviewers, and technical stakeholders who want to understand the system without reading every source file.

---

## Table of Contents

1. [What Aegis Is](#what-aegis-is)
2. [High-Level Architecture](#high-level-architecture)
3. [The End-to-End User Journey](#the-end-to-end-user-journey)
4. [Upload and Session Management](#upload-and-session-management)
5. [The Privacy Boundary](#the-privacy-boundary)
6. [Agent Chat (LLM Conversation)](#agent-chat-llm-conversation)
7. [Pipeline Generation](#pipeline-generation)
8. [The Pipeline DSL](#the-pipeline-dsl)
9. [Pipeline Execution](#pipeline-execution)
10. [Visualization](#visualization)
11. [Frontend Internals](#frontend-internals)
12. [API Reference](#api-reference)
13. [Configuration and Deployment](#configuration-and-deployment)
14. [Security Model](#security-model)
15. [Known Limitations](#known-limitations)

---

## What Aegis Is

Aegis is an **agentic data analysis platform**. You upload a CSV or Excel file, chat with an AI agent about what you want to learn from the data, and the agent produces an editable visual data pipeline. You can tweak that pipeline in a drag-and-drop editor, run it, and see charts, a data preview, and step-by-step execution logs.

The core design principle is **privacy-first analysis**:

- The LLM never receives raw row data.
- All data transformation and chart rendering happen **locally on the server** using pandas and Plotly.
- The LLM only sees **dataset metadata** (column names, types, null rates, row counts) plus your **chat messages**.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser (React SPA)                             │
│  ┌──────────────┐  ┌─────────────────────┐  ┌───────────────────────┐ │
│  │  Agent Chat  │  │  Pipeline Canvas    │  │  Results Dashboard    │ │
│  │  (SSE stream)│  │  (React Flow editor)│  │  (Plotly + table)     │ │
│  └──────┬───────┘  └──────────┬──────────┘  └───────────┬───────────┘ │
│         │                     │                           │             │
│         └─────────────────────┼───────────────────────────┘             │
│                               │  HTTP /api/* (Vite proxy in dev)        │
└───────────────────────────────┼─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (Python)                           │
│                                                                         │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌────────┐ │
│  │ Upload  │  │   Chat   │  │  Pipeline  │  │ Executor │  │  Viz   │ │
│  │ Ingest  │  │  Agent   │  │  Generate  │  │ (pandas) │  │(Plotly)│ │
│  └────┬────┘  └────┬─────┘  └─────┬──────┘  └────┬─────┘  └───┬────┘ │
│       │            │              │               │              │      │
│       └────────────┴──────────────┴───────────────┴──────────────┘      │
│                               │                                         │
│                    ┌──────────┴──────────┐                              │
│                    │   Session Store   │                              │
│                    │  (in-memory +     │                              │
│                    │   Parquet on disk)│                              │
│                    └───────────────────┘                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  LiteLLM (metadata + chat only)
                                ▼
                    ┌───────────────────────┐
                    │  External LLM Provider │
                    │  OpenAI / Anthropic /  │
                    │  Ollama / etc.         │
                    └───────────────────────┘
```

| Layer | Technology | Role |
|-------|------------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind | UI, pipeline editor, chart rendering |
| Pipeline editor | React Flow (`@xyflow/react`) | Visual DAG editing |
| Charts (client) | Plotly.js (`react-plotly.js`) | Interactive chart display |
| Backend | FastAPI, pandas | API, data processing, execution |
| AI | LiteLLM | Provider-agnostic LLM calls |
| Charts (server) | Plotly (Python) | Chart JSON generation |
| Storage | In-memory sessions + Parquet files | Session state and raw data |

---

## The End-to-End User Journey

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant LLM
    participant Disk as Parquet on Disk

    User->>Frontend: Upload CSV/Excel
    Frontend->>Backend: POST /api/upload
    Backend->>Backend: Parse file, analyze schema
    Backend->>Disk: Save data.parquet
    Backend-->>Frontend: session_id + profile

    User->>Frontend: Chat messages
    Frontend->>Backend: POST /api/chat (SSE)
    Backend->>LLM: profile + chat history
    LLM-->>Backend: streamed tokens
    Backend-->>Frontend: SSE token stream

    User->>Frontend: Generate Pipeline
    Frontend->>Backend: POST /api/pipeline/generate
    Backend->>LLM: profile + chat history + intent
    LLM-->>Backend: PipelinePlan JSON
    Backend->>Backend: Validate + store pipeline
    Backend-->>Frontend: PipelinePlan

    User->>Frontend: Edit pipeline on canvas
    Frontend->>Backend: PATCH /api/pipeline

    User->>Frontend: Run Pipeline
    Frontend->>Backend: PATCH then POST /execute
    Backend->>Disk: Load Parquet
    Backend->>Backend: Execute steps (pandas + Plotly)
    Backend-->>Frontend: preview + charts + logs
```

| Step | What the user sees | What happens behind the scenes |
|------|-------------------|-------------------------------|
| 1. Upload | Dropzone accepts file | File parsed, profile computed, Parquet saved, UUID session created |
| 2. Chat | Streaming assistant replies | LiteLLM called with metadata + history; tokens streamed via SSE |
| 3. Generate | Pipeline appears on canvas | LLM returns JSON plan; validated, normalized, stored on session |
| 4. Edit | Drag nodes, change params | Frontend PATCHes updated plan; Pydantic re-validates each step |
| 5. Run | Charts, table, logs appear | Parquet loaded, steps executed in order, Plotly figures built |
| 6. Iterate | Revise and re-run | Same session; pipeline and logs updated in memory |

---

## Upload and Session Management

### What happens on upload

When a file is uploaded via `POST /api/upload`, the backend runs this pipeline:

```
File bytes
  → Size/row limit checks (MAX_UPLOAD_MB, MAX_ROWS)
  → Format-specific reader (.csv, .xlsx, .xls)
  → schema_analyzer.analyze_dataframe()   ← metadata only
  → session_store.create()                ← UUID session
  → df.to_parquet(~/.aegis/data/{id}/data.parquet)
  → Return { session_id, profile }
```

**Key files:**
- [`backend/app/services/ingest.py`](backend/app/services/ingest.py) — upload orchestration
- [`backend/app/services/excel_reader.py`](backend/app/services/excel_reader.py) — Excel parsing with merged-cell resolution
- [`backend/app/services/schema_analyzer.py`](backend/app/services/schema_analyzer.py) — column profiling
- [`backend/app/services/session.py`](backend/app/services/session.py) — session lifecycle

### File format handling

| Format | Reader | Notes |
|--------|--------|-------|
| `.csv` | `pandas.read_csv` | Direct parse |
| `.xlsx` | Custom openpyxl reader | Merged cells resolved, header row auto-detected |
| `.xls` | `pandas.read_excel` | Legacy Excel; no merge support |

For Excel files, the user can optionally specify a **header row** (0-based index). The profile includes `excel_meta` with sheet name, header row used, and number of merged cells resolved.

### Schema analysis

The schema analyzer samples the **first 1,000 rows** locally to compute:

- Column names
- Inferred data types (with numeric inference for object columns)
- Null percentage per column
- Total row and column counts

This produces a `DatasetProfile` object. **No individual cell values** from the full dataset are included in the profile sent to the LLM.

### Session state

Each session is a `SessionState` object stored in an in-memory dictionary:

```python
SessionState:
  session_id: str          # UUID — acts as the access token
  file_name: str
  profile: DatasetProfile
  parquet_path: Path       # ~/.aegis/data/{id}/data.parquet
  chat_history: list       # All user + assistant messages
  pipeline: PipelinePlan   # Generated or user-edited plan
  execution_logs: list     # History of step logs from each run
  created_at: datetime
```

**Persistence model:**
- **In memory:** chat history, pipeline, execution logs (lost on server restart)
- **On disk:** Parquet file with full dataset (survives restart if `DATA_DIR` is mounted)
- **TTL:** Sessions expire after `SESSION_TTL_HOURS` (default 24h); expired sessions and Parquet files are deleted

There is no user authentication. Anyone with the `session_id` can access that session's APIs.

---

## The Privacy Boundary

This is the most important architectural decision in Aegis.

### What goes to the LLM

| Data | Source | Example |
|------|--------|---------|
| Dataset profile | `schema_analyzer` | `"revenue (float64, 2.3% null)"` |
| Chat history | `session.chat_history` | User questions and assistant replies |
| Intent message | Generate request | `"Create a pipeline based on our conversation so far."` |
| System prompts | `agent.py` | Rules, step schemas, JSON examples |

### What stays local (never sent to LLM)

| Data | Where it lives | Used for |
|------|----------------|----------|
| Raw row values | Parquet on disk | Pipeline execution |
| Full DataFrame | Loaded in executor | pandas transforms |
| Execution preview | Returned to frontend | 50-row table display |
| Plotly figures | Built in `viz.py` | Chart rendering |
| API keys | Server `.env` | LiteLLM authentication |

### Privacy caveats

1. **User-typed chat may contain sensitive information** — if you write "filter to customer Acme Corp", that text is sent to the LLM.
2. **Pipeline generation logs** — full prompts (including chat history) are written to `pipeline_prompts.log` on disk.
3. **No encryption at rest** for Parquet files.
4. **Third-party LLM** — metadata and chat are transmitted to whichever provider you configure (OpenAI, Anthropic, Ollama, etc.).

---

## Agent Chat (LLM Conversation)

### How chat works

1. User sends a message from the frontend.
2. Backend appends it to `session.chat_history`.
3. LiteLLM is called with:
   - A system prompt enforcing the "no raw data" rule
   - The dataset profile as a second system message
   - The full chat history
4. Response tokens are streamed back via **Server-Sent Events (SSE)**.
5. The complete assistant response is appended to `session.chat_history`.

**Key file:** [`backend/app/services/agent.py`](backend/app/services/agent.py) — `chat_stream()`

### System prompt rules

The chat agent is instructed to:
- Never claim to see raw row data
- Ask clarifying questions when intent is ambiguous
- Reference columns by exact name from the profile
- Direct users to click **"Generate Pipeline"** when ready (chat does not auto-generate pipelines)

### SSE protocol

The chat endpoint (`POST /api/chat/{session_id}`) returns `text/event-stream`:

```
data: {"token": "partial text chunk"}
data: {"token": "more text"}
data: {"done": true}
```

On error:
```
data: {"error": "error message"}
```

The frontend uses `fetch` + `ReadableStream` (not the browser `EventSource` API) because chat requires a POST with a JSON body.

### Chat vs. pipeline generation

Chat and pipeline generation are **separate LLM calls** with different system prompts:

| | Chat | Pipeline Generation |
|---|------|---------------------|
| Purpose | Conversational guidance | Produce executable JSON plan |
| Output | Natural language text | Structured `PipelinePlan` JSON |
| Streaming | Yes (SSE) | No (single response) |
| Trigger | User sends message | User clicks "Generate Pipeline" |

Importantly, when you click **Generate Pipeline**, the backend uses the **server-side** `session.chat_history` (not the frontend's local message state). Chat messages sent through the API are persisted on the session and included in the generation prompt.

---

## Pipeline Generation

### Trigger

`POST /api/pipeline/{session_id}/generate` with an optional body:

```json
{ "intent": "Show revenue by region for active customers" }
```

If no intent is provided, the default is: *"Create a pipeline based on our conversation so far."*

### LLM call

The generation prompt includes:

1. `PLAN_SYSTEM_PROMPT` — step schemas, rules, JSON example
2. Dataset profile (column names, types, null rates)
3. Full chat history from the session
4. The intent user message
5. (On retry) Validation error feedback

### Structured output strategy

Aegis adapts based on the configured model:

| Model family | Output method |
|--------------|---------------|
| GPT / OpenAI | Pydantic `response_format` (strict JSON schema) |
| Claude, Ollama, others | Plain text JSON, manually parsed |

### Post-processing pipeline

```
LLM response
  → _strip_json_fences()        Remove markdown code fences
  → normalize_pipeline_data()   Fix common LLM mistakes (e.g. list-form aggregations)
  → Pydantic validation         Each step's params checked against typed schemas
  → (retry once on failure)     Send validation error back to LLM
  → Store on session.pipeline
```

**Key files:**
- [`backend/app/services/agent.py`](backend/app/services/agent.py) — `generate_pipeline()`
- [`backend/app/services/pipeline_normalizer.py`](backend/app/services/pipeline_normalizer.py) — output cleanup
- [`backend/app/models/pipeline.py`](backend/app/models/pipeline.py) — Pydantic models and validation

---

## The Pipeline DSL

Aegis uses a **whitelist-based Domain Specific Language (DSL)** for data pipelines. The LLM can only produce steps from a fixed set of 10 operations — there is no arbitrary code execution in the DSL itself.

### Plan structure

```json
{
  "name": "Revenue by Region",
  "steps": [
    {
      "id": "f1",
      "type": "filter",
      "label": "Active only",
      "params": { "column": "status", "op": "eq", "value": "active" },
      "position": { "x": 0, "y": 0 }
    }
  ],
  "edges": [
    { "source": "f1", "target": "g1" }
  ]
}
```

- **`steps`** — ordered list of operations with parameters
- **`edges`** — define execution order (source → target)
- **`position`** — canvas coordinates for the React Flow editor

### Step types

| Type | What it does | Key params |
|------|-------------|------------|
| `filter` | Filter rows by condition | `column`, `op`, `value` |
| `select_columns` | Keep specific columns | `columns[]` |
| `rename` | Rename columns | `mapping{}` |
| `fill_na` | Fill missing values | `columns[]`, `value` |
| `cast_type` | Convert column type | `column`, `dtype` |
| `groupby_agg` | Group and aggregate | `group_by[]`, `aggregations{}` |
| `sort` | Sort rows | `columns[]`, `ascending` |
| `deduplicate` | Remove duplicate rows | `subset[]` |
| `compute_column` | Add computed column | `name`, `expression` |
| `visualize` | Generate chart (no data change) | `chart_type`, `x`, `y`, `title` |

### Validation layers

Parameters are validated at multiple points:

1. **LLM prompt** documents exact schemas
2. **`pipeline_normalizer.py`** fixes common formatting mistakes
3. **`TypedPipelinePlan`** (GPT) enforces strict JSON schema
4. **`PipelineStep` model validator** checks params against per-type Pydantic models
5. **`PATCH /api/pipeline`** re-validates user edits from the frontend editor

### Filter operators

`filter` supports: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `is_null`, `not_null`

### Aggregation functions

`groupby_agg` supports: `sum`, `count`, `mean`, `min`, `max`

---

## Pipeline Execution

### Execution flow

When `POST /api/pipeline/{session_id}/execute` is called:

```
1. Load DataFrame from Parquet
2. Topologically sort steps using edges (Kahn's algorithm)
3. For each step in order:
     a. Record rows_in count
     b. If type == "visualize" → build Plotly chart, append to viz_specs
        Else → apply pandas transform to DataFrame
     c. Record rows_out count and duration_ms
4. Return ExecutionResult
```

**Key file:** [`backend/app/services/executor.py`](backend/app/services/executor.py)

### Execution semantics

- **Per-step output cache** — each step stores its output dataframe; children read from their parent's output
- **Forks supported** — one parent may have multiple children; sibling branches do not interfere
- **Multi-input merge not supported** — steps with more than one parent are rejected with a clear error
- **Cycle fallback** — if the edge graph has a cycle, steps run in their list order
- **`visualize` is side-effect free** — it reads the parent dataframe but does not modify it
- **Preview** — first 50 rows from the sink step with the most rows (`preview_step_id` identifies which branch)

### Step implementations (pandas)

Each step type maps to a pandas operation:

| Step | pandas operation |
|------|-----------------|
| `filter` | Boolean indexing on column |
| `select_columns` | `df[columns]` |
| `rename` | `df.rename(columns=mapping)` |
| `fill_na` | `df[columns].fillna(value)` |
| `cast_type` | `astype()` or `pd.to_datetime()` |
| `groupby_agg` | `df.groupby().agg()` |
| `sort` | `df.sort_values()` |
| `deduplicate` | `df.drop_duplicates()` |
| `compute_column` | `df.eval(expression)` |

### `compute_column` security note

Computed columns use `pandas.eval()` with the Python engine. Expressions are defined by the LLM or user in the pipeline editor. While this is not arbitrary `exec()`, it does evaluate user/LLM-provided expressions against local data. The DSL whitelist prevents arbitrary Python outside of this controlled step type.

### Execution result

```json
{
  "preview": [ { "region": "West", "revenue": 12000 }, ... ],
  "columns": ["region", "revenue"],
  "row_count": 42,
  "preview_step_id": "g1",
  "viz_specs": [
    {
      "step_id": "v1",
      "chart_type": "bar",
      "title": "Revenue by Region",
      "figure": { "data": [...], "layout": {...} }
    }
  ],
  "execution_log": [
    {
      "step_id": "f1",
      "step_type": "filter",
      "label": "Active only",
      "rows_in": 10000,
      "rows_out": 8500,
      "duration_ms": 12
    }
  ]
}
```

---

## Visualization

Charts are built **on the server** during pipeline execution and sent to the frontend as Plotly JSON.

**Key file:** [`backend/app/services/viz.py`](backend/app/services/viz.py)

### Supported chart types

| Type | Required params | Implementation |
|------|----------------|----------------|
| `bar` | `x`, `y` | Plotly Express bar chart |
| `line` | `x`, `y` | Plotly Express line chart |
| `scatter` | `x`, `y` | Plotly Express scatter plot |
| `pie` | `x` (names), `y` (values) | Plotly Express pie chart |
| `histogram` | `x` | Plotly Express histogram |
| `heatmap` | ≥2 numeric columns | Correlation matrix heatmap |

Optional `color` parameter is passed to Plotly Express for grouped charts.

### Frontend rendering

The frontend receives `viz_specs[].figure` and renders it with `react-plotly.js`. A dark theme overlay (`withDarkTheme()` in [`frontend/src/lib/plotlyTheme.ts`](frontend/src/lib/plotlyTheme.ts)) adjusts colors, fonts, and gridlines to match the UI.

---

## Frontend Internals

### State management

All application state lives in [`frontend/src/App.tsx`](frontend/src/App.tsx) using React `useState`:

| State | Purpose |
|-------|---------|
| `sessionId` | UUID from upload; keys all API calls |
| `profile` | Dataset metadata for chat sidebar |
| `pipelineRefresh` | Counter to trigger pipeline reload after generation |
| `result` | Last execution result for the dashboard |
| `showUpload` | Toggle upload panel visibility |

Child components manage their own UI state (chat messages, React Flow nodes, form inputs).

### API client

[`frontend/src/lib/api.ts`](frontend/src/lib/api.ts) provides all backend communication:

- **axios** for REST endpoints (upload, pipeline CRUD, execute)
- **fetch** for SSE chat streaming

In development, Vite proxies `/api` to `http://localhost:8000` (configured in `vite.config.ts`).

### React Flow pipeline editor

[`frontend/src/components/PipelineCanvas.tsx`](frontend/src/components/PipelineCanvas.tsx) converts between backend `PipelinePlan` and React Flow nodes/edges:

- **`planToFlow()`** — backend plan → canvas nodes (preserves positions)
- **`flowToPlan()`** — canvas state → backend plan (captures dragged positions)

Users can drag nodes, connect edges, add new steps, and edit parameters via the `StepEditor` side panel. **Run** always saves the current canvas state first (`PATCH`), then executes (`POST /execute`).

### Typical frontend flow

```
Upload → sessionId + profile set in App
Chat   → streamChat() SSE, messages stored locally in AgentChat
Generate → generatePipeline() → pipelineRefresh++ → PipelineCanvas reloads
Edit   → local React Flow state, saved on demand or before run
Run    → updatePipeline() + executePipeline() → result set in App → VizDashboard renders
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/upload` | Upload CSV/XLSX; returns `session_id` + profile |
| `GET` | `/api/session/{id}/profile` | Get dataset metadata |
| `POST` | `/api/chat/{id}` | SSE agent chat stream |
| `POST` | `/api/pipeline/{id}/generate` | LLM pipeline generation |
| `GET` | `/api/pipeline/{id}` | Read stored pipeline |
| `PATCH` | `/api/pipeline/{id}` | Update pipeline (from editor) |
| `POST` | `/api/pipeline/{id}/execute` | Run pipeline on local data |
| `GET` | `/api/pipeline/{id}/logs` | Execution history |

---

## Configuration and Deployment

Environment variables (see [`backend/.env.example`](backend/.env.example)):

| Variable | Default | Description |
|----------|---------|-------------|
| `LITELLM_MODEL` | `gpt-4o` | LLM model identifier |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OLLAMA_API_BASE` | — | Ollama server URL for local models |
| `MAX_UPLOAD_MB` | `50` | Max upload file size |
| `MAX_ROWS` | `1,000,000` | Max rows read from file |
| `SESSION_TTL_HOURS` | `24` | Session expiry time |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `DATA_DIR` | `~/.aegis/data` | Parquet storage directory |

### Running locally

```powershell
# Backend (port 8000)
cd backend
.\setup.ps1
cp .env.example .env   # add your API key
.\run.ps1

# Frontend (port 5173)
cd frontend
npm install
npm run dev
```

### Docker

Docker Compose mounts a volume at `/root/.aegis` so Parquet files persist across container restarts. Session state (chat, pipeline) is still in-memory and lost on restart.

---

## Security Model

| Control | Implementation |
|---------|---------------|
| No arbitrary code in DSL | Whitelist of 10 step types with typed params |
| Raw data isolation | Parquet never sent to LLM |
| API key protection | Keys in server `.env` only |
| Upload limits | File size and row count caps (`MAX_UPLOAD_MB`) |
| Expression sandboxing | `compute_column` uses `pandas.eval()`, not `exec()` |
| Input validation | Pydantic models on every step param |
| Firebase Authentication | Bearer token auth for user sessions and saved pipeline owner operations |
| Webhook Secret Hashing | SHA-256 hash stored server-side; raw secret shown once and verified via `secrets.compare_digest` |
| Webhook IDOR Prevention | Missing header, wrong secret, or invalid ID return identical `404 Not Found` |
| Webhook Rate Limiting | Token bucket limiter per `pipeline_id` key (`limiter.check(f"webhook_{pipeline_id}")`) |

---

## Saved Pipelines & Webhooks

Aegis allows turning chat-generated pipelines into persistent, triggerable webhook endpoints. External tools (e.g. n8n workflows, cron jobs, or third-party backends) can trigger a saved pipeline against fresh data files.

### Secret Hashing & Verification Model

```
Secret Creation:
  raw_secret = secrets.token_urlsafe(32)
  secret_hash = sha256(raw_secret)
  Stored in DB: secret_hash ONLY (raw secret returned ONCE in creation/rotation response)

Verification:
  Header received: X-Webhook-Secret: <raw_secret>
  candidate_hash = sha256(received_raw_secret)
  Compare: secrets.compare_digest(candidate_hash, stored_secret_hash)
```

1. **Owner CRUD Operations** (`/api/pipelines/saved`):
   - Authenticated using Firebase Auth (`Bearer <token>`).
   - `POST /api/pipelines/saved`: Promotes current session pipeline state to a `SavedPipeline`.
   - `GET /api/pipelines/saved`: Lists user's saved pipelines (`pipeline_id`, `name`, `trigger_count`, `last_triggered_at`). Never includes secret or hash.
   - `POST /api/pipelines/saved/{id}/rotate-secret`: Invalidates old secret and returns a newly generated raw secret.
   - `DELETE /api/pipelines/saved/{id}`: Permanently deletes saved pipeline and invalidates its webhook.

2. **Trigger Endpoint** (`POST /api/webhooks/{pipeline_id}/trigger`):
   - Unauthenticated execution endpoint designed for external service calls.
   - Expects `X-Webhook-Secret` header containing the raw secret string.
   - Accepts multipart data file (`file=@your_data.csv`).
   - Runs rate limit check (`webhook_{pipeline_id}`).
   - Ingests dataset, executes stored pipeline DSL steps, updates statistics (`trigger_count`, `last_triggered_at`), cleans up transient session data, and returns execution result JSON.

### Triggering via External Tools (n8n, Cron, curl)

**Example `curl` call:**
```bash
curl -X POST "https://your-aegis-domain.com/api/webhooks/<PIPELINE_ID>/trigger" \
  -H "X-Webhook-Secret: <YOUR_WEBHOOK_SECRET>" \
  -F "file=@/path/to/fresh_data.csv"
```

**Response JSON:**
```json
{
  "status": "success",
  "pipeline_id": "b3a1f...",
  "pipeline_name": "Weekly Sales Aggregator",
  "row_count": 1420,
  "columns": ["region", "total_sales"],
  "preview": [
    { "region": "North America", "total_sales": 52100.50 }
  ],
  "viz_specs": [...],
  "execution_log": [...]
}
```

### How External Tools & Users Utilize Webhook Payloads

The JSON returned by the trigger webhook contains structured, transformed records and ready-to-render chart figures. Key integration patterns include:

#### 1. Slack / Teams / Email Automated Alerts (n8n, Zapier, Make)
- **Workflow:** An n8n workflow or cron job posts daily/weekly CSV files to the Aegis webhook endpoint.
- **Usage:** Extract summary metrics from `preview` (e.g. `total_revenue` or `order_date`) and format an executive alert sent to Slack, Microsoft Teams, or email.
- **Example Message:**
  > 📊 **Sales Intelligence Alert**  
  > Processed 46 daily records. Peak Revenue: **$11,779.05** (2024-01-28).

#### 2. Live Interactive Chart Rendering in Custom Web Portals
- **Workflow:** Web applications, internal portals (Next.js, React, Retool, Notion embeds), or custom dashboards call the webhook API.
- **Usage:** Pass `viz_specs[i].figure` straight into `react-plotly.js` or Plotly.js without needing to recalculate aggregations or re-build chart parameters:
  ```jsx
  import Plot from 'react-plotly.js';

  <Plot
    data={response.viz_specs[0].figure.data}
    layout={response.viz_specs[0].figure.layout}
  />
  ```

#### 3. Headless ETL & Database / Data Warehouse Ingestion
- **Workflow:** Aegis acts as a **headless AI-built ETL engine**. Non-technical users design data pipelines in conversational natural language, and backend jobs execute them on fresh data files.
- **Usage:** Extract `preview` objects (`order_date`, `total_revenue`) and execute `BULK INSERT` into relational databases (PostgreSQL, MySQL), data warehouses (BigQuery, Snowflake), or Google Sheets.

#### 4. Automated PDF / Executive Report Generation
- **Workflow:** Weekly scheduled Python or Node.js jobs call the webhook.
- **Usage:** Combine `preview` table records and rendered `viz_specs` chart images into PDF reports via Puppeteer or ReportLab and distribute them via email to executive stakeholders.

#### Webhook Payload Schema Reference

| Field | Description | Primary Integration Purpose |
|---|---|---|
| `row_count` | Total rows output by the final step | Audit logging, threshold alerts, dataset sizing checks |
| `columns` | List of output column names | Table schema mapping, dynamic UI header rendering |
| `preview` | List of record objects (up to 50 preview rows) | Database insertion, Slack notifications, CSV export |
| `viz_specs` | Pre-calculated Plotly JSON charts (`figure.data`, `figure.layout`) | Direct chart rendering in React/Vue/HTML dashboards |
| `execution_log` | Per-step execution timings and row transformations | Pipeline health monitoring, performance auditing |

---

## Known Limitations

1. **Single-process sessions** — in-memory store does not scale across multiple server instances without external session/storage.
2. **Multi-input merge not supported** — forked branches work, but steps with multiple parents cannot combine data yet.
3. **Session volatility** — chat history and pipeline plans are lost on server restart (only Parquet survives if `DATA_DIR` is persisted).
4. **GPT-optimized structured output** — pipeline generation works best with OpenAI models; other providers rely on manual JSON parsing with retry.
5. **Frontend chat not synced** — the frontend keeps its own message list for display; the authoritative chat history is on the server session.

---

## Key Source Files

| File | Role |
|------|------|
| `backend/app/main.py` | FastAPI app entry, CORS, router mounting |
| `backend/app/config.py` | Environment configuration |
| `backend/app/api/upload.py` | File upload endpoint |
| `backend/app/api/chat.py` | SSE chat endpoint |
| `backend/app/api/pipeline.py` | Pipeline CRUD, generate, execute, logs |
| `backend/app/api/saved_pipelines.py` | Owner CRUD & secret rotation for saved pipelines |
| `backend/app/api/webhooks.py` | Unauthenticated webhook trigger endpoint |
| `backend/app/services/saved_pipeline_store.py` | Firestore + in-memory store for saved pipelines |
| `backend/app/models/saved_pipeline.py` | SavedPipeline model & SHA-256 secret hashing |
| `backend/app/services/agent.py` | LiteLLM chat + pipeline generation |
| `backend/app/services/executor.py` | pandas pipeline execution |
| `backend/app/services/viz.py` | Plotly chart builder |
| `backend/app/services/session.py` | Session store + Parquet I/O |
| `backend/app/services/schema_analyzer.py` | Metadata extraction (privacy boundary) |
| `backend/app/models/pipeline.py` | DSL types and validation |
| `frontend/src/App.tsx` | Root layout and state |
| `frontend/src/lib/api.ts` | Backend HTTP/SSE client |
| `frontend/src/components/PipelineCanvas.tsx` | React Flow editor |
| `frontend/src/components/SavedPipelinesModal.tsx` | Webhook pipeline manager & secret copy UI |
| `frontend/src/components/VizDashboard.tsx` | Results display |

---

*This document reflects the architecture as of the current codebase. For setup instructions, see [README.md](../README.md).*

