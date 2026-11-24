# AI Office — Design

Date: 2026-11-23
Status: approved by owner 2026-11-23

## 1. Intent

An "AI agency" you walk around in. A Three.js cutaway high-rise where each floor is a studio staffed by an AI agent. You move with WASD, walk up to an agent, press E, and work with it.

**Why it exists:** a portfolio piece, and a hands-on way for the owner to learn RAG, LangChain/LangGraph, Chroma, and integrating an AI model into a real full-stack app. Every design choice should favour (1) making the AI/RAG mechanics visible and understandable, and (2) a scene that looks good to a portfolio visitor — over feature breadth.

**First version:** two working studios.

- **Writer studio** — writes a social media post for a chosen platform, grounded in the user's notes (retrieved from Chroma) and shaped by the user's preferences.
- **QA studio** — an AI agent reviews the writer's draft against the user's preferences, the platform rules and the notes, presents its review, and the user decides: approve or send back for revision with feedback. Max 3 rounds.

Other studios (creative, research, content, …) are undecided; they appear as locked floors.

## 2. Goals, non-goals, anti-goals

**Goals**
- Notes in → Chroma → writer retrieves relevant notes → draft → QA review → human approve/revise loop → copyable final post.
- The RAG is visible: the UI shows every note the writer found, with the ones the post actually used marked apart from the ones it found but didn't use.
- Free models by default, with an in-app model picker.
- Explorable 3D tower with WASD movement, elevator between floors, E to interact, agents showing their state.
- Adding a studio later = one new agent + one graph node(s) + one floor.

**Non-goals (v1)**
- Auto-posting to social platforms (copy button only).
- User accounts, auth, multi-user. Single local user.
- Working studios beyond writer and QA.
- Obsidian sync or any write-back to external note tools.
- Mobile / touch controls.
- Free-form chat with QA (QA gives a structured review; the user replies with a decision + optional feedback).
- Deployment/hosting (runs locally; hosting is a later concern).

**Anti-goals (failure even if it works)**
- RAG is invisible — the post just appears and nobody can tell notes were used.
- 3D work eats the learning time: physics engines, complex collisions, custom-modelled art.
- Fake features — locked studios must look locked, not pretend to work.
- The writer/QA loop can run forever or burn tokens unattended.

## 3. Constraints

- **Stack (decided by owner):** TypeScript everywhere. Backend Node + Express + LangChain (JS) + OpenRouter + Chroma. Frontend Vite + TypeScript + Three.js.
- **Chroma** runs locally in Docker; the server talks to it via the JS client.
- **OpenRouter** provides both the chat models and the embedding model (owner confirmed free embedding models exist there). One API key, server-side only, in `.env`.
- **Dev machine:** Windows 11. Everything must run there (Docker Desktop for Chroma).
- Embeddings are tied to the model that produced them: changing the embedding model means re-embedding all notes. The design keeps note originals on disk so this is always possible.

## 4. Approaches considered

All approaches share: one repo with `server/`, `client/`, `shared/` (npm workspaces); Chroma in Docker; note originals on disk; server → browser live updates over SSE.

The real choice was how the writer → QA → human → revise loop is orchestrated.

| | A · LangGraph pipeline (**chosen**) | B · Hand-rolled loop |
|---|---|---|
| How | `StateGraph` with nodes `write → qa_review → human_review`; `human_review` calls `interrupt()`; resumed with `new Command({ resume })`; conditional edge enforces 3-round cap. Each studio agent built with `createAgent`. | Express route runs `for round 1..3`, calls two agents, stores state in a JSON file, waits for user via REST. |
| Pause/resume, persistence | Built in (checkpointer + `thread_id`). | Built by hand. |
| Learning value | Teaches LangGraph, the framework LangChain now builds agents on; strong portfolio signal. | Fewer concepts, but skips the most transferable part. |
| Growth | New studio = new node/edges. | Ad-hoc state machine grows with each studio. |
| Cost | More concepts up front (state, reducers, checkpointer, interrupt semantics — a resumed node re-runs from its start). | Simpler at first, messier later. |

**Dropped:** Deep Agents coordinator (overkill for a fixed two-step pipeline); LangGraph Agent Server (would replace Express, which the owner chose).

**Picked: A**, because the human-in-the-loop revision cycle is exactly what LangGraph interrupts are for, and learning LangChain is half the reason this project exists.

## 5. Decided design

Items marked *(Claude's call)* were proposed by Claude and not objected to; the owner can still change them.

### 5.1 Repository layout

```
ai-office/
  client/            Vite + TS + Three.js
  server/            Express + LangChain/LangGraph
  shared/            TS types shared by both (API payloads, event types)
  data/
    notes/<id>.md    original notes, as written/dropped
    preferences.json
    (checkpoint DB, assignment index — see 5.4)
  docker-compose.yml Chroma
  .env               OPENROUTER_API_KEY, model ids, Chroma URL
```

### 5.2 Preferences (not RAG)

Preferences are always relevant, so they are **injected into the writer's and QA's system prompts on every call**, never retrieved. *(Claude's call, owner agreed.)*

Stored in `data/preferences.json`:
- `tone` (text)
- `audience` (text)
- `emoji` (none / light / heavy)
- `hashtags` (text describing style, e.g. "2–3, lowercase")
- `extra` (free text — anything else)

Edited from the **preferences desk** in the lobby.

### 5.3 Notes (RAG)

Notes are the user's library of ideas: topics, stories, opinions, facts, liked past posts. RAG is only meaningful with a decent volume (~30+ notes); the owner should seed enough to see retrieval choose.

**Input UX** — the **notes cabinet** in the lobby opens a panel:
- textbox to type/paste a note (+ add)
- drop zone for `.txt` / `.md` files
- list of notes with delete

**Save flow** *(owner agreed)*:
1. Browser reads dropped files with `file.text()`; typed notes and files both `POST /api/notes {title, text, source}` as JSON (no multipart). `source` is the filename for dropped files and `"typed"` for typed notes. *(Claude's call.)*
2. Server validates: `.txt`/`.md` only (by source name), ≤1 MB, non-empty.
3. Server writes the original to `data/notes/<id>.md`.
4. Server splits with a LangChain text splitter (markdown-aware for `.md`), embeds chunks via an OpenRouter embedding model, and stores them in a Chroma collection with metadata `{noteId, title, source, chunkIndex, createdAt}`.
5. Delete removes the file and all chunks where `noteId` matches.

**Re-index:** a script that wipes the collection and re-embeds every file in `data/notes/` — needed when the embedding model changes. The Chroma collection name should include the embedding model id so mismatched vectors can't mix. *(Claude's call.)*

### 5.4 Assignments and the LangGraph pipeline

An **assignment** = one post request: `{platform, ask}`. Platforms: X, LinkedIn, Instagram caption. Each assignment is one LangGraph thread (`thread_id = assignmentId`).

**Graph state** (shape, not final code):
```
assignmentId, platform, ask,
preferences,                 // snapshot at start
draft, retrievedNotes[],     // from writer: every chunk any search returned
usedNoteIds[],               // from writer: the notes the post actually relies on
qaReview { verdict: "pass" | "needs_revision", issues[], suggestions[] },
userDecision { action: "approve" | "revise" | "discard", feedback? },
round (1..3), status, finalPost
```

**Nodes:**
- `write` — Writer agent (`createAgent`) with one tool, `search_notes(query)`, which queries Chroma and returns chunks. The writer decides what to search. Every tool result is captured into `retrievedNotes`. The writer's final answer is **structured** — `{post, usedNoteIds[]}` (e.g. via `createAgent`'s structured response format) — so the UI can show **found-and-used** vs **found-but-not-used** separately *(owner's choice)*. `usedNoteIds` must be a subset of retrieved note ids; anything else is dropped. Because the final answer is structured, the post is not token-streamed: instead each `search_notes` call (its query and how many chunks came back) is streamed live as it happens, and the post appears when the writer finishes. *(Claude's call.)* On revision rounds it also receives the previous draft, QA's review, and the user's feedback.
- `qa_review` — QA agent produces a **structured** review (zod schema) checking: tone/audience/emoji/hashtag preferences, platform fit, and grounding (does the draft claim things not in the **used** notes?).
- Platform length limits (X 280, Instagram 2,200, LinkedIn 3,000 chars) are also checked **in code**, deterministically, and added to QA's issues — not left only to the model. *(Claude's call.)*
- `human_review` — calls `interrupt({draft, qaReview, retrievedNotes, round})`. Resumed by the user's decision.
- Routing: `approve` → set `finalPost`, status `approved`, end. `revise` and `round < 3` → back to `write` with `round + 1`. `discard` → status `discarded`, end (draft kept in history, no final post). At round 3, revise is not offered: the user approves or discards. *(Claude's call on what happens at the cap.)*
- The writer's tool loop is capped (e.g. at most 4 `search_notes` calls per run) so one round can't spiral. *(Claude's call.)*
- QA does not search notes itself; it checks grounding against the notes the writer retrieved. *(Claude's call — keeps QA's input identical to what the user sees.)*

**QA "collaborates" with the user** by presenting its review and a recommendation; the user's free-text feedback plus QA's issues together form the revision brief for the writer.

**Persistence:** a checkpointer that writes to disk (e.g. LangGraph's SQLite checkpointer) so a paused assignment survives a server restart. A small assignment index (id, platform, ask, status, createdAt) lets the UI list them. *(Claude's call.)*

**Concurrency:** one active assignment at a time in v1 is acceptable; the data model should not prevent several.

### 5.5 Models

**Free models only by default** *(owner's choice)*, with an in-app **model picker** so the owner can switch models (including to paid ones) without editing files.

Verified 2026-11-23 against OpenRouter's public endpoints (no key needed):
- `GET https://openrouter.ai/api/v1/models` — 477 chat models; each has `pricing` (free = prompt and completion `"0"`), `supported_parameters` (contains `"tools"` if tool calling works), `context_length` and `expiration_date`. 13 models were free and tool-capable that day.
- `GET https://openrouter.ai/api/v1/embeddings/models` — 40 embedding models, 3 free (e.g. `nvidia/nemotron-3.5-embed-1b:free`).
- Free model ids come and go (`expiration_date`), which is another reason for a picker rather than hard-coded ids.

**Model picker** *(Claude's call on placement and rules)*:
- Lives at a **reception/settings desk** in the lobby, next to the preferences desk.
- One dropdown per role: **Writer**, **QA**. Server proxies and caches the OpenRouter model list (e.g. 1 hour) and returns it to the client.
- Writer list shows only models with `"tools"` in `supported_parameters`. QA needs structured output: the list prefers models supporting `response_format`/`structured_outputs`; the builder decides the exact filter.
- "Free only" toggle, on by default; prices shown when off.
- Choice saved in `data/settings.json`; `.env` (`WRITER_MODEL`, `QA_MODEL`) supplies defaults. A new choice applies to the next graph node that runs, not mid-call.
- **Embedding model is not in the picker.** It is set in `.env` (`EMBEDDING_MODEL`, a free model by default) because changing it requires a full re-index (5.3).

**Living with free-tier limits** *(Claude's call)*: free models have per-minute and per-day request caps.
- Retry with backoff on HTTP 429 (LangChain's built-in retries are fine), then give up into the agent error state.
- Error message on repeated rate limits says so plainly and suggests switching model in the picker.
- Writer tool loop is capped (5.4) so one round is a bounded number of requests.
- Automated tests use fake models and never hit OpenRouter (5.9).

**Integrations:**
- Chat: OpenRouter via LangChain's dedicated OpenRouter chat integration (LangChain's docs list one for JS and recommend it over pointing `ChatOpenAI` at OpenRouter). Builder confirms the exact JS package name; fallback is `ChatOpenAI` with OpenRouter's base URL.
- Embeddings: if LangChain JS has no OpenRouter embeddings class, use `OpenAIEmbeddings` pointed at OpenRouter's OpenAI-compatible endpoint.

### 5.6 Server API (shape)

```
GET    /api/preferences            PUT /api/preferences
GET    /api/notes                  POST /api/notes        DELETE /api/notes/:id
POST   /api/assignments            {platform, ask}  → starts graph
GET    /api/assignments            list
GET    /api/assignments/:id        current state (draft, review, sources, round)
POST   /api/assignments/:id/decision  {action, feedback?} → resumes graph
POST   /api/assignments/:id/retry  re-runs the failed node
GET    /api/models                 cached OpenRouter model list (filtered per role)
GET    /api/settings               PUT /api/settings      chosen writer/QA models
GET    /api/events                 SSE: agent states, writer search calls, assignment updates
```

### 5.7 Frontend — the office

**Layout** *(owner picked option A: cutaway tower)*:
```
 ┌──────────────────────┬──┐
 │ Research  (locked)   │  │
 ├──────────────────────┤ E│
 │ Creative  (locked)   │ L│
 ├──────────────────────┤ E│
 │ QA studio    agent   │ V│
 ├──────────────────────┤  │
 │ Writer       agent   │  │
 ├──────────────────────┤  │
 │ Lobby · notes cabinet│  │  ◄ start
 │   · preferences desk │  │
 │   · reception desk   │  │
 └──────────────────────┴──┘
```

Proposed by Claude, agreed by owner:
- Building sliced open like a dollhouse; one floor in focus, camera follows the player at a fixed side angle; other floors visible but dimmed.
- WASD movement; collision only against the current floor's walls/furniture (simple boxes, no physics engine).
- Elevator is a doorway: walk in → floor picker → camera glides to the new floor. Locked floors listed but greyed.
- Walk up to an agent or object + press **E** → an HTML overlay panel opens (regular DOM over the canvas, not 3D UI).
- Agent state bubbles visible from anywhere: idle, "…" thinking (model running), "!" waiting for user.
- Writer → QA handoff is shown in-scene: a paper icon floats up to the QA floor and QA's "!" lights up.
- Locked floors: grey, "Coming soon" sign.
- Art: free CC0 low-poly assets (Kenney furniture/characters), not custom-modelled.

**Panels:**
- *Notes cabinet* — notes panel (5.3).
- *Preferences desk* — preferences form (5.2).
- *Reception* — model picker (5.5).
- *Writer agent* — new assignment (platform + ask); live feed of the writer's searches ("searching notes: 'CLI launch' → 5 chunks"); the finished draft; source cards split into **Used** and **Found, not used**; the list of past assignments with their status. *(Claude's call on where the list lives.)*
- *QA agent* — draft, QA's structured review, the same Used / Found-not-used source cards, round counter, approve / revise (with feedback) / discard; copy button on approved post.

### 5.8 Errors

- OpenRouter call fails → agent shows an error state with a **Retry** action that re-runs the failed node from the last checkpoint; assignment stays resumable. *(Claude's call.)*
- Chroma unreachable → server reports it clearly at startup and on note/retrieval calls.
- Invalid note upload → rejected with the reason shown in the panel.

### 5.9 Testing

- Graph routing (approve ends; revise loops; round cap holds) with a fake chat model (LangChain's fake/test models), no network.
- Note ingest: validation, file written, chunks tagged with `noteId`, delete removes both.
- Deterministic platform-length check.
- Writer output: `usedNoteIds` not in the retrieved set are dropped.
- Model list filtering (free toggle, tools-only for writer) against a saved sample of the OpenRouter response.
- 3D scene: manual check; no automated visual tests in v1.

## 6. Left to the builder

- Chunk size/overlap and number of retrieved chunks.
- Default model ids in `.env` (free; writer must support tool calling).
- Exact filter for QA-capable models in the picker.
- Prompt wording for writer and QA.
- Which Kenney packs, camera angle/tuning, movement speed, floor dimensions.
- Frontend panel implementation (plain TS DOM is fine; a UI framework is optional).
- Folder structure inside `server/`, `client/`, `shared/`.
- Whether to enable LangSmith tracing (optional; useful for learning).
- Test runner (e.g. Vitest).
