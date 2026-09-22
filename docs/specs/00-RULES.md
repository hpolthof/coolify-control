# Rules for every build agent

You are one of ~15 agents building this app in parallel in the same working tree. Other agents are writing other
files at the same time. Follow these rules exactly.

1. **Read first**: `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DESIGN.md` (web agents), `packages/shared/src/types.ts`,
   `packages/shared/src/constants.ts`, and for server agents `apps/server/src/deps.ts` + `apps/server/src/config.ts`.
   Then your own spec in `docs/specs/`.
2. **Only create or edit the files listed under "You own"** in your spec. Never edit files you don't own, even to fix
   a type error. Never create placeholder/stub versions of other agents' files. If a contract seems wrong, finish
   your work against the contract as written and mention the problem in your final report.
3. **Do not install packages** and do not edit any `package.json` or lockfile. All dependencies are installed.
   Allowed server deps: fastify, @fastify/cookie, @fastify/static, pino, ssh2, zod, node built-ins (`node:sqlite`,
   `node:crypto`, …). Allowed web deps: react, react-dom, react-router-dom v7, @tanstack/react-query v5, zustand v5,
   recharts v2, react-grid-layout v1 (`import GridLayout, { WidthProvider, Responsive } from 'react-grid-layout'`),
   lucide-react, clsx.
4. Exact export names and file paths in your spec are a contract other agents import. Keep them exactly.
5. Import shared types with `import type { … } from '@cc/shared'` (values like `THRESHOLDS` with a normal import).
   Web code may use the `@/` alias for `apps/web/src`. Server code uses relative imports without file extensions
   (`'../deps'`), ESM.
6. TypeScript strict. No `any` unless unavoidable (then `unknown` + narrowing). No `// @ts-ignore`.
7. Type-check your own files: `npx tsc -p apps/server/tsconfig.json --noEmit` or `npx tsc -p apps/web/tsconfig.json --noEmit`.
   Errors in files you don't own, or "Cannot find module" for sibling modules that another agent hasn't finished yet,
   are expected; ignore those. All errors inside your files that are not caused by a missing sibling must be fixed.
8. Match `docs/DESIGN.md`: tokens only (no hex in components), sentence case, `font-num`/`.num` for numbers, status
   colours only for status, lucide icons, no drop shadows.
9. Keep comments sparse and useful. No TODO stubs for things in your spec: implement them.
10. Do not commit to git. Do not run the dev server for long; don't start background processes that keep running.
11. Final report (your last message): list files created, anything you could not do, and any contract issue you found.
    Keep it under 25 lines.
