# reeve-web

Owner app, owner studio and developer studio (Vite + React).

Vite + React dashboard. Palette: the calm MP076 set (navy ground, Spring #DBE64C as the one accent).

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173` and proxies `/api` to `:8787`. Sections mirror the pipeline:
01 Describe (SOP) · 02 Compile (rule cards + Builder's questions) · 03 Simulate & audit (live glass box, verdict, generated `rules.py`)
· 04 Result (30 rooms × 30 days timeline) · 05 Approve (owner passkey) · 06 Prove (hash-chained ledger, Merkle root).

Views: `?view=studio` (owner studio, iOS style), `?view=owner` (owner app for phones),
`?view=apps` (connect apps), `?view=studio-pro` (developer studio). Start reeve-api on `:8787` first.

## The Reeve repos

| Repo | What it holds |
|---|---|
| [reeve-core](https://github.com/Reeve-Agents/reeve-core) | Shared domain model: rulebook schemas, domain packs, simulation views and the sample businesses. |
| [reeve-connectors](https://github.com/Reeve-Agents/reeve-connectors) | Connectors: Composio toolkits and MCP servers the broker acts through, plus CSV and app record readers. |
| [reeve-payments](https://github.com/Reeve-Agents/reeve-payments) | Payment rails (Stripe, Xendit, mock) the broker bills through, test mode only. |
| [reeve-runtime](https://github.com/Reeve-Agents/reeve-runtime) | The Python agent runtime that runs compiled rules inside the sandbox. |
| [reeve-api](https://github.com/Reeve-Agents/reeve-api) | Backend: HTTP API, Builder, Auditor, pipeline, sandbox, broker, receipts ledger, on-chain anchor and the CLI. |
| [reeve-web](https://github.com/Reeve-Agents/reeve-web) | Owner app, owner studio and developer studio (Vite + React). |
| [reeve-landing](https://github.com/Reeve-Agents/reeve-landing) | Landing page (Vite + React + GSAP). |

```
reeve-web ─┐                      ┌─ reeve-connectors (MCP, Composio)
reeve-landing ─┼─ reeve-core ─ reeve-api ─┼─ reeve-payments (Stripe, Xendit)
               │   (schemas,       │      └─ reeve-runtime (Python, submodule)
               │    packs,         │
               │    fixtures)      └─ /api over HTTP ── reeve-web
```

## Working across repos

Shared packages are installed straight from GitHub (`"@reeve/core": "github:Reeve-Agents/reeve-core#main"`) and pinned by
`package-lock.json`. After a change lands in one of them, pull it in with:

```bash
npm update @reeve/core
```

To edit two repos side by side, clone them next to each other and link the local copy:

```bash
npm install ../reeve-core --no-save
```
