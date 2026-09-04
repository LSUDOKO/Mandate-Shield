# @mandate-shield/mcp-server

The bridge between an MCP client (Claude Desktop, or anything else speaking the
protocol) and the Mandate Shield pipeline.

Claude does the shopping. It does not decide whether the payment is authorized:
the five deterministic checks in `@mandate-shield/core` do, and no model is in
that path.

## Running it

```bash
npm install && npm run build
npm run mcp          # stdio, what Claude Desktop starts
npm run mcp:dev      # same thing from TypeScript source
npm run mcp:http     # HTTP transport on :3100/mcp, for web clients
```

Every credential is optional. With no `GROQ_API_KEY` the agent parses intent
deterministically instead of with a model; with no Razorpay keys the gateway
runs an in-process mock and no real money moves. The verification engine is
identical either way, and the startup line on stderr says which modes are live.

To connect Claude Desktop, copy `claude_desktop_config_example.json` at the
repository root into your Claude Desktop config and set the absolute path.

## Tools

| Tool | What it does |
| --- | --- |
| `search_products` | Searches the catalog. Returns products and a `sessionId`. |
| `initiate_purchase` | Drafts, seals, verifies and settles one SKU. |
| `get_transaction_status` | Full record for a transaction this process handled. |
| `get_audit_log` | Recent decisions and the hash chain's integrity. |

### Why a session id

`search_products` records which SKUs it actually returned, and
`initiate_purchase` refuses a SKU that was not among them. Without that a client
could name any SKU and nothing would record what was on screen when the choice
was made.

### Why the instruction matters

`initiate_purchase` takes the user's own words, and Check 2 reads them to decide
which fields the user actually stated. A merchant the agent picked is
`agent_inferred`, and an inferred merchant is not authorization — that purchase
blocks. This is deliberate: an agent that quietly chooses who gets paid is the
thing being defended against.

## What a BLOCK means

Not a failed payment. The verifier refused to let the *agent* authorize it, and
the gateway returns a payment link so the person can complete the purchase
themselves under normal UPI PIN authorization. The agent is removed from the
loop; the customer is not.

## Two caveats worth stating

- The audit ledger is in-memory. Chaining and tamper-evidence are real for the
  life of the process; durability across restarts is not. `get_audit_log` says
  so in its response rather than implying otherwise.
- `--sse` selects Streamable HTTP, not the SSE transport. The flag name is kept
  for compatibility, but the MCP SDK deprecated `SSEServerTransport`, and
  shipping it would leave current web clients unable to connect.
