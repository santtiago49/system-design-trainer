# System Design Trainer

A whiteboard for practicing system design interviews. Pick a prompt ("How would you build
the infrastructure for 1M users?"), drag AWS or Azure components onto the canvas, connect
them, and watch a live capacity model show how many users each component can support.
When you're ready, Jev grades the design like an interviewer would.

## Run

```bash
npm install
cp .env.example .env.local   # add TYPESAFE_API_KEY for real Jev answers
npm run dev
```

Without a key, Jev calls fall back to a clearly labeled mock.

## Azure import (prototype)

Reads a real subscription onto the canvas with "Sign in with Microsoft": the app calls Azure Resource
Manager on the signed-in user's behalf, read-only, and sees only what that user can see.

Set these in `.env.local` and restart `npm run dev`:

```
AZURE_CLIENT_ID=<Application (client) ID of the Entra ID app>
AZURE_CLIENT_SECRET=<a client secret of that app>
# Optional; must match the redirect URI registered on the app.
AZURE_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

The app registration is multi-tenant, with a Web redirect URI of `http://localhost:3000/api/auth/callback`
and the delegated permission **Azure Service Management → user_impersonation**. In the app, open **Integrations** in the side rail, sign in with Microsoft, and import a subscription. Sessions live in server
memory, so a restart means signing in again.

## Levels

15 levels in 4 chapters (`lib/levels.ts`). Each has a brief, a fixed number of users and objectives
checked by the Run: clearing every required objective earns 1 star and each bonus objective one more.
Stars give XP and a rank; progress is kept in the browser. Chapter 4 rebuilds reference architectures
from the [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/browse/) and
links to the original once you clear the level. Free play keeps the open whiteboard.

## How it works

- **Canvas**: [React Flow](https://reactflow.dev) (`@xyflow/react`). Designs are saved per scenario in localStorage.
- **Capacity model** (`lib/simulate.ts`): deterministic code, no AI. Peak load comes from the
  scenario (DAU × requests/day ÷ 86,400 × peak factor), split into reads and writes, and is pushed
  from Users through the graph:
  - CDNs absorb the scenario's edge-cacheable share.
  - Caches absorb reads by hit rate, both as a sibling (cache-aside) and in line.
  - Queues take writes off the synchronous path and smooth them to the average rate.
  - Siblings of the same kind split load evenly (e.g. LB → two app groups).
  - SQL writes are capped by one primary; NoSQL writes scale with partitions.

  Each node shows utilization and "supports ~N users" (`users ÷ utilization`); the system
  supports what its bottleneck supports. It also estimates availability and cost and flags
  SPOFs, missing load balancers, and clients talking straight to databases.
- **Jev** (`lib/server/jev.ts`, via `@typesafe-ai/sdk`) handles the judgments code can't make:
  - *Evaluate*: Score questions for scalability, reliability, data design, and your written
    explanation; a Choice for what to improve next; one Noul per scenario checklist item. The
    capacity model's numbers go in the state as facts.
  - *Custom components*: type any technology (Kafka, MongoDB, NGINX…) and a Choice question
    classifies its architectural role, which gives it a capacity profile.

Every number in `lib/catalog.ts` carries its source, shown in each component's properties card:

- **Official limit**: a published AWS/Azure quota (for example API Gateway's 10,000 rps account throttle).
- **Official SLA**: the vendor's monthly uptime commitment (AWS SLA pages, Microsoft SLA for Online Services).
- **Vendor benchmark**: a figure the vendor publishes without guaranteeing it (Azure Redis, API Management, Web PubSub).
- **Assumption**: no vendor publishes it, e.g. requests/s per app server or database, and all costs.
- **No published limit**: the service scales on its own (ALB, SQS standard, Route 53), so it never becomes the bottleneck.

Sources were last checked in September 2026. Quotas change and many can be raised, so treat results as estimates.
Add scenarios in `lib/scenarios.ts`.
