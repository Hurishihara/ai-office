# AI Office Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Express API that stores notes in Chroma, runs a LangGraph writer → QA → human-review pipeline on free OpenRouter models, and streams agent activity over SSE — everything the 3D office (plan 2) will call.

**Architecture:** npm workspaces repo (`shared/`, `server/`, later `client/`). The server is built from small services injected into `createApp(deps)` so routes are tested with supertest and fakes, never the network. The pipeline is a LangGraph `StateGraph` (`write → qa_review → human_review`) compiled with a SQLite checkpointer; writer and QA are `createAgent` agents, but the graph receives them as plain functions so routing is testable without a model.

**Tech Stack:** Node 24, TypeScript, Express 5, zod 4, `langchain` 1.6 (`createAgent`, `tool`), `@langchain/langgraph` 1.7, `@langchain/langgraph-checkpoint-sqlite`, `@langchain/openrouter` (`ChatOpenRouter`), `@langchain/openai` (`OpenAIEmbeddings` pointed at OpenRouter), `@langchain/textsplitters`, `chromadb` 3.5 (client used directly, embeddings computed by LangChain), Vitest + supertest, tsx for running TS.

**Spec:** `docs/superpowers/specs/2026-11-23-ai-office-design.md`

**Followed by:** `docs/superpowers/plans/2026-11-23-ai-office-client.md` (the 3D office).

## Global Constraints

- TypeScript everywhere; ESM (`"type": "module"`); strict mode.
- Single local user, no auth. `OPENROUTER_API_KEY` is read only by the server from `.env`; never sent to the client.
- Bind everything to loopback only: Express listens on `127.0.0.1`, Chroma is published as `127.0.0.1:8000:8000`. Nothing is reachable from other devices on the network.
- Any id from a URL that becomes a file path must match `UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/` first.
- Platforms and hard length limits: X 280, Instagram 2,200, LinkedIn 3,000 characters — checked in code, counting Unicode code points (`[...text].length`). Limits and note rules live once in `@ai-office/shared` (`shared/src/rules.ts`); server and client both import them.
- Max 3 rounds per assignment. At round 3, revise is not allowed: approve or discard only.
- Writer may call `search_notes` at most 4 times per run.
- Notes: `.txt` / `.md` files or typed (`source: "typed"`), ≤ 1 MB (1,048,576 bytes UTF-8), non-empty.
- Note originals in `data/notes/<id>.md`; chunks in Chroma tagged `{noteId, title, source, chunkIndex, createdAt}`; delete removes both.
- Chroma collection name includes the embedding model id.
- Free models by default; writer/QA models switchable via settings; `.env` supplies defaults. Embedding model is `.env` only.
- OpenRouter model list cached 1 hour.
- Automated tests never call OpenRouter or need Chroma running.

## Review Focus

1. **Large note bodies** — Express's default JSON limit is 100 KB; a 500 KB note must reach the validator and be accepted, and a 1.1 MB note must get the validator's "over 1 MB" message, not a bare 413. (Task 3)
2. **Revise at round 3** — a `revise` decision on round 3 must return 400 and leave the assignment paused, not loop a 4th time. (Task 8)
3. **Stale or double decisions** — two decisions sent at the same moment (double-click, second tab) must give one 200 and one 409 and resume the graph once. (Task 8)
4. **Server restart mid-review or mid-run** — an assignment paused at human review must still be `awaiting_user` after a restart; one that was `writing`/`reviewing` when the server died (every `tsx watch` save) must come back as `error` with Retry, not hang. (Task 8)
5. **Emoji in posts** — length checks count code points, so a 280-emoji X post passes and 281 fails (UTF-16 `.length` would double-count). (Task 5)

---

## File Structure

```
package.json                 workspaces: shared, server, client
tsconfig.base.json
docker-compose.yml           chroma
.env.example
.gitignore                   node_modules, .env, data/, .superpowers/, dist
shared/
  package.json               name "@ai-office/shared"
  src/index.ts               every type that crosses the API (see Task 1)
  src/rules.ts               note limits, platform limits, countChars, UUID_RE
server/
  package.json               name "@ai-office/server"
  vitest.config.ts
  src/
    config.ts                env → Config
    app.ts                   createApp(deps): express app, mounts routes
    index.ts                 boot: build real deps, check Chroma, listen
    events.ts                EventBus + SSE route
    jsonFile.ts              readJson / writeJson (atomic)
    preferences.ts           PreferencesStore + zod schema
    settings.ts              SettingsStore
    notes/validate.ts        validateNoteInput
    notes/noteFile.ts        serialize / parse note files
    notes/vectorIndex.ts     VectorIndex interface, collectionName, ChromaVectorIndex
    notes/noteService.ts     NoteService: add / list / remove / search / reindex
    models/openrouter.ts     makeChatModel, makeEmbeddings, describeModelError
    models/catalog.ts        ModelCatalog (fetch + 1h cache) + filterModels
    pipeline/platform.ts     PLATFORM_STYLE, lengthIssue
    pipeline/prompts.ts      buildWriterPrompt, buildQaPrompt
    pipeline/writer.ts       makeSearchTool, resolveUsedRefs, makeWriter
    pipeline/qa.ts           makeQa
    pipeline/graph.ts        buildGraph, nextAfterHuman
    pipeline/assignments.ts  AssignmentService
    routes/*.ts              one router per resource
  scripts/reindex.ts
  test/**/*.test.ts
data/                        created at runtime (gitignored)
```

---

### Task 1: Workspace, shared types, health route

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `docker-compose.yml`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`, `shared/src/rules.ts`
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/src/config.ts`, `server/src/app.ts`, `server/src/index.ts`
- Test: `server/test/app.test.ts`, `server/test/rules.test.ts`

**Interfaces:**
- Produces (`@ai-office/shared`):
  ```ts
  export type Platform = "x" | "linkedin" | "instagram";
  export interface Preferences { tone: string; audience: string; emoji: "none" | "light" | "heavy"; hashtags: string; extra: string }
  export interface NoteSummary { id: string; title: string; source: string; createdAt: string; preview: string }
  export interface CreateNoteBody { title: string; text: string; source: string }
  export interface RetrievedChunk { noteId: string; title: string; chunkIndex: number; text: string; score: number }
  export interface QaReview { verdict: "pass" | "needs_revision"; issues: string[]; suggestions: string[] }
  export interface UserDecision { action: "approve" | "revise" | "discard"; feedback?: string }
  export type AssignmentStatus = "writing" | "reviewing" | "awaiting_user" | "approved" | "discarded" | "error";
  export interface AssignmentSummary { id: string; platform: Platform; ask: string; status: AssignmentStatus; createdAt: string }
  export interface AssignmentView extends AssignmentSummary {
    round: number; draft: string | null; retrievedNotes: RetrievedChunk[]; usedNoteIds: string[];
    qaReview: QaReview | null; finalPost: string | null; error: string | null; canRevise: boolean;
  }
  export interface ModelInfo { id: string; name: string; free: boolean; contextLength: number; promptPrice: string; completionPrice: string; supportsTools: boolean }
  export interface Settings { writerModel: string; qaModel: string }
  export type AgentId = "writer" | "qa";
  export type AgentState = "idle" | "thinking" | "waiting" | "error";
  export type ServerEvent =
    | { type: "agent"; agent: AgentId; state: AgentState; assignmentId?: string }
    | { type: "search"; assignmentId: string; query: string; hits: number }
    | { type: "handoff"; assignmentId: string }
    | { type: "assignment"; assignment: AssignmentSummary };
  export const PLATFORMS: Platform[] = ["x", "linkedin", "instagram"];
  export * from "./rules.js";
  ```
- Produces (`shared/src/rules.ts`) — the one copy of rules both server and browser need:
  ```ts
  export const MAX_NOTE_BYTES = 1_048_576;
  export const NOTE_ERRORS = { type: "Only .txt and .md files are supported", empty: "Note is empty", tooBig: "Note is over 1 MB", title: "Title is required" } as const;
  export function isAllowedNoteSource(source: string): boolean;   // "typed", or ends in .txt/.md, case-insensitive
  export const PLATFORM_LIMITS: Record<Platform, number> = { x: 280, instagram: 2200, linkedin: 3000 };
  export const PLATFORM_LABELS: Record<Platform, string> = { x: "X", linkedin: "LinkedIn", instagram: "Instagram" };
  export function countChars(text: string): number;               // [...text].length (code points)
  export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  ```
- Produces (server): `loadConfig(env = process.env): Config` with `{ port: number (default 3001), openrouterApiKey: string, writerModel: string, qaModel: string, embeddingModel: string, chromaUrl: string (default "http://localhost:8000"), dataDir: string (default "<repo>/data") }`; `createApp(deps: Partial<AppDeps>): express.Express` — `AppDeps` grows one field per task; `createApp` mounts each router only when its dependency is present, so tests pass just what they exercise. Task 1 has none. `express.json({ limit: "2mb" })` is set here.

- [ ] **Step 1: Initialise repo and workspace**

`git init`; root `package.json` with `"private": true`, `"workspaces": ["shared", "server", "client"]`, scripts `"dev:server": "npm run dev -w @ai-office/server"`, `"test": "npm test -w @ai-office/server"`. `.gitignore`: `node_modules/`, `.env`, `data/`, `.superpowers/`, `dist/`. `docker-compose.yml`: service `chroma`, image `chromadb/chroma`, ports `"127.0.0.1:8000:8000"` (loopback only), named volume for `/data`. `.env.example`: `OPENROUTER_API_KEY=`, `WRITER_MODEL=`, `QA_MODEL=`, `EMBEDDING_MODEL=nvidia/nemotron-3.5-embed-1b:free`, `CHROMA_URL=http://localhost:8000`, `PORT=3001`. Pick `WRITER_MODEL`/`QA_MODEL` defaults by running `curl -s https://openrouter.ai/api/v1/models` and choosing free models whose `supported_parameters` include `"tools"`; write the chosen ids into `.env.example`.

- [ ] **Step 2: Install dependencies**

Run: `npm i -w @ai-office/server express zod langchain @langchain/core @langchain/langgraph @langchain/langgraph-checkpoint-sqlite @langchain/openrouter @langchain/openai @langchain/textsplitters chromadb` and `npm i -D -w @ai-office/server typescript tsx vitest supertest @types/express @types/supertest @types/node`. No `dotenv`: Node 24 loads `.env` itself. Server `dev` script: `tsx --env-file-if-exists=../.env watch src/index.ts`; `test`: `vitest run`.

- [ ] **Step 3: Write the failing test**

```ts
// server/test/app.test.ts
it("GET /api/health returns ok", async () => {
  const res = await request(createApp({})).get("/api/health");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});
it("loadConfig applies defaults and requires the API key", () => {
  expect(() => loadConfig({})).toThrow(/OPENROUTER_API_KEY/);
  const c = loadConfig({ OPENROUTER_API_KEY: "k", WRITER_MODEL: "w", QA_MODEL: "q", EMBEDDING_MODEL: "e" });
  expect(c.port).toBe(3001);
  expect(c.chromaUrl).toBe("http://localhost:8000");
});
// server/test/rules.test.ts
it("isAllowedNoteSource accepts typed, .txt and .MD only", () => {
  expect(["typed", "a.txt", "b.MD"].every(isAllowedNoteSource)).toBe(true);
  expect(isAllowedNoteSource("c.pdf")).toBe(false);
  expect(isAllowedNoteSource("notes.md.exe")).toBe(false);
});
it("countChars counts emoji as one", () => { expect(countChars("😀a")).toBe(2); });
it("UUID_RE rejects path tricks", () => { expect(UUID_RE.test("../../docs/x")).toBe(false); });
```

- [ ] **Step 4: Run to verify it fails** — `npm test` → FAIL (modules missing).
- [ ] **Step 5: Implement `shared/src/index.ts`, `shared/src/rules.ts`, `config.ts`, `app.ts` (health route), `index.ts` (`createApp`, then `app.listen(config.port, "127.0.0.1")` — loopback only).**
- [ ] **Step 6: Run to verify it passes** — `npm test` → PASS.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "chore: workspace scaffold, shared types, health route"`

---

### Task 2: JSON stores, preferences and settings routes

**Files:**
- Create: `server/src/jsonFile.ts`, `server/src/preferences.ts`, `server/src/settings.ts`, `server/src/routes/preferences.ts`, `server/src/routes/settings.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/preferences.test.ts`, `server/test/settings.test.ts`

**Interfaces:**
- Produces:
  - `readJson<T>(path: string, fallback: T): Promise<T>`; `writeJson(path: string, value: unknown): Promise<void>` (write temp file then rename).
  - `PreferencesSchema` (zod, matches `Preferences`; strings max 2,000 chars); `DEFAULT_PREFERENCES: Preferences = { tone: "", audience: "", emoji: "light", hashtags: "", extra: "" }`.
  - `class PreferencesStore { constructor(file: string); get(): Promise<Preferences>; save(p: Preferences): Promise<Preferences> }` — file `data/preferences.json`.
  - `class SettingsStore { constructor(file: string, defaults: Settings); get(): Promise<Settings>; save(s: Settings): Promise<Settings> }` — file `data/settings.json`.
  - `AppDeps` gains `preferences: PreferencesStore`, `settings: SettingsStore`.
  - Routes: `GET/PUT /api/preferences`, `GET/PUT /api/settings`. Invalid body (wrong shape, empty model id) → 400 `{ error: string }`. Settings are not checked against the OpenRouter model list: the picker only offers valid ids, and a bad id fails clearly on first use via `describeModelError`.

- [ ] **Step 1: Write the failing tests**

```ts
// preferences.test.ts  (tmp dir per test via fs.mkdtemp)
it("returns defaults when no file exists", async () => { /* GET → DEFAULT_PREFERENCES */ });
it("PUT saves and GET returns the saved preferences", async () => { /* PUT {tone:"dry",audience:"devs",emoji:"none",hashtags:"2 max",extra:""} → 200, GET equal */ });
it("rejects an invalid emoji value", async () => { /* PUT emoji:"lots" → 400 */ });
// settings.test.ts
it("falls back to the defaults passed in from .env", async () => { /* GET → {writerModel:"w",qaModel:"q"} */ });
it("PUT persists the chosen models", async () => { /* PUT then new SettingsStore on same file → same values */ });
```

- [ ] **Step 2: Run** — `npm test` → FAIL.
- [ ] **Step 3: Implement the stores and routers; mount in `createApp`.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: preferences and settings stores with routes`

---

### Task 3: Notes — validation, files, Chroma index, routes

**Files:**
- Create: `server/src/notes/validate.ts`, `server/src/notes/noteFile.ts`, `server/src/notes/vectorIndex.ts`, `server/src/notes/noteService.ts`, `server/src/routes/notes.ts`, `server/scripts/reindex.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/notes.test.ts`, `server/test/vectorIndex.test.ts`

**Interfaces:**
- Consumes: `CreateNoteBody`, `NoteSummary`, `RetrievedChunk`, `MAX_NOTE_BYTES`, `NOTE_ERRORS`, `isAllowedNoteSource`, `UUID_RE` from shared.
- Produces:
  - `validateNoteInput(body: unknown): { ok: true; value: CreateNoteBody } | { ok: false; error: string }` — rules: `isAllowedNoteSource(source)`; `text.trim()` non-empty; `Buffer.byteLength(text, "utf8") <= MAX_NOTE_BYTES`; `title.trim()` non-empty, max 200 chars. Errors are the `NOTE_ERRORS` strings.
  - Note file format: line 1 `---`, line 2 JSON of `{id,title,source,createdAt}`, line 3 `---`, then the text verbatim. `serializeNote(meta, text): string`; `parseNote(raw: string): { meta: NoteMeta; text: string }` — reads line 2 as JSON and everything after the third newline as the body; never splits the body on `---` (markdown uses it for horizontal rules).
  - `interface VectorIndex { addChunks(chunks: { id: string; text: string; metadata: ChunkMeta }[]): Promise<void>; deleteByNote(noteId: string): Promise<void>; search(query: string, k: number): Promise<RetrievedChunk[]>; reset(): Promise<void>; heartbeat(): Promise<boolean> }` where `ChunkMeta = { noteId; title; source; chunkIndex; createdAt }`.
  - `collectionName(embeddingModel: string): string` → `"notes__" + id` with every char outside `[a-zA-Z0-9._-]` replaced by `-`, trailing non-alphanumerics trimmed.
  - `class ChromaVectorIndex implements VectorIndex { constructor(opts: { chromaUrl: string; embeddingModel: string; embeddings: EmbeddingsInterface }) }` — uses `chromadb` `ChromaClient`, `getOrCreateCollection({ name: collectionName(...), configuration: { hnsw: { space: "cosine" } } })` (if the installed client rejects `configuration`, use `metadata: { "hnsw:space": "cosine" }`), passes `embeddings` explicitly on `add` and `queryEmbeddings` on `query`; delete with `where: { noteId }`; score = `1 - distance`, which with cosine space is the cosine similarity.
  - `class NoteService { constructor(opts: { notesDir: string; index: VectorIndex; splitter?: (text: string, source: string) => Promise<string[]> }); add(input: CreateNoteBody): Promise<NoteSummary>; list(): Promise<NoteSummary[]> (newest first, preview = first 140 chars); remove(id: string): Promise<boolean>; search(query: string, k: number): Promise<RetrievedChunk[]>; reindex(): Promise<number> }` — default splitter: `MarkdownTextSplitter` for `.md`, otherwise `RecursiveCharacterTextSplitter`, `chunkSize: 800`, `chunkOverlap: 100`. Chunk id `${noteId}:${chunkIndex}`.
  - `AppDeps` gains `notes: NoteService`. Routes: `GET /api/notes`, `POST /api/notes` (201 + `NoteSummary`; 400 `{error}` from validator), `DELETE /api/notes/:id` (400 `"Invalid note id"` unless `UUID_RE.test(id)` — checked before any file path is built; then 204 / 404). `NoteService.remove` also checks `UUID_RE` itself and returns `false` otherwise. If `index.heartbeat()` is false or the index throws a connection error → 503 `{ error: "Chroma is not reachable at <url>. Start it with: docker compose up -d" }`.
  - `scripts/reindex.ts`: builds real deps, calls `notes.reindex()`, prints count. Root script `"reindex": "tsx --env-file-if-exists=.env server/scripts/reindex.ts"`.

- [ ] **Step 1: Write the failing tests** (use an in-test `FakeVectorIndex` that stores chunks in an array and `search` returns chunks whose text includes the query)

```ts
it("accepts a typed note, writes the file and indexes tagged chunks", async () => {
  const res = await request(app).post("/api/notes").send({ title: "CLI", text: "Shipped v2 of my CLI", source: "typed" });
  expect(res.status).toBe(201);
  const raw = await readFile(join(notesDir, `${res.body.id}.md`), "utf8");
  expect(parseNote(raw).text).toBe("Shipped v2 of my CLI");
  expect(fake.chunks.every(c => c.metadata.noteId === res.body.id)).toBe(true);
});
it("rejects a .pdf source", /* 400, "Only .txt and .md files are supported" */);
it("rejects whitespace-only text", /* 400, "Note is empty" */);
it("accepts a 500 KB note (bigger than Express's default limit)", /* 201 */);
it("rejects a note over 1 MB with the validator message, not 413", /* 1_048_577 bytes → 400 "Note is over 1 MB" */);
it("DELETE removes the file and its chunks", /* 204; file gone; fake.chunks has none for id */);
it("DELETE unknown id → 404");
it("DELETE with a path-traversal id is refused and touches no file", async () => {
  const victim = join(tmpRoot, "keep.md"); await writeFile(victim, "x");   // notesDir = join(tmpRoot, "notes")
  const res = await request(app).delete("/api/notes/..%2Fkeep");
  expect(res.status).toBe(400);
  expect(existsSync(victim)).toBe(true);
});
it("a markdown note containing --- round-trips unchanged", async () => {
  const text = "# Title\n\nintro\n\n---\n\nafter the rule\n---\nend";
  expect(parseNote(serializeNote(meta, text)).text).toBe(text);
});
it("returns 503 with the docker hint when Chroma is down", /* fake.heartbeat → false */);
it("reindex re-adds every note file after reset", /* add 2 notes, fake.reset(), reindex() === 2, chunks back */);
// vectorIndex.test.ts
it("collectionName makes a valid Chroma name", () => {
  expect(collectionName("nvidia/nemotron-3.5-embed-1b:free")).toBe("notes__nvidia-nemotron-3.5-embed-1b-free");
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement `validate.ts`, `noteFile.ts`, `vectorIndex.ts`, `noteService.ts`, `routes/notes.ts`, `scripts/reindex.ts`; mount router.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Manual check against real Chroma** — `docker compose up -d`, put a real key in `.env`, `npm run dev:server`, then `curl -X POST localhost:3001/api/notes -H "content-type: application/json" -d "{\"title\":\"t\",\"text\":\"hello world\",\"source\":\"typed\"}"` → 201; `GET /api/notes` lists it; `docker compose stop chroma` → POST returns 503 with the hint.
- [ ] **Step 6: Commit** — `feat: notes ingest with chroma index and reindex script`

---

### Task 4: OpenRouter models — factories, catalog, error messages

**Files:**
- Create: `server/src/models/openrouter.ts`, `server/src/models/catalog.ts`, `server/src/routes/models.ts`
- Modify: `server/src/app.ts`, `server/src/index.ts` (real `ChromaVectorIndex` uses `makeEmbeddings`)
- Test: `server/test/catalog.test.ts`, `server/test/modelErrors.test.ts`, `server/test/fixtures/openrouter-models.json`

**Interfaces:**
- Produces:
  - `MODEL_TIMEOUT_MS = 60_000`; `makeChatModel(modelId: string, apiKey: string): BaseChatModel` → `new ChatOpenRouter({ model: modelId, apiKey, maxRetries: 3, timeout: MODEL_TIMEOUT_MS })`. If the installed `ChatOpenRouter` has no `timeout` option, pass `signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)` on each agent `invoke` instead. A timeout surfaces as a normal run error with Retry, so a hung free provider can't leave an assignment `writing` forever.
  - `makeEmbeddings(modelId: string, apiKey: string): OpenAIEmbeddings` → `new OpenAIEmbeddings({ model: modelId, apiKey, configuration: { baseURL: "https://openrouter.ai/api/v1" } })`.
  - `describeModelError(err: unknown): string` — status 429 → `"The model is rate-limited (free tier). Wait a minute or pick another model at reception."`; 401 → `"OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env."`; otherwise `"Model call failed: <message>"`.
  - `toModelInfo(raw): ModelInfo` — `free` = `pricing.prompt === "0" && pricing.completion === "0"`; `supportsTools` = `supported_parameters` includes `"tools"`.
  - `filterModels(models: ModelInfo[], opts: { role: "writer" | "qa"; freeOnly: boolean }): ModelInfo[]` — both roles require `supportsTools` (QA's structured output uses LangChain's tool strategy); `freeOnly` keeps `free`; sorted by `name`.
  - `class ModelCatalog { constructor(opts: { fetchFn?: typeof fetch; ttlMs?: number /* 3_600_000 */; now?: () => number }); list(): Promise<ModelInfo[]> }` — fetches `https://openrouter.ai/api/v1/models` (no key), caches for `ttlMs`; on fetch failure returns the stale cache if any, else throws.
  - Route: `GET /api/models?role=writer|qa&freeOnly=true|false` (default `freeOnly=true`) → `ModelInfo[]`. `AppDeps.catalog: ModelCatalog`.

- [ ] **Step 1: Write the fixture** — hand-written `openrouter-models.json` in the `/api/v1/models` shape with 4 entries: free+tools, free without tools, paid+tools, paid without tools.
- [ ] **Step 2: Write the failing tests**

```ts
it("writer list = free, tool-capable only by default", /* filterModels(... freeOnly:true) ids == [free+tools] */);
it("freeOnly=false adds paid tool-capable models", /* 2 ids */);
it("caches for an hour", /* fetchFn called once for two list() calls at now=0 and now=3_599_999; twice at 3_600_001 */);
it("serves stale cache when OpenRouter is unreachable", /* second fetch rejects → still returns list */);
it("describeModelError maps 429 and 401", /* exact strings above */);
```

- [ ] **Step 3: Run** — FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** — PASS.
- [ ] **Step 6: Commit** — `feat: openrouter model factories and cached model catalog`

---

### Task 5: Platform rules and prompts

**Files:**
- Create: `server/src/pipeline/platform.ts`, `server/src/pipeline/prompts.ts`
- Test: `server/test/platform.test.ts`, `server/test/prompts.test.ts`

**Interfaces:**
- Consumes: `PLATFORM_LIMITS`, `PLATFORM_LABELS`, `countChars` from shared (not redefined here).
- Produces:
  - `PLATFORM_STYLE: Record<Platform, string>` — one line each the builder writes (e.g. X: punchy, one idea; LinkedIn: short paragraphs; Instagram: caption + hashtags at end).
  - `lengthIssue(platform: Platform, text: string): string | null` → `null` if `countChars(text) <= PLATFORM_LIMITS[platform]`, else `"Too long for <PLATFORM_LABELS[platform]>: <n>/<limit> characters"`.
  - `buildWriterPrompt(p: { platform: Platform; preferences: Preferences; revision?: { previousDraft: string; qaReview: QaReview; feedback?: string } }): string` — includes every non-empty preference field, the platform limit and style, the instruction to call `search_notes` before writing and to list in `usedRefs` only the note refs (`N1`, `N2`, … as shown in search results) the post relies on; when `revision` is present, includes the previous draft, QA issues and the user's feedback.
  - `buildQaPrompt(p: { platform: Platform; preferences: Preferences; draft: string; usedNotes: RetrievedChunk[] }): string` — asks for a review against preferences, platform fit, and grounding in `usedNotes` only.

- [ ] **Step 1: Write the failing tests**

```ts
it("280 emoji fit on X, 281 do not", () => {
  expect(lengthIssue("x", "😀".repeat(280))).toBeNull();
  expect(lengthIssue("x", "😀".repeat(281))).toBe("Too long for X: 281/280 characters");
});
it("LinkedIn allows 3000", () => { expect(lengthIssue("linkedin", "a".repeat(3000))).toBeNull(); });
it("writer prompt carries preferences, limit and revision context", () => {
  const s = buildWriterPrompt({ platform: "x", preferences: { tone: "dry", audience: "devs", emoji: "none", hashtags: "", extra: "no buzzwords" },
    revision: { previousDraft: "OLD", qaReview: { verdict: "needs_revision", issues: ["too salesy"], suggestions: [] }, feedback: "mention v2" } });
  for (const part of ["dry", "devs", "no buzzwords", "280", "OLD", "too salesy", "mention v2", "search_notes", "usedRefs"]) expect(s).toContain(part);
});
it("QA prompt includes only the used notes' text", /* contains used chunk text */);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: platform limits and agent prompts`

---

### Task 6: Writer and QA agents

**Files:**
- Create: `server/src/pipeline/writer.ts`, `server/src/pipeline/qa.ts`
- Test: `server/test/writer.test.ts`

**Interfaces:**
- Consumes: `NoteService.search`, `buildWriterPrompt`, `buildQaPrompt`, `lengthIssue`, `makeChatModel`.
- Produces:
  - `MAX_SEARCHES = 4`, `SEARCH_K = 5`.
  - For testability, `makeWriter` takes an optional `runAgent?: (args: { tool: StructuredTool; systemPrompt: string; ask: string }) => Promise<{ post: string; usedRefs: string[] }>`; the default builds the `createAgent` below. Tests pass a stub that invokes `tool` directly.
  - `makeSearchTool(opts: { search: (q: string, k: number) => Promise<RetrievedChunk[]>; onSearch: (query: string, hits: number) => void }): { tool: StructuredTool; retrieved: () => RetrievedChunk[]; refs: () => Record<string, string> }` — tool name `search_notes`, schema `{ query: string }`; after `MAX_SEARCHES` calls it returns `"Search limit reached. Write the post now with the notes you have."` without searching; empty results return `"No matching notes found."`; otherwise a text listing each chunk as `[N<k>] title: text`. Each **note** gets a short ref (`N1`, `N2`, …) the first time it appears, reused for its other chunks — small free models garble 36-char UUIDs, short refs survive. `refs()` maps ref → noteId. `retrieved()` returns all hits so far, de-duplicated by `noteId + chunkIndex`. All counters and maps are per tool instance.
  - `resolveUsedRefs(usedRefs: string[], refs: Record<string, string>): string[]` — maps refs to noteIds (trimmed, case-insensitive: `"n2"` → `N2`), drops unknown refs, de-duplicates, keeps order.
  - `type WriterFn = (input: { platform: Platform; ask: string; preferences: Preferences; revision?: { previousDraft: string; qaReview: QaReview; feedback?: string }; onSearch: (q: string, hits: number) => void }) => Promise<{ post: string; usedNoteIds: string[]; retrievedNotes: RetrievedChunk[] }>`.
  - `makeWriter(opts: { model: () => Promise<BaseChatModel>; search: NoteService["search"] }): WriterFn` — **every `WriterFn` call creates a fresh `makeSearchTool(...)`** (so the 4-search cap and the refs are per run, never shared across runs or assignments), then `createAgent({ model, tools: [tool], systemPrompt: buildWriterPrompt(...), responseFormat: z.object({ post: z.string(), usedRefs: z.array(z.string()) }) })`; user message = `ask`; reads `result.structuredResponse`; returns `usedNoteIds = resolveUsedRefs(usedRefs, refs())`. `model` is a thunk so a settings change applies to the next run.
  - `type QaFn = (input: { platform: Platform; preferences: Preferences; draft: string; usedNotes: RetrievedChunk[] }) => Promise<QaReview>`.
  - `applyLengthCheck(review: QaReview, platform: Platform, draft: string): QaReview` — if `lengthIssue(...)` is non-null, returns a copy with it prepended to `issues` and `verdict: "needs_revision"`; otherwise returns `review` unchanged.
  - `makeQa(opts: { model: () => Promise<BaseChatModel> }): QaFn` — `createAgent` with no tools and `responseFormat` = zod `QaReview`; returns `applyLengthCheck(result.structuredResponse, platform, draft)`.

- [ ] **Step 1: Write the failing tests**

```ts
it("search tool stops searching after 4 calls", async () => { /* 5 invokes → search fn called 4 times; 5th returns the limit message */ });
it("search tool says so when no notes match", /* search → [] → "No matching notes found." and onSearch(query, 0) */);
it("retrieved() de-duplicates chunks across searches");
it("labels notes N1, N2… and reuses a note's ref for its other chunks", async () => {
  /* search returns [chunk(uuidA,0), chunk(uuidB,0), chunk(uuidA,1)] → text has "[N1]", "[N2]", "[N1]"; refs() == { N1: uuidA, N2: uuidB } */
});
it("resolveUsedRefs maps refs to note ids and drops unknown ones", () => {
  expect(resolveUsedRefs(["N2", "N9", " n1 ", "N2"], { N1: "uuidA", N2: "uuidB" })).toEqual(["uuidB", "uuidA"]);
});
it("each writer run gets its own search budget", async () => {
  /* makeWriter with a stub agent runner that calls the tool 4 times per run; run twice → search fn called 8 times, never the limit message on run 2's first call */
});
it("QA's review is forced to needs_revision when the draft is too long", () => {
  const r = applyLengthCheck({ verdict: "pass", issues: [], suggestions: [] }, "x", "a".repeat(300));
  expect(r.verdict).toBe("needs_revision");
  expect(r.issues[0]).toBe("Too long for X: 300/280 characters");
});
it("applyLengthCheck leaves a fitting draft's review alone", /* 200 chars → same object values */);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Manual smoke** — a throwaway `tsx -e` call to `makeWriter` with the real model and the real `NoteService` (Chroma up, a few notes added) prints a post and `usedNoteIds`. Not committed.
- [ ] **Step 6: Commit** — `feat: writer agent with capped note search and QA agent with structured review`

---

### Task 7: The LangGraph pipeline

**Files:**
- Create: `server/src/pipeline/graph.ts`
- Test: `server/test/graph.test.ts`

**Interfaces:**
- Consumes: `WriterFn`, `QaFn`, `UserDecision`, `QaReview`, `RetrievedChunk`, `Preferences`, `Platform`.
- Produces:
  - Graph state (LangGraph state definition, using whichever of `StateSchema`/`Annotation.Root` the installed `@langchain/langgraph` documents): `assignmentId: string; platform: Platform; ask: string; preferences: Preferences; draft: string | null; retrievedNotes: RetrievedChunk[]; usedNoteIds: string[]; qaReview: QaReview | null; userDecision: UserDecision | null; round: number (starts 1); status: AssignmentStatus; finalPost: string | null`. All fields replace (no append reducers).
  - `MAX_ROUNDS = 3`.
  - `interface HumanReviewPayload { draft: string; qaReview: QaReview; retrievedNotes: RetrievedChunk[]; usedNoteIds: string[]; round: number; canRevise: boolean }`.
  - `nextAfterHuman(state): "write" | "__end__"` — `revise` and `round < MAX_ROUNDS` → `"write"`; everything else → end.
  - `buildGraph(deps: { writer: WriterFn; qa: QaFn; checkpointer: BaseCheckpointSaver; emit: (e: ServerEvent) => void })` → compiled graph. Nodes:
    - `write`: emits `agent writer thinking`; calls `writer` (with `revision` built from `draft`, `qaReview`, `userDecision.feedback` when `round > 1`); `onSearch` emits `search` events; sets `draft`, `usedNoteIds`, `retrievedNotes`, `status: "reviewing"`; emits `agent writer idle` and `handoff`.
    - `qa_review`: emits `agent qa thinking`; calls `qa` with the used chunks only; sets `qaReview`, `status: "awaiting_user"`; emits `agent qa waiting`.
    - `human_review`: `const decision = interrupt<HumanReviewPayload, UserDecision>({...state, canRevise: state.round < MAX_ROUNDS})`; on `approve` → `finalPost = draft`, `status: "approved"`; `discard` → `status: "discarded"`; `revise` → `round + 1`, `status: "writing"`; always sets `userDecision`; emits `agent qa idle`. No side effects before `interrupt()` (the node re-runs from its start on resume).
  - Edges: `START → write → qa_review → human_review`, conditional `human_review → nextAfterHuman`.

- [ ] **Step 1: Write the failing tests** (stub `writer`/`qa`; `MemorySaver`; `thread_id = "t1"`)

```ts
it("runs write → qa and pauses for the human", async () => {
  const out = await graph.invoke(initial, cfg);
  expect(out.__interrupt__[0].value).toMatchObject({ draft: "draft 1", round: 1, canRevise: true });
  expect(writer).toHaveBeenCalledTimes(1);
});
it("approve ends with the final post", /* resume {action:"approve"} → state.finalPost === "draft 1", status "approved" */);
it("revise loops back with round 2 and passes feedback to the writer", /* resume {action:"revise",feedback:"shorter"} → writer 2nd call has revision.feedback "shorter"; interrupt round 2 */);
it("round 3 reports canRevise false", /* revise twice → interrupt value.canRevise === false */);
it("nextAfterHuman never loops past round 3", () => {
  expect(nextAfterHuman({ round: 3, userDecision: { action: "revise" } } as any)).toBe("__end__");
});
it("discard ends without a final post", /* status "discarded", finalPost null */);
it("emits search, handoff and agent events in order", /* captured emit list contains search → agent writer idle → handoff → agent qa thinking → agent qa waiting */);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: langgraph writer-qa-human pipeline with 3-round cap`

---

### Task 8: Assignment service, routes, SSE, persistence

**Files:**
- Create: `server/src/events.ts`, `server/src/pipeline/assignments.ts`, `server/src/routes/assignments.ts`, `server/src/routes/events.ts`
- Modify: `server/src/app.ts`, `server/src/index.ts` (wire real deps: `SqliteSaver.fromConnString(join(dataDir, "checkpoints.sqlite"))`, writer/QA thunks reading `SettingsStore`, `ChromaVectorIndex`, startup Chroma heartbeat that logs the docker hint but keeps serving, and `await assignments.recoverInterrupted()` before `listen`)
- Test: `server/test/assignments.test.ts`, `server/test/events.test.ts`

**Interfaces:**
- Consumes: `buildGraph`, `MAX_ROUNDS`, `PreferencesStore`, `describeModelError`, `readJson`/`writeJson`, `PLATFORMS`.
- Produces:
  - `class EventBus { publish(e: ServerEvent): void; subscribe(fn: (e: ServerEvent) => void): () => void; subscriberCount(): number }`; `eventsRouter(bus)` → `GET /api/events` as SSE (`content-type: text/event-stream`, each event `data: <json>\n\n`, a `: ping` comment every 25 s; on `req.on("close")` both unsubscribe and clear the ping interval).
  - `class AssignmentService { constructor(opts: { graph; preferences: PreferencesStore; indexFile: string; bus: EventBus }); load(): Promise<void>; recoverInterrupted(): Promise<number>; start(input: { platform: Platform; ask: string }): Promise<AssignmentSummary>; get(id: string): Promise<AssignmentView | null>; list(): Promise<AssignmentSummary[]>; decide(id: string, d: UserDecision): Promise<AssignmentView>; retry(id: string): Promise<AssignmentView> }`.
    - **Index lives in memory.** `load()` reads `data/assignments.json` once into a `Map<string, IndexEntry>` (`IndexEntry = AssignmentSummary & { error: string | null }`). Every change updates the map synchronously, then queues `writeJson` of the whole map on one promise chain (`this.saving = this.saving.then(() => writeJson(...))`), so two runs finishing together can't overwrite each other's status.
    - **Status changes are synchronous claims.** `decide` and `retry` check the in-memory status and set the new status (`writing` / terminal) in the same synchronous block, before any `await`. Two requests arriving together: the first claims, the second sees the new status and gets 409. No file read sits between check and set.
    - `recoverInterrupted()`: any entry still `writing` or `reviewing` (its run died with the process — every `tsx watch` save does this) becomes `error` with `"Server stopped during this step. Press Retry."`; returns the count. Paused (`awaiting_user`) entries are left alone.
    - `start` adds the entry with status `writing`, publishes `assignment`, then runs `graph.invoke(initial, { configurable: { thread_id: id } })` **without awaiting it in the request**; each run's end updates the entry status from graph state and publishes `assignment`. The background promise always has a `.catch` (Node exits on an unhandled rejection).
    - Run failure (including the model timeout): status `error`, error text from `describeModelError`, publishes `agent <who> error`.
    - `get` builds `AssignmentView` from `graph.getState(cfg).values` + index entry; `canRevise = round < MAX_ROUNDS`.
    - `decide` errors: unknown id → `NotFoundError` (404); status not `awaiting_user` → `ConflictError` (409, "Assignment is not waiting for a decision"); `revise` at `round >= MAX_ROUNDS` → `BadRequestError` (400, "Revision limit reached: approve or discard"); feedback over 2,000 chars → 400. After the synchronous claim it resumes with `new Command({ resume: d })` in the background.
    - `retry`: only when status `error` (else 409); claims status `writing` synchronously, then re-runs `graph.invoke(null, cfg)` in the background (resumes from the last checkpoint).
  - Routes: `POST /api/assignments` (`{platform, ask}` validated: platform in `PLATFORMS`, ask 1–2,000 chars → 202 + summary), `GET /api/assignments`, `GET /api/assignments/:id`, `POST /api/assignments/:id/decision`, `POST /api/assignments/:id/retry`. `AppDeps` gains `assignments: AssignmentService`, `bus: EventBus`.

- [ ] **Step 1: Write the failing tests** (graph built with stub writer/QA; `SqliteSaver` on a temp file; helper `waitForStatus(id, status)` polls `service.get`)

```ts
it("POST starts an assignment and it reaches awaiting_user", /* 202; then status awaiting_user, draft set */);
it("rejects an unknown platform", /* 400 */);
it("approve → approved with finalPost", /* decision approve → 200; eventually status approved */);
it("two decisions sent at the same moment: one 200, one 409, one resume", async () => {
  const [a, b] = await Promise.all([decide(id, { action: "revise", feedback: "x" }), decide(id, { action: "revise", feedback: "y" })]);
  expect([a.status, b.status].sort()).toEqual([200, 409]);
  await waitForStatus(id, "awaiting_user");
  expect(writer).toHaveBeenCalledTimes(2);   // first draft + exactly one revision
});
it("two retries at the same moment start one run", /* writer fails once → error; Promise.all two retries → one 200, one 409 */);
it("an assignment cut off mid-run comes back as error and Retry finishes it", async () => {
  /* writer stub never resolves → status writing; new service on same files → recoverInterrupted() === 1;
     get(id).status === "error", error === "Server stopped during this step. Press Retry."; swap in a working writer, retry → awaiting_user */
});
it("two assignments finishing together both keep their status in the file", /* start A and B with stubs resolving in the same tick → reload index from disk → both awaiting_user */);
it("revise on round 3 returns 400 and stays paused", /* revise, revise → round 3; third revise → 400; status still awaiting_user */);
it("survives a restart while paused", /* new SqliteSaver + new service on same files → get(id).status === "awaiting_user"; approve works */);
it("a writer failure marks error and retry recovers", /* writer throws once with status 429 → status error, error text = rate-limit message; retry → awaiting_user */);
// events.test.ts
it("SSE streams published events", /* open GET /api/events with a raw http request, bus.publish → chunk contains data:{"type":"handoff"...} */);
it("closing the SSE connection removes its listener", /* open, subscriberCount() === 1; destroy the request; wait for close → subscriberCount() === 0 */);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: End-to-end manual check** — Chroma up, real `.env`, `npm run dev:server`; add ~5 notes via `POST /api/notes`; `curl -N localhost:3001/api/events` in one terminal; `POST /api/assignments {"platform":"x","ask":"post about my CLI launch"}` in another. Expected: `search` events, `handoff`, then `GET /api/assignments/:id` shows `awaiting_user`, a draft ≤ 280 chars, `usedNoteIds` ⊆ retrieved ids; `decision {action:"approve"}` → `approved`.
- [ ] **Step 6: Commit** — `feat: assignment service with sse events and sqlite persistence`

---

## Done when

`npm test` passes with no network and no Chroma; with Docker Chroma and a real key, the Task 8 manual check works end to end. The client plan builds on these routes and `@ai-office/shared` types.
