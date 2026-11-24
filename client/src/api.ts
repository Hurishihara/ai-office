import type {
  AssignmentSummary, AssignmentView, CreateNoteBody, ModelInfo, NoteSummary,
  Platform, Preferences, ServerEvent, Settings, UserDecision,
} from "@ai-office/shared";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText);
  return data as T;
}

export const errorText = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof TypeError ? "Can't reach the server. Is the backend running?" : String(e);

export const api = {
  getPreferences: () => call<Preferences>("GET", "/preferences"),
  savePreferences: (p: Preferences) => call<Preferences>("PUT", "/preferences", p),
  getSettings: () => call<Settings>("GET", "/settings"),
  saveSettings: (s: Settings) => call<Settings>("PUT", "/settings", s),
  getModels: (role: "writer" | "qa", freeOnly: boolean) =>
    call<ModelInfo[]>("GET", `/models?role=${role}&freeOnly=${freeOnly}`),
  listNotes: () => call<NoteSummary[]>("GET", "/notes"),
  addNote: (b: CreateNoteBody) => call<NoteSummary>("POST", "/notes", b),
  deleteNote: (id: string) => call<unknown>("DELETE", `/notes/${encodeURIComponent(id)}`),
  startAssignment: (platform: Platform, ask: string) => call<AssignmentSummary>("POST", "/assignments", { platform, ask }),
  listAssignments: () => call<AssignmentSummary[]>("GET", "/assignments"),
  getAssignment: (id: string) => call<AssignmentView>("GET", `/assignments/${encodeURIComponent(id)}`),
  decide: (id: string, d: UserDecision) => call<AssignmentView>("POST", `/assignments/${encodeURIComponent(id)}/decision`, d),
  retry: (id: string) => call<AssignmentView>("POST", `/assignments/${encodeURIComponent(id)}/retry`),
};

// onReconnect runs on every open (seeding twice at startup is harmless).
export function subscribeEvents(onEvent: (e: ServerEvent) => void, onReconnect: () => void): () => void {
  let es: EventSource;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    const s = (es = new EventSource("/api/events"));
    s.addEventListener("open", () => onReconnect());
    s.addEventListener("message", (m) => onEvent(JSON.parse((m as MessageEvent).data) as ServerEvent));
    // A non-200 answer (backend down behind the Vite proxy) closes the stream for good; the browser won't retry it.
    s.addEventListener("error", () => { if (s.readyState === EventSource.CLOSED) timer = setTimeout(connect, 2000); });
  };
  connect();
  return () => { clearTimeout(timer); es.close(); };
}
