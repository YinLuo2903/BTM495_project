import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { errorMessage, type CustomerProfile } from "../../services/api";
import {
  REPAIR_TYPES, bookAppointment, fetchAvailability, formatLongDate, formatSlot, monthKey,
  type BookedAppointment, type MonthAvailability,
} from "../../services/appointments";
import { SessionApiError, sessionApi } from "../../services/session";
import { Agenda, loadMyAppointments, useCustomerData } from "../../components/Agenda";
import { AppointmentCalendar } from "./AppointmentCalendar";
import { DESCRIPTION_MAX, canContinue, validateIssue, type IssueDetails, type IssueErrors } from "./appointmentValidation";

/** Matches BOOKING_WINDOW_DAYS in backend/apis/appointment_booking_api.py. */
const BOOKING_WINDOW_DAYS = 90;
const STEP_LABELS = ["Select Date & Time", "Describe Issue", "Confirm Booking"];

type Step = 1 | 2 | 3 | "done";
type Account =
  | { kind: "loading" }
  | { kind: "customer"; name: string }
  | { kind: "guest" }
  | { kind: "error"; message: string };

const EMPTY_DETAILS: IssueDetails = { repairType: "", description: "" };

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function AppointmentsPage({ today = new Date() }: { today?: Date }) {
  const firstMonth = startOfMonth(today);
  const lastMonth = startOfMonth(new Date(today.getFullYear(), today.getMonth(), today.getDate() + BOOKING_WINDOW_DAYS));
  const [month, setMonth] = useState(firstMonth);
  const [availability, setAvailability] = useState<Record<string, MonthAvailability>>({});
  const [calendarError, setCalendarError] = useState("");
  const [account, setAccount] = useState<Account>({ kind: "loading" });

  const [step, setStep] = useState<Step>(1);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [details, setDetails] = useState<IssueDetails>(EMPTY_DETAILS);
  const [errors, setErrors] = useState<IssueErrors>({});
  const [slotNotice, setSlotNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [booked, setBooked] = useState<BookedAppointment | null>(null);
  const [mine, reloadMine] = useCustomerData(loadMyAppointments);

  const stepHeading = useRef<HTMLHeadingElement>(null);
  const movedStep = useRef(false);

  const loadMonth = useCallback(async (key: string) => {
    try {
      const data = await fetchAvailability(key);
      setAvailability(previous => ({ ...previous, [key]: data }));
      setCalendarError("");
    } catch (reason) {
      setCalendarError(errorMessage(reason));
    }
  }, []);

  // Refresh availability whenever a month is shown, so booked slots stay current.
  useEffect(() => { void loadMonth(monthKey(month)); }, [month, loadMonth]);

  // Re-runnable: a guest may sign in from another tab while this page is open.
  const loadAccount = useCallback(async (isActive: () => boolean = () => true) => {
    try {
      const result = await sessionApi<{ customer: CustomerProfile }>("/api/profile");
      if (isActive()) setAccount({ kind: "customer", name: `${result.customer.first_name} ${result.customer.last_name}`.trim() });
    } catch (reason) {
      if (!isActive()) return;
      setAccount(reason instanceof SessionApiError && reason.signedOut ? { kind: "guest" } : { kind: "error", message: errorMessage(reason) });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadAccount(() => active);
    return () => { active = false; };
  }, [loadAccount]);

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (movedStep.current) stepHeading.current?.focus();
  }, [step]);

  function goTo(next: Step) {
    movedStep.current = true;
    setStep(next);
  }

  const selectedMonth = date ? availability[date.slice(0, 7)] : undefined;
  const selectedDay = selectedMonth?.days.find(day => day.date === date);

  function selectDate(key: string) {
    if (step === "done") {
      setDetails(EMPTY_DETAILS);
      setBooked(null);
    }
    if (key !== date) setSlot(null);
    setDate(key);
    setSlotNotice("");
    setSubmitError("");
    setNeedsSignIn(false);
    if (step !== 1) goTo(1);
  }

  function review() {
    const found = validateIssue(details);
    setErrors(found);
    if (!found.repairType && !found.description) goTo(3);
  }

  async function confirm() {
    if (!date || !slot || submitting) return;
    setSubmitError("");
    setNeedsSignIn(false);
    // No client-side guest check: the session lives in localStorage and may have
    // been created in another tab since this page loaded. The server decides.
    setSubmitting(true);
    try {
      const appointment = await bookAppointment({ date, time: slot, repair_type: details.repairType, description: details.description.trim() });
      setBooked(appointment);
      reloadMine();
      if (account.kind !== "customer") void loadAccount();
      goTo("done");
      void loadMonth(date.slice(0, 7));
    } catch (reason) {
      if (reason instanceof SessionApiError && reason.status === 409) {
        // Someone else took the slot: refresh times and let the customer pick again.
        setSlot(null);
        setSlotNotice(reason.message);
        void loadMonth(date.slice(0, 7));
        goTo(1);
      } else if (reason instanceof SessionApiError && reason.signedOut) {
        setAccount({ kind: "guest" });
        setNeedsSignIn(true);
      } else {
        setSubmitError(errorMessage(reason));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setDate(null);
    setSlot(null);
    setDetails(EMPTY_DETAILS);
    setErrors({});
    setBooked(null);
    goTo(1);
  }

  const customerName = account.kind === "customer" ? account.name || "Your account"
    : account.kind === "guest" ? "Sign in to confirm"
    : account.kind === "loading" ? "Loading…" : "Unavailable";
  const summary: [string, string][] = date && slot ? [
    ["Customer name", customerName],
    ["Date", formatLongDate(date)],
    ["Time", formatSlot(slot)],
    ["Repair type", details.repairType],
    ["Issue description", details.description.trim()],
  ] : [];

  return <div className="ev-page ap-page">
    <header className="ev-header">
      <h1>Book a Repair Appointment</h1>
      <p>Schedule a bike repair with LPVR. Select an available time, describe your bike issue, and confirm your appointment.</p>
    </header>
    <Agenda id="mine" title="Your appointments" state={mine} empty="No upcoming appointments yet. Book one below."
      guest="Sign in to see your appointments." />
    <div className="ev-layout" id="book">
      <section className="ev-card ev-details" aria-labelledby="ap-step-title">
        <StepIndicator step={step} />
        <div className="ap-body ap-step-in" key={String(step)}>
          {step === 1 && <>
            <StepTitle headingRef={stepHeading} title="Select a date & time" intro="Pick an available date on the calendar, then choose one time slot." />
            {slotNotice && <p className="ev-alert" role="alert">{slotNotice}</p>}
            {!date ? <div className="ap-hint">
              <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              <span>Choose an available date on the calendar to see open times.</span>
            </div> : !selectedDay || !selectedMonth ? <p role="status">Loading available times…</p> : <fieldset className="ap-slots">
              <legend>Available times · {formatLongDate(date)}</legend>
              <div className="ap-slot-grid">{selectedMonth.slots.map(time => {
                const taken = selectedDay.booked.includes(time) || selectedDay.state !== "open";
                const chosen = slot === time;
                return <button key={time} type="button" disabled={taken} aria-pressed={chosen}
                  className={`ap-slot${chosen ? " ap-slot-selected" : ""}`} onClick={() => { setSlot(time); setSlotNotice(""); }}>
                  <span>{formatSlot(time)}</span>{taken && <span className="ap-slot-note">Booked</span>}
                </button>;
              })}</div>
            </fieldset>}
            <div className="ev-actions">
              <button type="button" className={canContinue(date, slot) ? "ev-button ev-button-primary" : "ev-button"}
                disabled={!canContinue(date, slot)} onClick={() => goTo(2)}>Continue</button>
              {!canContinue(date, slot) && <span className="ev-muted ap-small">Select a date and time to continue.</span>}
            </div>
          </>}

          {step === 2 && date && slot && <>
            <StepTitle headingRef={stepHeading} title="Describe the issue" intro="Tell us what needs fixing so the right mechanic is ready for you." />
            <SelectedTime date={date} slot={slot} onChange={() => goTo(1)} />
            <div className="ap-field">
              <label htmlFor="ap-repair-type">Repair type <span aria-hidden="true" className="ap-required">*</span></label>
              <select id="ap-repair-type" value={details.repairType} required aria-invalid={Boolean(errors.repairType)}
                aria-describedby={errors.repairType ? "ap-repair-type-error" : undefined}
                onChange={event => { setDetails({ ...details, repairType: event.target.value }); setErrors({ ...errors, repairType: undefined }); }}>
                <option value="">Select a repair type</option>
                {REPAIR_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
              {errors.repairType && <span id="ap-repair-type-error" className="ap-error">{errors.repairType}</span>}
            </div>
            <div className="ap-field">
              <label htmlFor="ap-issue">Description of the issue <span aria-hidden="true" className="ap-required">*</span></label>
              <textarea id="ap-issue" className="ap-textarea" rows={5} maxLength={DESCRIPTION_MAX} required value={details.description}
                placeholder="For example: the rear brake squeaks and feels soft when stopping."
                aria-invalid={Boolean(errors.description)} aria-describedby="ap-issue-help"
                onChange={event => { setDetails({ ...details, description: event.target.value }); setErrors({ ...errors, description: undefined }); }} />
              <div id="ap-issue-help" className="ap-field-help">
                <span className="ap-error">{errors.description}</span>
                <span className="ev-muted">{details.description.length} / {DESCRIPTION_MAX}</span>
              </div>
            </div>
            <div className="ev-actions">
              <button type="button" className="ev-button ev-button-secondary" onClick={() => goTo(1)}>Back</button>
              <button type="button" className="ev-button ev-button-primary" onClick={review}>Review Booking</button>
            </div>
          </>}

          {step === 3 && <>
            <StepTitle headingRef={stepHeading} title="Confirm your booking" intro="Check the details below, then confirm your appointment." />
            <Summary rows={summary} />
            {needsSignIn && <p className="ev-alert" role="alert">
              Please <a href="login.html">sign in</a> with a customer account to book. New here? <a href="signup.html">Create an account</a>. Your details stay on this page.
            </p>}
            {submitError && <p className="ev-alert" role="alert">{submitError}</p>}
            <div className="ev-actions">
              <button type="button" className="ev-button ev-button-secondary" disabled={submitting} onClick={() => goTo(2)}>Back</button>
              <button type="button" className="ev-button ev-button-primary" disabled={submitting} onClick={() => void confirm()}>
                {submitting ? "Booking…" : "Confirm Booking"}
              </button>
            </div>
          </>}

          {step === "done" && booked && <>
            <div className="ev-confirm" role="status">
              <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg>
              <div>
                <h2 id="ap-step-title" ref={stepHeading} tabIndex={-1} className="ev-confirm-title ap-success-title">Your appointment is booked</h2>
                <p>See you on {formatLongDate(booked.date)} at {formatSlot(booked.time)}.</p>
              </div>
            </div>
            <Summary rows={summary} />
            <div className="ev-actions">
              <button type="button" className="ev-button ev-button-primary" onClick={startOver}>Book another appointment</button>
            </div>
          </>}
        </div>
      </section>

      <section className="ev-card ev-calendar" aria-labelledby="ap-cal-title">
        <AppointmentCalendar
          month={month}
          availability={availability[monthKey(month)] ?? null}
          error={calendarError}
          selectedDate={date}
          canPrev={month > firstMonth}
          canNext={month < lastMonth}
          onMonth={offset => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1))}
          onSelect={selectDate}
        />
      </section>
    </div>
  </div>;
}

function StepIndicator({ step }: { step: Step }) {
  return <ol className="ap-steps" aria-label="Booking progress">{STEP_LABELS.map((label, index) => {
    const number = index + 1;
    const complete = step === "done" || number < step;
    const active = step === number;
    return <li key={label} className={`ap-step${active ? " ap-step-active" : complete ? " ap-step-complete" : ""}`} aria-current={active ? "step" : undefined}>
      <span className="ap-step-mark" aria-hidden="true">{complete ? "✓" : number}</span>
      <span className="ap-step-label">{label}<span className="ap-sr-only">{complete ? " (completed)" : ""}</span></span>
    </li>;
  })}</ol>;
}

function StepTitle({ headingRef, title, intro }: { headingRef: RefObject<HTMLHeadingElement | null>; title: string; intro: ReactNode }) {
  return <div>
    <h2 id="ap-step-title" ref={headingRef} tabIndex={-1} className="ap-step-title">{title}</h2>
    <p className="ev-muted ap-small">{intro}</p>
  </div>;
}

function SelectedTime({ date, slot, onChange }: { date: string; slot: string; onChange: () => void }) {
  return <div className="ap-selected">
    <span className="ap-selected-text">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
      {formatLongDate(date)} · {formatSlot(slot)}
    </span>
    <button type="button" className="ap-link-button" onClick={onChange}>Change<span className="ap-sr-only"> date and time</span></button>
  </div>;
}

function Summary({ rows }: { rows: [string, string][] }) {
  return <dl className="ap-summary">{rows.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd>{value}</dd>
  </div>)}</dl>;
}
