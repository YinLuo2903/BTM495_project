import { appendMessageRow, callApi, iconButton, showMessage, textRow } from "/controllers/shared.js";

const eventResults = document.querySelector("#event-results");
const registrationMessage = document.querySelector("#registration-message");
const registrationForm = document.querySelector("#registration-form");
const registrationEvent = document.querySelector("#registration-event");

export async function loadEvents() {
  let data;
  try {
    data = await callApi("GET", "/api/events");
  } catch (error) {
    appendMessageRow(eventResults, 4, "Events unavailable.");
    showMessage(registrationMessage, error.message, true);
    return;
  }
  const customerNames = new Map(data.customers.map((c) => [c.customer_id, c.name]));
  registrationEvent.replaceChildren(
    ...data.events.map((event) => new Option(`#${event.event_id} ${event.name}`, event.event_id)),
  );
  if (data.events.length === 0) {
    appendMessageRow(eventResults, 4, "No events yet. Add a sample event.");
    return;
  }
  eventResults.replaceChildren();
  for (const event of data.events) {
    const row = textRow([
      `#${event.event_id} ${event.name}`,
      `${event.customer_ids.length} / ${event.participant_limit}`,
      event.customer_ids.map((id) => `#${id} ${customerNames.get(id) ?? ""}`.trim()).join(", ") || "—",
    ]);
    const cell = document.createElement("td");
    cell.className = "row-actions";
    for (const customerId of event.customer_ids) {
      cell.append(
        iconButton(`Unregister customer #${customerId}`, `🗑 #${customerId}`, true, () =>
          unregister(event.event_id, customerId),
        ),
      );
    }
    cell.append(iconButton(`Delete event #${event.event_id}`, "🗑 event", true, () => deleteEvent(event.event_id)));
    row.append(cell);
    eventResults.append(row);
  }
}

async function runRegistration(action) {
  try {
    showMessage(registrationMessage, (await action()).message ?? "Done.", false);
  } catch (error) {
    showMessage(registrationMessage, error.message, true);
  }
  await loadEvents();
}

const addSampleEvent = () =>
  runRegistration(() =>
    callApi("POST", "/api/events", { name: "Community Ride", participant_limit: 2 }),
  );
const register = (event) => {
  event.preventDefault();
  return runRegistration(() =>
    callApi("POST", "/api/event-registrations", {
      event_id: Number(registrationEvent.value),
      customer_id: Number(document.querySelector("#registration-customer").value),
    }),
  );
};
const unregister = (eventId, customerId) =>
  runRegistration(() => callApi("DELETE", `/api/event-registrations/${eventId}/${customerId}`));
const deleteEvent = (eventId) =>
  window.confirm(`Delete event #${eventId} and its registrations?`)
    ? runRegistration(() => callApi("DELETE", `/api/events/${eventId}`))
    : undefined;

registrationForm.addEventListener("submit", register);
document.querySelector("#add-event-button").addEventListener("click", addSampleEvent);
