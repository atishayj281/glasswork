# Glasswork - Agentic Data Platform

An agentic data analysis platform that accepts CSV/Excel uploads, analyzes dataset metadata (headers only - no raw row data sent to the LLM), converses with users to understand their goals, generates editable data processing pipelines, and renders insights with interactive visualizations.

## 🎥 Project Demo

[![Project Demo](https://img.youtube.com/vi/khJ0D1FrWKY/maxresdefault.jpg)](https://www.youtube.com/watch?v=khJ0D1FrWKY)

> Click the thumbnail above to watch the complete project demonstration.

## Features

- **Privacy-first analysis** - The AI agent only sees column names, types, null rates, and row counts
- **Conversational intent gathering** - Chat with the agent to describe what you want to analyze
- **Visual pipeline editor** - React Flow canvas with drag-and-drop, editable step parameters
- **10 pipeline operations** - filter, groupby, sort, visualize, and more
- **Persistent Saved Webhooks** - Save pipelines and trigger them via external tools (n8n, Zapier, cron) against fresh data files
- **Execution transparency** - Step-by-step logs showing row counts at each stage
- **Interactive charts** - Plotly-powered bar, line, scatter, pie, histogram, and heatmap charts
- **Provider-agnostic LLM** - Switch models via LiteLLM (OpenAI, Anthropic, Ollama, etc.)

## Architecture

```
┌──────────────┬─────────────────────────────┐
│  Agent Chat  │   Pipeline Canvas (React Flow) │
│  (left)      │   (center)                     │
├──────────────┴─────────────────────────────┤
│  Results: Charts + Table Preview + Logs     │
└─────────────────────────────────────────────┘
```

**Backend:** FastAPI + pandas + LiteLLM + Plotly  
**Frontend:** React + TypeScript + React Flow + Plotly.js

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- An LLM API key (OpenAI, Anthropic, or local Ollama)

### Backend

```powershell
cd backend

# One-time setup (creates .venv and installs deps)
.\setup.ps1

# Copy and edit env
cp .env.example .env

# Run (always uses .venv - not global Python)
.\run.ps1
```

Or manually:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000
```

> **Important:** Always use `backend\.venv` for Python packages. Do not `pip install` globally.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Docker

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your API key

docker compose up --build
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LITELLM_MODEL` | `gpt-4o` | LLM model (e.g. `claude-3-5-sonnet`, `ollama/llama3`) |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `OLLAMA_API_BASE` | - | Ollama server URL for local models |
| `MAX_UPLOAD_MB` | `50` | Max file upload size |
| `SESSION_TTL_HOURS` | `24` | Session expiry |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |

## Usage Flow

1. **Upload** a CSV or Excel file
2. **Chat** with the agent - describe what insights you need
3. **Generate Pipeline** - the agent creates a visual processing DAG
4. **Edit** - click any node to modify parameters, add/remove steps
5. **Run** - execute the pipeline and view charts, data preview, and step logs
6. **Save as Webhook** - make the pipeline persistent and triggerable via external tools
7. **Iterate** - ask the agent to revise, edit the pipeline, and re-run

## Saved Pipelines & Webhooks

You can turn any chat-generated pipeline into a persistent webhook endpoint.

```bash
# Example curl call to trigger a saved pipeline against fresh data
curl -X POST "http://localhost:8000/api/webhooks/<PIPELINE_ID>/trigger" \
  -H "X-Webhook-Secret: <YOUR_WEBHOOK_SECRET>" \
  -F "file=@/path/to/fresh_data.csv"
```

For full setup guides, n8n HTTP Request node configuration details, and JSON response payload schemas, see [docs/WEBHOOKS.md](docs/WEBHOOKS.md).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload CSV/XLSX file |
| GET | `/api/session/{id}/profile` | Get dataset profile |
| POST | `/api/chat/{id}` | SSE agent chat stream |
| POST | `/api/pipeline/{id}/generate` | Generate pipeline from chat |
| GET/PATCH | `/api/pipeline/{id}` | Read/update pipeline |
| POST | `/api/pipeline/{id}/execute` | Execute pipeline |
| GET | `/api/pipeline/{id}/logs` | Execution history |
| POST | `/api/pipelines/saved` | Save active pipeline as persistent webhook |
| GET | `/api/pipelines/saved` | List user's saved pipelines |
| DELETE | `/api/pipelines/saved/{id}` | Delete saved pipeline |
| POST | `/api/pipelines/saved/{id}/rotate-secret` | Rotate webhook secret key |
| POST | `/api/webhooks/{id}/trigger` | Trigger saved pipeline with fresh dataset |

## Pipeline Step Types

| Type | Description |
|------|-------------|
| `filter` | Filter rows by column condition |
| `select_columns` | Keep specific columns |
| `rename` | Rename columns |
| `fill_na` | Fill missing values |
| `cast_type` | Convert column types |
| `groupby_agg` | Group and aggregate |
| `sort` | Sort by columns |
| `deduplicate` | Remove duplicate rows |
| `compute_column` | Add computed column |
| `visualize` | Generate chart |

## Security

- Pipeline DSL uses a whitelist of operations - no arbitrary code execution
- `compute_column` uses pandas `eval` with restricted scope
- Raw data never sent to the LLM
- Webhook secret verification uses constant-time string comparison (`secrets.compare_digest`) with SHA-256 server-side secret hashing
- API keys stored server-side only
- File size and row limits enforced

