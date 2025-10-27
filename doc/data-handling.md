# Data Handling & Privacy Guide

This document explains **how participant data flows through the app**, how to **store it safely without Google services**, and how to meet common **ethics/GDPR** requirements. It is written for maintainers of this repository.

---

## 1) Summary (TL;DR)

- **Current state**: Data is posted to a Google Sheets endpoint.  
- **Required change**: Migrate off Google to a university-approved or neutral stack.  
- **Recommended approach**: Host a small HTTPS API that accepts JSON rows from the client and writes to a **database** (e.g., Postgres) or an **append-only object store** (e.g., S3-compatible).  
- **Privacy**: The app already uses **anonymous participant IDs** (PID) and avoids collecting names/emails/IPs on purpose. Keep it that way.  
- **Reliability**: The client **buffers logs** in memory/localStorage and flushes asynchronously (including `sendBeacon` on pagehide). Keep/extend this pattern.  
- **Security**: Use HTTPS, CORS allowlist, a **server-side token**, request size caps, rate limits, and input validation.

You can implement the server in any stack. This guide includes reference implementations for:
- **Express (Node.js)** with Postgres *(full control, straightforward)*
- **Cloudflare Workers** with Durable Objects / KV *(lightweight, serverless, EU regions available)*
- **Vercel/Netlify serverless functions** with Supabase *(fast to ship, no Google)*

---

## 2) Data Model & Dictionary

The client sends **event rows** representing trials and UI interactions. You can store them as **JSON** or flatten to tables. Below is a representative schema based on the codebase (`/src/logging/build.js` and trial payloads). You may extend as needed.

### 2.1 Event (generic row)
| Field | Type | Required | Notes |
|---|---|---:|---|
| `participant_id` | string | ✓ | Generated client-side (`CONFIG.participant_id`), e.g. `R7ABCD123`. Anonymous by design. |
| `condition_id` | string \| null |  | Optional between-subjects condition label. |
| `review_condition` | string \| null |  | One of 7 labels (`very_positive`…`very_negative`). Frozen for session consistency. |
| `trial_type` | string | ✓ | e.g., `door_trial`, `training_demo`, `trust40_pre`, `trust_probe`, `demographics`, etc. |
| `event_type` | string | ✓ | Semantic label within a trial type, e.g., `door_trial`, `reputation_item`, `reputation_probe`. |
| `ts_client` | number | ✓ | `Date.now()` at send time (ms). |
| `rt_s` | number \| null |  | Reaction time in seconds (where applicable). |
| `payload` | object |  | Trial-specific content (see below). |
| `user_agent` | string |  | From `navigator.userAgent` if you choose to store; consider hashing or omitting. |
| `is_fullscreen` | boolean \| null |  | Recorded by many trials. |
| `set_id` | string \| null |  | Optional named asset set. |

> **Note**: Do **not** store IP addresses. Configure your reverse proxy to omit/strip them from logs or rotate them via privacy-friendly analytics where allowed by your ethics board.

### 2.2 Trial-specific payloads (examples)

- **Door trial (`doorTrial.js`)**  
  ```
  {
    "choice": "left" | "right",
    "reaction_time_s": number,
    "correct": boolean,
    "suggestion": "left" | "right",
    "buffer_ms": number | null,
    "drone_anim_ms": number | null,
    "timed_out": boolean,
    "decision_timeout_ms": number | null,
    "timer_action": "auto_follow" | "none",
    "risk_key": "low" | "medium" | "high" | "extreme" | null,
    "risk_warmth": "cool" | "neutral" | "warm" | "hot" | null,
    "shake_amp_px": number,
    "shake_period_ms": number | null,
    "risk_value": number | null
  }
  ```

- **Questionnaires (trust14, trust40)**
  ```
  {
    "trust40_total_percent": number,
    "trust40_scored_vector": number[],
    "trust40_raw": object,
    "trust40_order": string[]
  }
  ```

- **Reputation probe (`reputation.js`)**
  ```
  {
    "review_ids": "comma-separated",
    "review_tones": "comma-separated",
    "review_avatars": "comma-separated",
    "reputation_probe_delta": -2..+2
  }
  ```

- **Demographics (`demographics.js`)**
  ```
  {
    "gender_option": "woman" | "man" | "non-binary" | "prefer_not_to_say" | "self_describe",
    "gender_self_desc": string,
    "age_range": "18-24" | "25-34" | ... | "prefer_not_to_say"
  }
  ```

Store demographics in a **separate table** (linked by `participant_id`) to simplify access control or allow deletion without touching task logs.

---

## 3) Client → Server Contract

### 3.1 Endpoint
```
POST /api/log
Content-Type: application/json
Authorization: Bearer <INGEST_TOKEN>    (recommended)
```

### 3.2 Request Body
```
{
  "participant_id": "R7ABCD123",
  "batch": [ { <event row> }, { ... }, ... ],
  "sdk": "web",
  "sdk_version": "1.0.0"
}
```
- The client **batches** multiple rows. Size cap: e.g., `~128 KB` per request.

### 3.3 Responses
- `202 Accepted` on success (asynchronous persistence OK).
- `400` on validation error (with message).
- `401/403` on auth failure.
- `413` if body too large.
- `429` if rate-limited.
- `5xx` on server errors (client will retry later).

### 3.4 Retries
Client already calls `scheduleFlush(0)` when back online/hidden and uses `sendBeacon` on `pagehide`. Keep the **idempotent** server behavior (e.g., de-duplicate by `(participant_id, ts_client, trial_type, event_type, hash)` if needed).

---

## 4) Reference Server Implementations

Choose **one** approach that your ethics committee approves and your group can maintain.

### Option A — Express + Postgres (TU-hosted VM or PaaS)
- Pros: Full control, mature tooling, EU regions easy.
- Cons: You manage updates, backups, patches.

**Dependencies**
- Node 18+
- Postgres (e.g., managed by Aiven/Neon/Render in EU regions)

**env**
```bash
# .env
PORT=8080
INGEST_TOKEN=change-me-long-and-random
DATABASE_URL=postgres://user:pass@host:5432/dbname?sslmode=require
```

**SQL**
```sql
create table if not exists events (
  id bigserial primary key,
  participant_id text not null,
  trial_type text not null,
  event_type text not null,
  ts_client bigint not null,
  payload jsonb not null,
  condition_id text,
  review_condition text,
  set_id text,
  user_agent text,
  is_fullscreen boolean,
  inserted_at timestamptz not null default now()
);

create table if not exists demographics (
  id bigserial primary key,
  participant_id text not null,
  payload jsonb not null,
  inserted_at timestamptz not null default now()
);

create index if not exists idx_events_pid on events(participant_id);
create index if not exists idx_events_ts on events(ts_client);
```

**server.js**
```js
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { sql } from '@neondatabase/serverless'; // or pg/Piscina/pg-promise

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '256kb' }));

const limiter = rateLimit({ windowMs: 60_000, max: 300 });
app.use('/api/', limiter);

function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const [, token] = hdr.split(' ');
  if (token && token === process.env.INGEST_TOKEN) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

app.post('/api/log', auth, async (req, res) => {
  try {
    const { participant_id, batch } = req.body || {};
    if (!participant_id || !Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ ok: false, error: 'invalid payload' });
    }
    // Basic validation + insert
    const rows = batch.map(r => ({
      participant_id,
      trial_type: String(r.trial_type || ''),
      event_type: String(r.event_type || ''),
      ts_client: Number(r.ts_client || Date.now()),
      payload: r.payload || r, // store entire row if you prefer
      condition_id: r.condition_id ?? null,
      review_condition: r.review_condition ?? null,
      set_id: r.set_id ?? null,
      user_agent: r.user_agent ?? null,
      is_fullscreen: typeof r.is_fullscreen === 'boolean' ? r.is_fullscreen : null
    }));

    // Insert in a single statement (Neon/pg supports JSON parameterization)
    await sql`
      insert into events (
        participant_id, trial_type, event_type, ts_client, payload,
        condition_id, review_condition, set_id, user_agent, is_fullscreen
      )
      select
        x->>'participant_id', x->>'trial_type', x->>'event_type',
        (x->>'ts_client')::bigint, x->'payload',
        x->>'condition_id', x->>'review_condition', x->>'set_id',
        x->>'user_agent', (x->>'is_fullscreen')::boolean
      from json_array_elements(${JSON.stringify(rows)}::json) as x;
    `;

    return res.status(202).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.listen(process.env.PORT || 8080, () => {
  console.log('Ingest server running on', process.env.PORT || 8080);
});
```

> Swap `@neondatabase/serverless` for `pg` if you run a standard Postgres.

---

### Option B — Cloudflare Worker + KV / D1
- Pros: No server to manage, **EU colo presence**, high uptime.
- Cons: Quotas; D1 (SQLite) still evolving.

**wrangler.toml**
```toml
name = "hri-ingest"
main = "src/worker.js"
compatibility_date = "2024-10-01"

[vars]
INGEST_TOKEN = "change-me-long-and-random"

[[kv_namespaces]]
binding = "LOGS"
id = "KV_ID_GOES_HERE"
```

**src/worker.js**
```js
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/api/log' || req.method !== 'POST') {
      return new Response('Not found', { status: 404 });
    }
    const auth = req.headers.get('authorization') || '';
    const token = auth.split(' ')[1] || '';
    if (token !== env.INGEST_TOKEN) return new Response('unauthorized', { status: 401 });

    let body;
    try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
    const { participant_id, batch } = body || {};
    if (!participant_id || !Array.isArray(batch) || !batch.length) {
      return new Response('invalid payload', { status: 400 });
    }
    const key = `logs:${participant_id}:${Date.now()}`;
    await env.LOGS.put(key, JSON.stringify(batch), { expirationTtl: 60 * 60 * 24 * 365 });
    return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'content-type':'application/json' } });
  },
};
```

> You can later ETL from KV to Postgres for analysis.

---

### Option C — Vercel/Netlify Function + Supabase
- Pros: Fast developer experience, EU regions available, excellent Postgres UI.
- Cons: You still own data governance (good for non-Google requirement).

Create an API route (e.g., `/api/log.ts`) and use Supabase’s service role key **only on the server**.

**/api/log.ts (Vercel example)**
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.split(' ')[1] || '';
  if (token !== process.env.INGEST_TOKEN) return NextResponse.json({ ok:false }, { status: 401 });

  let body; try { body = await req.json(); } catch { return NextResponse.json({ ok:false }, { status: 400 }); }
  const { participant_id, batch } = body || {};
  if (!participant_id || !Array.isArray(batch) || !batch.length) {
    return NextResponse.json({ ok:false }, { status: 400 });
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!);
  const rows = batch.map(r => ({
    participant_id,
    trial_type: r.trial_type || null,
    event_type: r.event_type || null,
    ts_client: r.ts_client || Date.now(),
    payload: r, // or r.payload
  }));
  const { error } = await supabase.from('events').insert(rows);
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true }, { status: 202 });
}
```

---

## 5) Client Changes (migrating off Google Sheets)

1. **Replace** the existing `LOG_ENDPOINT` (GAS URL) with your new endpoint, e.g.:
   ```js
   export const LOG_ENDPOINT = 'https://your-domain.edu/api/log';
   export const INGEST_TOKEN = 'public-ingest-token-or-empty';
   ```
   - If you include a token, add the header `Authorization: Bearer <token>` in `/src/logging/index.js` or wherever you `fetch`.
2. Ensure **CORS** allows your GitHub Pages origin (or custom domain).
3. Keep using the **batching + `sendBeacon` fallback** already implemented (`flushSyncBeacon()` on `pagehide`).

### Example `fetch` call (client)
```js
await fetch(LOG_ENDPOINT, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(INGEST_TOKEN ? { 'authorization': `Bearer ${INGEST_TOKEN}` } : {})
  },
  body: JSON.stringify({
    participant_id: CONFIG.participant_id,
    batch: window.__LOG_BUFFER__,
    sdk: 'web',
    sdk_version: '1.0.0'
  }),
  keepalive: true // allows in-flight during unload
});
```

---

## 6) Security & Privacy Controls

- **HTTPS everywhere**. Redirect HTTP→HTTPS.
- **No IPs**, no cookies, no fingerprinting. If your reverse proxy logs IPs, configure truncation/anonymization.
- **Access control**: Bearer token for ingestion, scoped to `POST /api/log` only. Rotate regularly.
- **CORS**: Allowlist your production origin(s) only.
- **Rate limiting**: e.g., 300 req/min per IP/participant to absorb retries without abuse.
- **Request size**: Cap at `256 KB`.
- **Validation**: Verify fields and types. Reject unknown keys if you need strict schemas.
- **At-rest encryption**: Enable disk encryption (managed Postgres generally does this). For object stores, require SSE (server-side encryption).
- **Backups**: Daily automated backups, 30–90 day retention.
- **Audit**: Log server-side insert failures and counts (not participant content beyond necessary).

---

## 7) GDPR/Ethics Checklist

- [ ] **Purpose**: “Measure decision making and trust in SAR scenarios.”  
- [ ] **Legal basis**: Informed consent (collected on first screen).  
- [ ] **Data minimization**: Only store task data and minimal device context required for quality control (fullscreen flag).  
- [ ] **No direct identifiers**: No names/emails/IPs. `participant_id` is random.  
- [ ] **Right to withdraw**: Early exit lets participants **discard** data before completion. After completion, data is anonymous and **cannot be removed** (explain clearly — already done in consent text).  
- [ ] **Storage location**: EU-based servers/services; document provider and DPA (Data Processing Agreement) if external.  
- [ ] **Retention**: Define a retention period (e.g., keep raw logs for 2 years; publish aggregated results only).  
- [ ] **Access control**: Only study team members; use per-user database accounts or role-based access.  
- [ ] **Incident response**: Have a contact and protocol for deletion of a dataset snapshot if something goes wrong.  
- [ ] **Data Sharing**: If you share de-identified datasets publicly, remove demographics and any potentially identifying metadata (**k-anonymity** checks).

---

## 8) Testing & Verification

### 8.1 Manual test
```bash
curl -i -X POST https://your-domain.edu/api/log \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -d '{
    "participant_id": "RTEST123",
    "batch": [
      {"trial_type":"ping","event_type":"ping","ts_client": 1730000000000, "payload":{"hello":true}}
    ]
  }'
```

### 8.2 Simulate client unload
- Open the app, start the task, then close the tab/window during a trial.  
- Confirm the server **still receives a final `sendBeacon` batch**.

### 8.3 Data inspection
- Check that **no PII** (names/emails/IPs) are present.  
- Verify that **demographics** landed in the right table (if separated).

---

## 9) Migration Plan (off Google Sheets)

1. Stand up one of the **reference servers** above (or another non-Google equivalent) in the EU.
2. Create database tables and apply migrations.
3. Configure **CORS** to allow your production origin.
4. Set `LOG_ENDPOINT` in the client (`/src/logging/index.js`) to the new URL.
5. Generate and set an **INGEST_TOKEN** on both server and client.
6. Run **end-to-end tests** (Steps 8.1–8.3).
7. Remove Google Sheets code and secrets from the repo & CI.
8. Update the documentation and ethics protocol with the new data path.

---

## 10) Appendix: Alternate Storage Patterns

- **Append-only object store** (MinIO/S3): Store batches as timestamped objects (`logs/pid/timestamp.json`). Nightly ETL to Postgres for analysis. Pros: simple, cheap, immutable. Cons: Need ETL for querying.
- **Timeseries DB** (ClickHouse): Great for large-scale events; EU cloud options exist. Cons: Overkill for small studies.
- **CSV rotation**: Server writes newline-delimited JSON or CSV. Use logrotate + checksums. Pros: extremely simple. Cons: manual analysis overhead.

---

## 11) Maintenance Tips

- Record exact **app commit hash** and **config** as part of each batch (you already add `seed`, `config_*` in `main.js` — keep it!).
- Tag releases in Git; keep a **CHANGELOG** whenever the logging schema changes.
- Run a **dry-run schema validator** server-side; reject unknown breaking changes during active data collection.

---

**Contacts**
- Study Lead: *Your Name / Supervisor*  
- Data steward: *Your IT contact*  
- Security incident: *Security@your-university.edu*

