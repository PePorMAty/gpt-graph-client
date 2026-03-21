# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Behaviour

Act as a friendly senior developer working together with the user on this project. When making changes:
- Briefly explain *what* was changed and *why* — as if doing a quick code review walkthrough with a teammate.
- Point out any trade-offs or things worth knowing about the approach chosen.
- Keep the tone conversational and approachable, not formal.

## Commands

```bash
npm run dev       # Start dev server
npm run build     # TypeScript compile + Vite build
npm run lint      # ESLint check
npm run preview   # Preview production build
npm run deploy    # Deploy to GitHub Pages (gh-pages -d dist)
```

No test framework is configured.

## Architecture Overview

This is a **graph visualization app** for building and exploring technology supply chains. Users enter text prompts; a GPT-powered backend returns product/transformation chains, which are rendered as interactive directed graphs using React Flow.

### Tech Stack

- **React 19 + TypeScript** (strict mode: `noUnusedLocals`, `noUnusedParameters`)
- **Redux Toolkit** — all app state
- **@xyflow/react** (React Flow) — graph canvas with custom node types
- **ELK / Dagre** — automatic graph layout algorithms
- **Axios** — HTTP client; base URL from `VITE_API_URL` env var (default: `https://sorangptgraph.xyz/api`)

### State Management (Redux slices)

| Slice | Purpose |
|---|---|
| `gptSlice` | Graph nodes/edges, root node, chain session state, loading flags |
| `sourcesSlice` | Per-node technology sources (fetched lazily) |
| `savedGraphsSlice` | Locally saved graphs metadata |

Use typed hooks from `src/store/hooks/hooks.ts` (`useAppDispatch`, `useAppSelector`).

### Async Thunks (`src/store/api/`)

- `graph-api.ts` — `getGraphData`, `continueGraph`, `buildChainLevel1`, `expandChainOneLevel`
- `sources-api.ts` — `fetchSources`, `aggregateSources`
- `product-card-api.ts` — `fetchProductCard`, `fetchTransformationCard`
- `saved-graph-api.ts` — save/load graph operations

### Data Flow

```
User prompt → POST /graphs/gpt → raw chain response
  → chainToFlow() / levelToFlow()  (convert to RF nodes/edges)
  → layoutTree() with ELK           (calculate positions)
  → centerTreeOnRoot()              (adjust viewport origin)
  → Redux store (nodes[], edges[])
  → React Flow renders with custom node components
```

### Custom Node Types (`src/components/nodes/`)

- `ProductNode` — blue nodes representing products
- `TransformationNode` — nodes representing production processes

Node type strings must match keys registered in the `nodeTypes` object passed to `<ReactFlow>`.

### Key Files

- `src/Flow.tsx` — main graph canvas, ReactFlow setup, layout triggers
- `src/App.tsx` — root layout, panel composition
- `src/store/slices/gptSlice.ts` — core graph state and reducers
- `src/utils/chainToFlow.ts` — server response → React Flow format
- `src/utils/layoutTree.ts` — ELK layout wrapper
- `src/types.ts` — shared TypeScript interfaces

### Styling

CSS Modules (`.module.css`) per component. No global CSS framework.

### Deployment

Deployed to GitHub Pages at `/gpt-graph-client/` — `vite.config.ts` sets `base: '/gpt-graph-client/'`.