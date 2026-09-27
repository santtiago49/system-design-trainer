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

Capacity figures in `lib/catalog.ts` are ballpark numbers for interview estimation, not vendor specs.
Add scenarios in `lib/scenarios.ts`.
