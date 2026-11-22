import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, formatAmount, type ShopEvent } from "../../services/api";
import { fetchAppointments, fetchCustomers, fetchDashboard, plural, statusName, type AdminAppointment, type AdminOrder, type AdminPayment } from "../../services/admin";

interface DashboardData {
  customerCount: number;
  orders: AdminOrder[];
  payments: AdminPayment[];
  events: ShopEvent[];
  appointments: AdminAppointment[];
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PENDING = 1, COMPLETED = 2, CANCELLED = 3;
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shortDate = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Monthly summary cards and a weekly table of events and appointments. */
export function AdminDashboard({ today = new Date() }: { today?: Date }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      const [customers, dashboard, events, appointments] = await Promise.all([
        fetchCustomers(), fetchDashboard(), api<{ events: ShopEvent[] }>("/api/events").then(d => d.events), fetchAppointments(),
      ]);
      setData({ customerCount: customers.length, orders: dashboard.orders, payments: dashboard.payments, events, appointments });
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const monthKey = dayKey(today).slice(0, 7);
  const todayKey = dayKey(today);
  const monthName = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return <>
    <div className="adm-head">
      <div>
        <h1>Dashboard <span className="adm-month">{monthName}</span></h1>
        <p>Overview of the shop’s customers, orders, events and repairs.</p>
      </div>
    </div>
    {error && <div className="adm-alert" role="alert">{error} <button type="button" className="adm-text-btn" onClick={() => void load()}>Retry</button></div>}
    {!data ? !error && <p role="status">Loading dashboard…</p> : <>
      <Kpis data={data} monthKey={monthKey} todayKey={todayKey} />
      <WeeklySchedule data={data} today={today} offset={weekOffset} onOffset={setWeekOffset} />
    </>}
  </>;
}

function Kpis({ data, monthKey, todayKey }: { data: DashboardData; monthKey: string; todayKey: string }) {
  // Everything except the customer count covers the current calendar month only.
  const inMonth = (value: string | null | undefined) => (value ?? "").slice(0, 7) === monthKey;
  const paid = data.payments.filter(p => p.status_id === COMPLETED && inMonth(p.payment_date));
  const revenue = paid.reduce((total, p) => total + p.amount, 0);
  const pendingOrders = data.orders.filter(o => o.status_id === PENDING && inMonth(o.order_date)).length;
  const upcomingEvents = data.events.filter(e => e.status_id === PENDING && inMonth(e.event_date_time) && (e.event_date_time ?? "").slice(0, 10) >= todayKey).length;
  const cards = [
    { label: "Customers", value: String(data.customerCount), note: "All registered accounts" },
    { label: "Paid revenue", value: formatAmount(revenue), note: `From ${plural(paid.length, "completed payment")}` },
    { label: "Pending orders", value: String(pendingOrders), note: "Waiting to be completed" },
    { label: "Upcoming events", value: String(upcomingEvents), note: "From today to month end" },
  ];
  return <div className="adm-kpis">
    {cards.map(card => <section key={card.label} className="adm-card adm-kpi" aria-label={card.label}>
      <div className="adm-kpi-label">{card.label}</div>
      <div className="adm-kpi-value">{card.value}</div>
      <div className="adm-kpi-note">{card.note}</div>
    </section>)}
  </div>;
}

interface Chip {
  key: string;
  href: string;
  time: string;
  title: string;
  label: string;
  cancelled: boolean;
}

function WeeklySchedule({ data, today, offset, onOffset }: { data: DashboardData; today: Date; offset: number; onOffset: (offset: number) => void }) {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  const days = DAYS.map((_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
  const sunday = days[6];
  const range = `${shortDate(monday)} – ${sunday.getMonth() === monday.getMonth() ? sunday.getDate() : shortDate(sunday)}, ${sunday.getFullYear()}`;
  const onDay = (value: string | null | undefined, date: Date) => (value ?? "").slice(0, 10) === dayKey(date);
  const byTime = (a: { time: string }, b: { time: string }) => a.time.localeCompare(b.time);

  const rows = days.map((date, index) => {
    const events: Chip[] = data.events.filter(e => onDay(e.event_date_time, date)).map(e => ({
      key: `e${e.event_id}`, href: `events.html?id=${e.event_id}`, time: (e.event_date_time ?? "").slice(11, 16), title: e.name,
      label: `Event: ${e.name}, ${e.location || "location not set"}, ${shortDate(date)} at ${(e.event_date_time ?? "").slice(11, 16)}, ${statusName(e.status_id)}`,
      cancelled: e.status_id === CANCELLED,
    })).sort(byTime);
    const appointments: Chip[] = data.appointments.filter(a => onDay(a.appointment_time, date)).map(a => ({
      key: `a${a.appointment_id}`, href: `appointments.html?id=${a.appointment_id}`, time: (a.appointment_time ?? "").slice(11, 16), title: a.description,
      label: `Appointment: ${a.description}, ${a.customer_name}, ${shortDate(date)} at ${(a.appointment_time ?? "").slice(11, 16)}, ${statusName(a.status_id)}`,
      cancelled: a.status_id === CANCELLED,
    })).sort(byTime);
    return { date, name: DAYS[index], isToday: dayKey(date) === dayKey(today), events, appointments };
  });
  const eventCount = rows.reduce((n, row) => n + row.events.length, 0);
  const appointmentCount = rows.reduce((n, row) => n + row.appointments.length, 0);
  const summary = eventCount || appointmentCount ? `${plural(eventCount, "event")}, ${plural(appointmentCount, "appointment")}` : "Nothing scheduled";

  return <section className="adm-card adm-week" aria-labelledby="adm-week-title">
    <div className="adm-card-head">
      <div>
        <h2 id="adm-week-title">Weekly schedule</h2>
        <p className="adm-week-range" aria-live="polite">{range} · {summary}</p>
      </div>
      <div className="adm-week-tools">
        <div className="adm-legend" aria-hidden="true">
          <span><i className="adm-lg-event" />Event</span>
          <span><i className="adm-lg-appt" />Appointment</span>
        </div>
        <div className="adm-week-nav">
          <button type="button" className="adm-pg" aria-label="Previous week" onClick={() => onOffset(offset - 1)}>‹</button>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={offset === 0} onClick={() => onOffset(0)}>This week</button>
          <button type="button" className="adm-pg" aria-label="Next week" onClick={() => onOffset(offset + 1)}>›</button>
        </div>
      </div>
    </div>
    <div className="adm-tbl-wrap">
      <div className="adm-tbl" role="table" aria-label="Events and appointments this week">
        <div className="adm-tr adm-th-row" role="row">
          <div className="adm-th" role="columnheader">Day</div>
          <div className="adm-th" role="columnheader">Events</div>
          <div className="adm-th" role="columnheader">Appointments</div>
        </div>
        {rows.map(row => <div key={row.name} className={`adm-tr${row.isToday ? " adm-today" : ""}`} role="row">
          <div className="adm-day" role="rowheader">
            <span className="adm-day-name">{row.name}</span><span className="adm-muted">{shortDate(row.date)}</span>
            {row.isToday && <span className="adm-today-tag">Today</span>}
          </div>
          <ChipCell chips={row.events} kind="event" />
          <ChipCell chips={row.appointments} kind="appt" />
        </div>)}
      </div>
    </div>
  </section>;
}

function ChipCell({ chips, kind }: { chips: Chip[]; kind: "event" | "appt" }) {
  return <div className="adm-day-cell" role="cell">
    {chips.length ? chips.map(chip => <a key={chip.key} href={chip.href} aria-label={chip.label}
      className={`adm-chip adm-chip-${kind}${chip.cancelled ? " adm-cancelled" : ""}`}>
      <span className="adm-chip-time">{chip.time}</span><span className="adm-chip-title">{chip.title}</span>
    </a>) : <span className="adm-none">—</span>}
  </div>;
}
