import { useCallback, useEffect, useState } from "react";
import { Agenda, type AgendaEntry } from "../../components/Agenda";
import { photoStyle } from "../../components/Photo";
import { TrendChart, type TrendPoint } from "../../components/TrendChart";
import { api, errorMessage, formatAmount, type Item, type ShopEvent } from "../../services/api";
import {
  fetchAppointments, fetchCustomers, fetchDashboard, fetchStockHistory, plural, statusName,
  type AdminAppointment, type AdminCustomer, type AdminOrder, type AdminPayment, type StockChange,
} from "../../services/admin";
import { StockLabel, stockStatus } from "../customer/addToCart";

interface DashboardData {
  customers: AdminCustomer[];
  orders: AdminOrder[];
  payments: AdminPayment[];
  events: ShopEvent[];
  appointments: AdminAppointment[];
  items: Item[];
  stock: StockChange[];
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
  const [months, setMonths] = useState(6);

  const load = useCallback(async () => {
    try {
      const [customers, dashboard, events, appointments, items, stock] = await Promise.all([
        fetchCustomers(), fetchDashboard(), api<{ events: ShopEvent[] }>("/api/events").then(d => d.events), fetchAppointments(),
        api<{ items: Item[] }>("/api/inventory").then(d => d.items), fetchStockHistory(),
      ]);
      setData({ customers, orders: dashboard.orders, payments: dashboard.payments, events, appointments, items, stock });
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
    <div className="adm-head adm-hero photo-hero" style={photoStyle("header-tool-wall")}>
      <div>
        <h1>Dashboard <span className="adm-month">{monthName}</span></h1>
        <p>Overview of the shop’s customers, orders, events and repairs.</p>
      </div>
    </div>
    {error && <div className="adm-alert" role="alert">{error} <button type="button" className="adm-text-btn" onClick={() => void load()}>Retry</button></div>}
    {!data ? !error && <p role="status">Loading dashboard…</p> : <>
      <Kpis data={data} monthKey={monthKey} todayKey={todayKey} />
      <div className="adm-glance">
        <Agenda id="adm-next" title="Next up" state={{ kind: "ready", value: nextUp(data, today) }}
          empty="Nothing booked in the coming weeks." guest="" />
        <NeedsAttention data={data} todayKey={todayKey} />
      </div>
      <Trends data={data} today={today} months={months} onMonths={setMonths} />
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
    { label: "Customers", value: String(data.customers.length), note: "All registered accounts", href: "customers.html" },
    { label: "Paid revenue", value: formatAmount(revenue), note: `From ${plural(paid.length, "completed payment")}`, href: "payments.html" },
    { label: "Pending orders", value: String(pendingOrders), note: "Waiting to be completed", href: "orders.html" },
    { label: "Upcoming events", value: String(upcomingEvents), note: "From today to month end", href: "events.html" },
  ];
  return <div className="adm-kpis">
    {cards.map(card => <a key={card.label} href={card.href} className="adm-card adm-kpi" aria-label={`${card.label}: ${card.value}`}>
      <div className="adm-kpi-label">{card.label}</div>
      <div className="adm-kpi-value">{card.value}</div>
      <div className="adm-kpi-note">{card.note}</div>
    </a>)}
  </div>;
}

const atTime = (value: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value ?? "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
};

/** The next appointments and events (with who and how full), soonest first. */
function nextUp(data: DashboardData, today: Date): AgendaEntry[] {
  const now = today.getTime();
  const entries: AgendaEntry[] = [
    ...data.appointments.filter(a => a.status_id !== CANCELLED).flatMap(a => {
      const when = atTime(a.appointment_time);
      // Online bookings read "<repair type>: <details>"; the type is enough here.
      const title = a.description.split(": ")[0] || a.description;
      return when ? [{ key: `a${a.appointment_id}`, when, title, place: `Repair for ${a.customer_name}`, href: `appointments.html?id=${a.appointment_id}` }] : [];
    }),
    ...data.events.filter(e => e.status_id === PENDING).flatMap(e => {
      const when = atTime(e.event_date_time);
      return when ? [{ key: `e${e.event_id}`, when, title: e.name, place: `${e.customer_ids.length} / ${e.participant_limit} registered${e.location ? ` · ${e.location}` : ""}`, href: `events.html?id=${e.event_id}` }] : [];
    }),
  ];
  return entries.filter(entry => entry.when.getTime() >= now).sort((a, b) => a.when.getTime() - b.when.getTime()).slice(0, 5);
}

/** Things to act on: stock running low, orders waiting, events filling up. */
function NeedsAttention({ data, todayKey }: { data: DashboardData; todayKey: string }) {
  const low = data.items.filter(item => stockStatus(item.stock_quantity).tone !== "in")
    .sort((a, b) => (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0));
  const pending = data.orders.filter(o => o.status_id === PENDING).length;
  const filling = data.events.filter(e => e.status_id === PENDING && (e.event_date_time ?? "").slice(0, 10) >= todayKey
    && e.customer_ids.length >= e.participant_limit * 0.8);
  return <section className="card adm-attention" aria-labelledby="adm-attention-title">
    <h2 id="adm-attention-title">Needs attention</h2>
    <ul>
      <li><a href="inventory.html"><strong>{plural(low.length, "item")} low or out of stock</strong>
        {low.slice(0, 3).map(item => <span key={item.item_id} className="adm-att-item">{item.name} <StockLabel stock={item.stock_quantity} /></span>)}</a></li>
      <li><a href="orders.html"><strong>{plural(pending, "pending order")}</strong><span className="adm-muted">Waiting to be completed</span></a></li>
      <li><a href="events.html"><strong>{plural(filling.length, "event")} nearly full</strong>
        {filling.slice(0, 2).map(e => <span key={e.event_id} className="adm-muted">{e.name} · {e.customer_ids.length} / {e.participant_limit}</span>)}</a></li>
    </ul>
  </section>;
}

/** Month-by-month charts of the basics, over the last 6 or 12 months. */
function Trends({ data, today, months, onMonths }: { data: DashboardData; today: Date; months: number; onMonths: (n: number) => void }) {
  const range = Array.from({ length: months }, (_, i) => new Date(today.getFullYear(), today.getMonth() - months + 1 + i, 1));
  const key = (d: Date) => dayKey(d).slice(0, 7);
  const series = (value: (month: string, end: string) => number): TrendPoint[] => range.map(d => ({
    label: d.toLocaleDateString("en-US", { month: "short" }),
    title: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    value: value(key(d), dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 1))),
  }));
  const inMonth = (value: string | null | undefined, month: string) => (value ?? "").slice(0, 7) === month;
  const revenue = series(m => data.payments.filter(p => p.status_id === COMPLETED && inMonth(p.payment_date, m)).reduce((t, p) => t + p.amount, 0));
  const orders = series(m => data.orders.filter(o => inMonth(o.order_date, m)).length);
  // Accounts without a sign-up time existed before tracking started.
  const customers = series((_, end) => data.customers.filter(c => !c.created_at || c.created_at < end).length);
  const stock = series((_, end) => {
    const latest = new Map<number, number>();
    for (const change of data.stock) if (change.created_at < end) latest.set(change.item_id, change.new_quantity);
    return [...latest.values()].reduce((t, q) => t + q, 0);
  });
  const events = series(m => data.events.filter(e => e.status_id !== CANCELLED && inMonth(e.event_date_time, m)).length);
  const appointments = series(m => data.appointments.filter(a => a.status_id !== CANCELLED && inMonth(a.appointment_time, m)).length);
  return <section className="adm-card adm-trends" aria-labelledby="adm-trends-title">
    <div className="adm-card-head">
      <div><h2 id="adm-trends-title">Trends</h2><p className="adm-week-range">Month by month; hover a month for its value.</p></div>
      <div className="adm-range" role="group" aria-label="Range">
        {[6, 12].map(n => <button key={n} type="button" className="adm-pill" aria-pressed={months === n} onClick={() => onMonths(n)}>Last {n} months</button>)}
      </div>
    </div>
    <div className="adm-trend-grid">
      <TrendChart title="Paid revenue" points={revenue} format={formatAmount} />
      <TrendChart title="Orders" points={orders} />
      <TrendChart title="Customers" note="Total accounts" points={customers} kind="line" />
      <TrendChart title="Units in stock" note="All items, end of month" points={stock} kind="line" />
      <TrendChart title="Events" points={events} />
      <TrendChart title="Appointments" points={appointments} />
    </div>
  </section>;
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
