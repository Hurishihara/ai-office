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

export function subscribeEvents(onEvent: (e: ServerEvent) => void, onReconnect: () => void): () => void {
  const es = new EventSource("/api/events");
  let opened = false;
  es.addEventListener("open", () => {
    if (opened) onReconnect();
    opened = true;
  });
  es.addEventListener("message", (m) => onEvent(JSON.parse((m as MessageEvent).data) as ServerEvent));
  return () => es.close();
}
