import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage, type ShopEvent } from "../../services/api";
import { SessionApiError, sessionApi } from "../../services/session";

const STATUS_COMPLETED = 2;
const STATUS_CANCELLED = 3;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** An event with its date parsed; `date` is null when no date is set yet. */
interface CalendarEvent extends ShopEvent {
  date: Date | null;
}

/** Parse "YYYY-MM-DD HH:MM[:SS]" (SQLite text) as local time. */
export function parseEventDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(value ?? "");
  if (!match) return null;
  const [, year, month, day, hour = "0", minute = "0"] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isPast(event: CalendarEvent, today: Date): boolean {
  return event.status_id === STATUS_COMPLETED || (event.date !== null && event.date < startOfDay(today));
}

function isOpen(event: CalendarEvent, today: Date): boolean {
  return (event.status_id == null || event.status_id === 1) && !isPast(event, today);
}

/** The next open event from today, else the most recent dated one, else the first. */
function defaultEvent(events: CalendarEvent[], today: Date): CalendarEvent | undefined {
  const dated = events.filter(event => event.date).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  return dated.find(event => isOpen(event, today)) ?? dated[dated.length - 1] ?? events[0];
}

function CalendarIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
}
function ClockIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}
function PinIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
}

export function EventsPage({ today = new Date() }: { today?: Date }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [loadError, setLoadError] = useState("");
  // Event IDs the signed-in customer joined; null when signed out or not yet known.
  const [myEventIds, setMyEventIds] = useState<number[] | null>(null);
  // Why `myEventIds` is null: signed out, or the registration lookup failed (message).
  const [signedOut, setSignedOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);

  const load = useCallback(async () => {
    const [eventResult, myResult] = await Promise.allSettled([
      api<{ events: ShopEvent[] }>("/api/events"),
      sessionApi<{ event_ids: number[] }>("/api/my-events"),
    ]);
    if (eventResult.status === "rejected") {
      setLoadError(errorMessage(eventResult.reason));
      return null;
    }
    if (myResult.status === "fulfilled") {
      setMyEventIds(myResult.value.event_ids);
      setSignedOut(false);
      setAccountError("");
    } else {
      // Only a missing or rejected session means "sign in"; anything else is a real failure.
      const reason = myResult.reason;
      const isSignedOut = reason instanceof SessionApiError && reason.signedOut;
      setMyEventIds(null);
      setSignedOut(isSignedOut);
      setAccountError(isSignedOut ? "" : errorMessage(reason));
    }
    const parsed = eventResult.value.events.map(event => ({ ...event, date: parseEventDate(event.event_date_time) }));
    setEvents(parsed);
    return parsed;
  }, []);

  useEffect(() => {
    let active = true;
    void load().then(parsed => {
      if (!active || !parsed) return;
      const first = defaultEvent(parsed, today);
      if (first) {
        setSelectedId(first.event_id);
        if (first.date) setMonth(new Date(first.date.getFullYear(), first.date.getMonth(), 1));
      }
    });
    return () => { active = false; };
    // Load once on mount; `today` only seeds the initial selection.
  }, [load]);

  const selected = events?.find(event => event.event_id === selectedId);
  const monthEvents = useMemo(() => (events ?? [])
    .filter(event => event.date && event.date.getFullYear() === month.getFullYear() && event.date.getMonth() === month.getMonth())
    .sort((a, b) => a.date!.getTime() - b.date!.getTime()), [events, month]);
  const undated = (events ?? []).filter(event => !event.date);

  function select(event: CalendarEvent) {
    setSelectedId(event.event_id);
    setActionError("");
    setNeedsSignIn(false);
    setJustRegistered(false);
  }

  async function toggleRegistration(register: boolean) {
    if (!selected || busy) return;
    setActionError("");
    setNeedsSignIn(false);
    setJustRegistered(false);
    if (signedOut) {
      setNeedsSignIn(true);
      return;
    }
    if (myEventIds === null) {
      setActionError(`Could not check your registrations (${accountError}). Please reload the page or try again later.`);
      return;
    }
    setBusy(true);
    try {
      await sessionApi(`/api/my-events/${selected.event_id}`, register ? "POST" : "DELETE");
      await load();
      setJustRegistered(register);
    } catch (reason) {
      if (reason instanceof SessionApiError && reason.signedOut) {
        // The session expired or was revoked since the page loaded.
        setSignedOut(true);
        setMyEventIds(null);
        setNeedsSignIn(true);
      } else {
        setActionError(errorMessage(reason));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <section className="card"><h1>Events &amp; Workshops</h1><p className="error" role="alert">{loadError}</p></section>;
  }

  return <div className="ev-page">
    <header className="ev-header">
      <h1>Events &amp; Workshops</h1>
      <p>Explore upcoming bike rides, workshops, and community events. Select a date to view event details and register.</p>
    </header>
    {!events ? <p role="status">Loading events…</p> : <div className="ev-layout">
      <section className="ev-card ev-details" aria-labelledby="ev-title">
        {selected ? <EventDetails
          event={selected}
          today={today}
          registered={myEventIds?.includes(selected.event_id) ?? false}
          busy={busy}
          justRegistered={justRegistered}
          needsSignIn={needsSignIn}
          error={actionError}
          onRegister={() => void toggleRegistration(true)}
          onCancel={() => void toggleRegistration(false)}
        /> : <div className="ev-empty"><h2 id="ev-title">No events available.</h2><p>Check back soon for new rides and workshops.</p></div>}
      </section>

      <section className="ev-card ev-calendar" aria-labelledby="ev-cal-title">
        <MonthCalendar
          month={month}
          today={today}
          events={monthEvents}
          selectedId={selectedId}
          onMonth={offset => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1))}
          onSelect={select}
        />
        <div className="ev-month-list">
          <h3>Events in {month.toLocaleDateString("en-US", { month: "long" })}</h3>
          {monthEvents.length ? <EventList events={monthEvents} today={today} selectedId={selectedId} myEventIds={myEventIds} onSelect={select} />
            : <p className="ev-muted">No events scheduled this month.</p>}
          {undated.length > 0 && <>
            <h3>Date to be announced</h3>
            <EventList events={undated} today={today} selectedId={selectedId} myEventIds={myEventIds} onSelect={select} />
          </>}
        </div>
      </section>
    </div>}
  </div>;
}

function statusOf(event: CalendarEvent, today: Date, registered: boolean, full: boolean): [string, string] {
  if (event.status_id === STATUS_CANCELLED) return ["Cancelled", "ev-status-closed"];
  if (isPast(event, today)) return ["Past event", "ev-status-closed"];
  if (registered) return ["Registered", "ev-status-registered"];
  if (full) return ["Fully booked", "ev-status-full"];
  if (event.date && sameDay(event.date, today)) return ["Happening today", "ev-status-open"];
  if (!isOpen(event, today)) return ["Registration closed", "ev-status-closed"];
  return ["Open for registration", "ev-status-open"];
}

interface DetailsProps {
  event: CalendarEvent;
  today: Date;
  registered: boolean;
  busy: boolean;
  justRegistered: boolean;
  needsSignIn: boolean;
  error: string;
  onRegister: () => void;
  onCancel: () => void;
}

function EventDetails({ event, today, registered, busy, justRegistered, needsSignIn, error, onRegister, onCancel }: DetailsProps) {
  const full = event.customer_ids.length >= event.participant_limit;
  const open = isOpen(event, today);
  const [statusLabel, statusClass] = statusOf(event, today, registered, full);
  const date = event.date;
  return <>
    {event.image_path ? <img className="ev-photo ev-photo-img" src={event.image_path} alt={`Photo of ${event.name}`} />
      : <div className="ev-photo" role="img" aria-label="Event photo placeholder">
        <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>
        <span className="ev-photo-title">Event photo</span>
        <span>16:9 · to be added</span>
      </div>}

    <div className="ev-summary">
      <div className="ev-date-badge" aria-hidden="true">
        {date ? <>
          <span className="ev-badge-month">{date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
          <span className="ev-badge-day">{date.getDate()}</span>
          <span className="ev-badge-weekday">{WEEKDAYS[date.getDay()]}</span>
        </> : <span className="ev-badge-month">TBA</span>}
      </div>
      <div>
        <p className={`ev-status ${statusClass}`}>{statusLabel}</p>
        <h2 id="ev-title">{event.name}</h2>
      </div>
    </div>

    <div className="ev-body">
      <ul className="ev-meta">
        <li><CalendarIcon /><span>{date ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Date to be announced"}</span></li>
        {date && <li><ClockIcon /><span>{date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span></li>}
        <li><PinIcon /><span>{event.location || "Location to be announced"}</span></li>
      </ul>

      <div>
        <h3>About this event</h3>
        <p className="ev-description">{event.description || "More details coming soon."}</p>
      </div>

      {registered && justRegistered && <div className="ev-confirm" role="status">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg>
        <div><p className="ev-confirm-title">You're registered</p><p>We look forward to seeing you there.</p></div>
      </div>}
      {needsSignIn && <p className="ev-alert" role="alert">
        Please <a href="login.html">sign in</a> with a customer account to register. New here? <a href="signup.html">Create an account</a>.
      </p>}
      {error && <p className="ev-alert" role="alert">{error}</p>}

      <div className="ev-actions">
        {registered && open
          ? <button type="button" className="ev-button ev-button-secondary" disabled={busy} onClick={onCancel}>{busy ? "Cancelling…" : "Cancel registration"}</button>
          : registered ? null
          : !open ? <button type="button" className="ev-button" disabled>Registration closed</button>
          : full ? <button type="button" className="ev-button" disabled>Event full</button>
          : <button type="button" className="ev-button ev-button-primary" disabled={busy} onClick={onRegister}>{busy ? "Registering…" : "Register now"}</button>}
      </div>
    </div>
  </>;
}

interface CalendarProps {
  month: Date;
  today: Date;
  events: CalendarEvent[];
  selectedId: number | null;
  onMonth: (offset: number) => void;
  onSelect: (event: CalendarEvent) => void;
}

function MonthCalendar({ month, today, events, selectedId, onMonth, onSelect }: CalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const lead = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  const monthName = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cells = Array.from({ length: total }, (_, index) => {
    const date = new Date(year, monthIndex, index - lead + 1);
    const inMonth = date.getMonth() === monthIndex;
    const dayEvents = inMonth ? events.filter(event => sameDay(event.date!, date)) : [];
    const isToday = sameDay(date, today);
    const classes = ["ev-day"];
    if (!inMonth) classes.push("ev-day-outside");
    else if (date < startOfDay(today)) classes.push("ev-day-past");
    if (isToday) classes.push("ev-day-today");
    if (!dayEvents.length) {
      return <div key={index} className={classes.join(" ")} aria-hidden={!inMonth || undefined}>{date.getDate()}</div>;
    }
    // Repeated clicks on a day with several events cycle through them.
    const current = dayEvents.findIndex(event => event.event_id === selectedId);
    const selected = current !== -1;
    classes.push("ev-day-event");
    if (selected) classes.push("ev-day-selected");
    const label = `${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}: ${dayEvents.map(event => event.name).join(", ")}${isToday ? " (today)" : ""}`;
    return <button key={index} type="button" className={classes.join(" ")} aria-label={label} aria-pressed={selected}
      onClick={() => onSelect(dayEvents[(current + 1) % dayEvents.length])}>
      <span>{date.getDate()}</span><span className="ev-dot" aria-hidden="true" />
    </button>;
  });

  return <>
    <div className="ev-cal-head">
      <button type="button" className="ev-nav" aria-label="Previous month" onClick={() => onMonth(-1)}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <h2 id="ev-cal-title" aria-live="polite">{monthName}</h2>
      <button type="button" className="ev-nav" aria-label="Next month" onClick={() => onMonth(1)}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
    <div className="ev-weekdays" aria-hidden="true">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
    <div className="ev-grid">{cells}</div>
    <div className="ev-legend" aria-hidden="true">
      <span><span className="ev-legend-dot" />Event day</span>
      <span><span className="ev-legend-today" />Today</span>
      <span><span className="ev-legend-selected" />Selected</span>
    </div>
  </>;
}

interface ListProps {
  events: CalendarEvent[];
  today: Date;
  selectedId: number | null;
  myEventIds: number[] | null;
  onSelect: (event: CalendarEvent) => void;
}

function EventList({ events, today, selectedId, myEventIds, onSelect }: ListProps) {
  return <ul className="ev-list">{events.map(event => {
    const left = event.participant_limit - event.customer_ids.length;
    const spots = myEventIds?.includes(event.event_id) ? "Registered"
      : event.status_id === STATUS_CANCELLED ? "Cancelled"
      : isPast(event, today) ? "Ended"
      : left <= 0 ? "Full" : `${left} left`;
    const selected = event.event_id === selectedId;
    return <li key={event.event_id}>
      <button type="button" className={`ev-list-item${selected ? " ev-list-item-selected" : ""}`} aria-pressed={selected} onClick={() => onSelect(event)}>
        <span className="ev-list-date">{event.date ? event.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBA"}</span>
        <span className="ev-list-name">{event.name}</span>
        <span className="ev-list-spots">{spots}</span>
      </button>
    </li>;
  })}</ul>;
}
