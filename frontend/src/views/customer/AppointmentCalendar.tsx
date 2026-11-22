import { describeSchedule, type AvailabilityDay, type MonthAvailability } from "../../services/appointments";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const UNAVAILABLE_REASON: Record<Exclude<AvailabilityDay["state"], "open">, string> = {
  past: "not available",
  closed: "shop closed",
  unavailable: "not open for booking yet",
  full: "fully booked",
};

interface Props {
  /** First day of the month shown. */
  month: Date;
  availability: MonthAvailability | null;
  error: string;
  selectedDate: string | null;
  canPrev: boolean;
  canNext: boolean;
  onMonth: (offset: number) => void;
  onSelect: (date: string) => void;
}

/** Month calendar for picking an appointment date; only open days are selectable. */
export function AppointmentCalendar({ month, availability, error, selectedDate, canPrev, canNext, onMonth, onSelect }: Props) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const lead = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  const byDate = new Map(availability?.days.map(day => [day.date, day]));

  const cells = Array.from({ length: total }, (_, index) => {
    const date = new Date(year, monthIndex, index - lead + 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const inMonth = date.getMonth() === monthIndex;
    const isToday = availability?.today === key;
    const day = inMonth ? byDate.get(key) : undefined;
    const label = date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const classes = ["ap-day"];
    if (isToday) classes.push("ap-day-today");

    if (day?.state === "open") {
      const selected = selectedDate === key;
      if (selected) classes.push("ap-day-selected");
      return <button key={key} type="button" className={[...classes, "ap-day-open"].join(" ")}
        aria-pressed={selected} aria-label={`${label}, available${isToday ? " (today)" : ""}`} onClick={() => onSelect(key)}>
        <span>{date.getDate()}</span><span className="ap-dot" aria-hidden="true" />
      </button>;
    }
    if (!inMonth) return <div key={key} className={[...classes, "ap-day-outside"].join(" ")} aria-hidden="true">{date.getDate()}</div>;
    classes.push("ap-day-off");
    if (day?.state === "full") classes.push("ap-day-full");
    return <div key={key} className={classes.join(" ")}>
      <span aria-hidden="true">{date.getDate()}</span>
      <span className="ap-sr-only">{`${label}, ${day ? UNAVAILABLE_REASON[day.state] : "loading"}${isToday ? " (today)" : ""}`}</span>
    </div>;
  });

  return <>
    <div className="ev-cal-head">
      <button type="button" className="ev-nav" aria-label="Previous month" disabled={!canPrev} onClick={() => onMonth(-1)}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <h2 id="ap-cal-title" aria-live="polite">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
      <button type="button" className="ev-nav" aria-label="Next month" disabled={!canNext} onClick={() => onMonth(1)}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
    {error && <p className="ev-alert" role="alert">{error}</p>}
    {!availability && !error && <p className="ap-sr-only" role="status">Loading availability…</p>}
    <div className="ev-weekdays" aria-hidden="true">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
    <div className="ev-grid" aria-busy={!availability || undefined}>{cells}</div>
    <div className="ev-legend" aria-hidden="true">
      <span><span className="ev-legend-dot" />Available</span>
      <span><span className="ap-legend-off">8</span>Unavailable</span>
      <span><span className="ev-legend-today" />Today</span>
      <span><span className="ev-legend-selected" />Selected</span>
    </div>
    <div className="ap-cal-info">
      {availability && describeSchedule(availability) && <p><strong>Repair hours:</strong> {describeSchedule(availability)}. {availability.slot_minutes}-minute appointments.</p>}
      <p>Same-day appointments are not available online.</p>
    </div>
  </>;
}
