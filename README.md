# AI Office

An "AI agency" you walk around in: a Three.js cutaway high-rise where each floor is a studio staffed by an AI agent. The Writer studio drafts a social media post grounded in your notes (retrieved from Chroma) and shaped by your preferences; the QA studio reviews the draft and you approve it or send it back with feedback (max 3 rounds). Backend: Express + LangChain/LangGraph + Chroma, models via OpenRouter. Frontend: Vite + Three.js.

## Prerequisites

- Node 24 (npm 12)
- Docker Desktop (runs Chroma)
- An OpenRouter API key (free models work)

## First run

```sh
cp .env.example .env          # then set OPENROUTER_API_KEY in .env
docker compose up -d          # Chroma on http://localhost:8000
npm install
npm run dev:server            # API on http://localhost:3001
npm run dev:client            # open http://localhost:5173
```

npm 12 asks you to approve install scripts. `better-sqlite3` is already allow-listed in `package.json`; if its native build is still blocked, run `npm rebuild better-sqlite3`.

## Controls

- **WASD** — walk
- **E** — talk to the agent or use the object you're standing next to
- **Esc** — close a panel
- **Elevator** — walk into it and press E to pick a floor (locked floors are greyed out)

In the lobby: the notes cabinet (your notes), the preferences desk (tone, audience, emoji, hashtags) and reception (pick the writer and QA models).

## Notes

Retrieval only gets interesting with some volume: seed ~30 notes (ideas, stories, opinions, past posts you liked) at the notes cabinet so the writer has something to choose from. The writer panel shows each search it makes and which notes it used.

If you change `EMBEDDING_MODEL` in `.env`, rebuild the index:

```sh
npm run reindex
```

## Tests

```sh
npm test
```
