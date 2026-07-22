# Aegis Webhooks Guide

Aegis allows turning any chat-generated data processing pipeline into a persistent, webhook-triggerable API endpoint. External automation tools (such as n8n, Make, Zapier, cron jobs, or custom backends) can trigger a saved pipeline against fresh data files.

---

## 1. How to Save a Pipeline

1. **Upload & Chat**: Upload a dataset and converse with the Aegis AI agent to generate and refine your data processing pipeline on the visual canvas.
2. **Click "⚡ Save Webhook"**: Click the **Save Webhook** button in the canvas toolbar or header.
3. **Copy Secret Key**: A unique **Webhook Secret Key** will be generated and shown **once**. Copy and store this secret securely in your password manager or environment variables.

---

## 2. Triggering via `curl`

Send a `POST` request with your data file attached as `multipart/form-data` and include your secret key in the `X-Webhook-Secret` header:

```bash
curl -X POST "http://localhost:8000/api/webhooks/<PIPELINE_ID>/trigger" \
  -H "X-Webhook-Secret: <YOUR_WEBHOOK_SECRET>" \
  -F "file=@/path/to/sales_data_q1.csv"
```

### Example Response Payload

```json
{
  "status": "success",
  "pipeline_id": "6b02c698-321d-4611-9513-8c746c7dddfa",
  "pipeline_name": "Q1 2024 Comprehensive Sales Intelligence Analysis",
  "row_count": 46,
  "columns": [
    "order_date",
    "total_revenue"
  ],
  "preview": [
    {
      "order_date": "2024-01-07",
      "total_revenue": 6362.1
    },
    {
      "order_date": "2024-01-11",
      "total_revenue": 3797.92
    }
  ],
  "viz_specs": [
    {
      "step_id": "v1",
      "chart_type": "bar",
      "title": "Total Revenue by Region",
      "figure": {
        "data": [...],
        "layout": {...}
      }
    }
  ],
  "execution_log": [
    {
      "step_id": "s1",
      "step_type": "filter",
      "label": "Filter Q1",
      "rows_in": 100,
      "rows_out": 46,
      "duration_ms": 1.2
    }
  ]
}
```

---

## 3. Triggering via n8n (HTTP Request Node)

To integrate Aegis saved webhooks into an **n8n** workflow:

### n8n Node Configuration

* **Node Name:** `Trigger Aegis Pipeline`
* **Node Type:** `HTTP Request`
* **Method:** `POST`
* **URL:** `http://your-aegis-host:8000/api/webhooks/<PIPELINE_ID>/trigger`
* **Authentication:** `None` (Authentication is handled via the header)

#### Headers Section
* **Header 1:**
  * **Name:** `X-Webhook-Secret`
  * **Value:** `<YOUR_WEBHOOK_SECRET>` (or n8n expression `={{ $json.webhook_secret }}`)

#### Body Section
* **Send Body:** Enabled / `True`
* **Body Content Type:** `Form-Data` (Multipart)
* **Specify Body Parameters:** `Using Fields Below`
* **Form-Data Parameter 1:**
  * **Parameter Type:** `Form Data Item`
  * **Name:** `file`
  * **Input Data Field Name:** `data` (The n8n binary property name containing your uploaded CSV/Excel file, e.g. `$binary.data`)

---

## 4. Downstream Usage Patterns

- **Slack / Teams Alerts**: Extract summary values from `preview` to send daily digests.
- **Custom Portals & Dashboards**: Pass `viz_specs[i].figure` directly into `Plotly.newPlot()` or `<Plot />` components.
- **Database / Data Warehouse Sync**: Bulk insert `preview` objects into PostgreSQL, BigQuery, or Snowflake.
