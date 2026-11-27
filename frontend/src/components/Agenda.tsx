import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type ShopEvent } from "../services/api";
import { SessionApiError, sessionApi } from "../services/session";

/** One upcoming booking: an appointment or an event the customer joined. */
export interface AgendaEntry {
  key: string;
  when: Date;
  title: string;
  detail?: string | null;
  place?: string | null;
  href: string;
}

export interface MyAppointment {
  appointment_id: number;
  /** SQLite text, "YYYY-MM-DD HH:MM:SS". */
  time: string;
  repair_type: string | null;
  description: string;
  status_id: number | null;
}

/** Repairs happen at the shop. */
export const WORKSHOP = "LPVR workshop · Loyola Campus, PS 145";
const CANCELLED = 3;

const parse = (value: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value ?? "");
  return match ? new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]) : null;
};
const upcoming = (entries: AgendaEntry[], now: Date) =>
  entries.filter(entry => entry.when >= now).sort((a, b) => a.when.getTime() - b.when.getTime());

export function appointmentEntries(appointments: MyAppointment[], now = new Date()): AgendaEntry[] {
  return upcoming(appointments.filter(a => a.status_id !== CANCELLED).flatMap(a => {
    const when = parse(a.time);
    return when ? [{ key: `a${a.appointment_id}`, when, title: a.repair_type ?? "Repair appointment", detail: a.description, place: WORKSHOP, href: "appointments.html#mine" }] : [];
  }), now);
}

export function eventEntries(events: ShopEvent[], myEventIds: number[], now = new Date()): AgendaEntry[] {
  return upcoming(events.filter(e => myEventIds.includes(e.event_id) && e.status_id !== CANCELLED).flatMap(e => {
    const when = parse(e.event_date_time);
    return when ? [{ key: `e${e.event_id}`, when, title: e.name, detail: e.description, place: e.location, href: `events.html?id=${e.event_id}` }] : [];
  }), now);
}

export type Loaded<T> = { kind: "loading" } | { kind: "guest" } | { kind: "error"; message: string } | { kind: "ready"; value: T };

/** Load something that needs a customer session; "guest" when signed out. `reload` re-fetches. */
export function useCustomerData<T>(load: () => Promise<T>): [Loaded<T>, () => void] {
  const [state, setState] = useState<Loaded<T>>({ kind: "loading" });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let active = true;
    load().then(value => { if (active) setState({ kind: "ready", value }); }).catch(reason => {
      if (!active) return;
      setState(reason instanceof SessionApiError && reason.signedOut ? { kind: "guest" } : { kind: "error", message: errorMessage(reason) });
    });
    return () => { active = false; };
    // `load` is a module-level function in every caller.
  }, [round]);
  return [state, useCallback(() => setRound(n => n + 1), [])];
}

export const loadMyAppointments = () =>
  sessionApi<{ appointments: MyAppointment[] }>("/api/my-appointments").then(result => appointmentEntries(result.appointments));

/** Everything coming up for the signed-in customer: appointments and joined events, soonest first. */
export const loadMyAgenda = async () => {
  const [mine, events, joined] = await Promise.all([
    sessionApi<{ appointments: MyAppointment[] }>("/api/my-appointments"),
    api<{ events: ShopEvent[] }>("/api/events"),
    sessionApi<{ event_ids: number[] }>("/api/my-events"),
  ]);
  return upcoming([...appointmentEntries(mine.appointments), ...eventEntries(events.events, joined.event_ids)], new Date());
};

const longDate = (when: Date) => when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const time = (when: Date) => when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "Your appointments" / "Your events": the next one highlighted, then the rest. */
export function Agenda({ id, title, state, empty, guest }: {
  id: string; title: string; state: Loaded<AgendaEntry[]>;
  /** Shown when there is nothing coming up. */
  empty: string;
  /** Shown to guests, e.g. "Sign in to see your appointments." */
  guest: string;
}) {
  if (state.kind === "loading") return null;
  const entries = state.kind === "ready" ? state.value : [];
  const [next, ...later] = entries;
  return <section id={id} className="card agenda" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{title}</h2>
    {state.kind === "guest" && <p className="muted"><a href="/views/customer/login.html">{guest}</a></p>}
    {state.kind === "error" && <p className="error" role="alert">{state.message}</p>}
    {state.kind === "ready" && !next && <p className="muted">{empty}</p>}
    {next && <a className="agenda-next" href={next.href}>
      <span className="agenda-date"><strong>{next.when.getDate()}</strong>{next.when.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
      <span className="agenda-body">
        <span className="agenda-label">Next up · {longDate(next.when)} · {time(next.when)}</span>
        <strong>{next.title}</strong>
        {next.place && <span className="muted">{next.place}</span>}
      </span>
    </a>}
    {later.length > 0 && <ul className="agenda-later">{later.map(entry => <li key={entry.key}>
      <a href={entry.href}><span>{longDate(entry.when)} · {time(entry.when)}</span><strong>{entry.title}</strong></a>
    </li>)}</ul>}
  </section>;
}

/** One-line reminder for the home page; renders nothing for guests or when nothing is booked. */
export function NextUp() {
  const [state] = useCustomerData(loadMyAgenda);
  if (state.kind !== "ready" || !state.value.length) return null;
  const next = state.value[0];
  return <a className="card next-up" href={next.href}>
    <span className="agenda-label">Next up</span>
    <strong>{next.title}</strong>
    <span>{longDate(next.when)} · {time(next.when)}{next.place ? ` · ${next.place}` : ""}</span>
    <span className="next-up-go" aria-hidden="true">→</span>
  </a>;
}
