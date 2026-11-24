import "./style.css";
import { api, subscribeEvents } from "./api";
import { applyEvent, createStore, initialState } from "./state";

const store = createStore(initialState());

const seed = () =>
  api.listAssignments()
    .then((assignments) => store.set({ ...store.get(), assignments }))
    .catch((err) => console.error("seed failed", err));

seed();
subscribeEvents(
  (e) => {
    console.log("event", e);
    store.set(applyEvent(store.get(), e));
  },
  () => { console.log("reconnected, re-seeding"); seed(); },
);
