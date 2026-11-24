import { MAX_ROUNDS, type AssignmentView, type UserDecision } from "@ai-office/shared";
import { api, errorText } from "../api";
import { Panel, withBusy } from "./panel";
import { el, renderDraft } from "./sources";
import type { Store } from "./writerPanel";

const FEEDBACK_MAX = 2000;

export function openQaPanel(store: Store): void {
  const list = store.get().assignments;
  const target = list.find((a) => a.status === "awaiting_user") ?? list[0];
  let seenStatus = target?.status;
  const panel = new Panel({ title: "QA review", onClose: () => off() });
  const msg = el("div");
  msg.setAttribute("role", "status");
  const view = document.createElement("div");
  panel.body.append(msg, view);
  const off = store.subscribe((s) => {
    const a = s.assignments.find((x) => x.id === target?.id);
    if (a && a.status !== seenStatus) { seenStatus = a.status; void load(); }
  });
  if (!target) { view.textContent = "Nothing to review yet."; panel.open(); return; }

  const list_ = (title: string, items: string[]) => {
    const box = el("div");
    if (items.length) { box.append(el("strong", title)); const ul = el("ul"); ul.append(...items.map((i) => el("li", i))); box.append(ul); }
    return box;
  };

  // created once so typed feedback survives re-renders
  const fb = Object.assign(document.createElement("textarea"), { rows: 3, maxLength: FEEDBACK_MAX, placeholder: "Feedback for the writer (needed to revise)" });
  const render = (v: AssignmentView) => {
    seenStatus = v.status;
    if (v.status !== "awaiting_user") fb.value = ""; // the revision went out or the review is over
    const parts: HTMLElement[] = [el("div", `Round ${v.round} of ${MAX_ROUNDS} — ${v.status}`)];
    if (v.status === "error") {
      const retry = el("button", "Retry");
      retry.onclick = () => withBusy(retry, () => act(() => api.retry(v.id)));
      parts.push(el("div", v.error ?? "Unknown error"), retry);
    } else if (v.status === "writing" || v.status === "reviewing") {
      parts.push(el("div", "Still working…"));
    }
    parts.push(renderDraft(v));
    if (v.qaReview) parts.push(el("div", `QA verdict: ${v.qaReview.verdict === "pass" ? "pass" : "needs revision"}`), list_("Issues", v.qaReview.issues), list_("Suggestions", v.qaReview.suggestions));
    if (v.status === "approved" && v.finalPost !== null) {
      const post = v.finalPost;
      const copy = el("button", "Copy");
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(post); copy.textContent = "Copied"; }
        catch { msg.textContent = "Couldn't copy automatically. Select the post text above and copy it by hand."; }
      };
      const pre = el("pre", post, "final-post");
      pre.style.cssText = "white-space:pre-wrap;margin:0;font:inherit";
      parts.push(el("h3", "Approved post"), pre, copy);
    }
    if (v.status === "awaiting_user") {
      const approve = el("button", "Approve");
      const discard = el("button", "Discard");
      approve.onclick = () => withBusy(approve, () => act(() => api.decide(v.id, { action: "approve" })));
      discard.onclick = () => withBusy(discard, () => act(() => api.decide(v.id, { action: "discard" })));
      parts.push(approve);
      if (v.canRevise) {
        const revise = el("button", "Revise");
        revise.onclick = () => withBusy(revise, async () => {
          const feedback = fb.value.trim();
          if (!feedback) { msg.textContent = "Write feedback before asking for a revision."; return; }
          const d: UserDecision = { action: "revise", feedback };
          await act(() => api.decide(v.id, d));
        });
        parts.push(fb, revise);
      }
      parts.push(discard);
    }
    view.replaceChildren(...parts);
  };
  let seq = 0; // only the latest request may render (responses can arrive out of order)
  const show = async (p: Promise<AssignmentView>) => {
    const n = ++seq;
    const v = await p;
    if (n === seq) render(v);
  };
  const load = async () => {
    try { await show(api.getAssignment(target.id)); } catch (e) { msg.textContent = errorText(e); }
  };
  // on 409/400 show the message, then reload so the panel matches the server
  const act = async (fn: () => Promise<AssignmentView>) => {
    msg.textContent = "";
    try { await show(fn()); } catch (e) { msg.textContent = errorText(e); await load(); }
  };
  panel.open();
  void load();
}
