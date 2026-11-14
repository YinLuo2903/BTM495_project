import "/controllers/auth_controller.js";
import { loadEvents } from "/controllers/event_controller.js";
import { loadInventory } from "/controllers/inventory_controller.js";
import { initializeOrders, renderOrders, renderPayments } from "/controllers/order_controller.js";
import { appendMessageRow } from "/controllers/shared.js";

const overallStatus = document.querySelector("#overall-status");
const databaseName = document.querySelector("#database-name");
const errorMessage = document.querySelector("#error-message");
const tableResults = document.querySelector("#table-results");
const orderResults = document.querySelector("#order-results");
const paymentHistory = document.querySelector("#payment-history");
const refreshButton = document.querySelector("#refresh-button");
const makePaymentButton = document.querySelector("#make-payment-button");

function setStatus(label, state) {
  overallStatus.textContent = label;
  overallStatus.className = `status status-${state}`;
}

function renderTables(tables) {
  tableResults.replaceChildren();
  if (tables.length === 0) {
    appendMessageRow(tableResults, 2, "No application tables were found.");
    return;
  }

  for (const table of tables) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const countCell = document.createElement("td");
    nameCell.textContent = table.name;
    countCell.textContent = String(table.rows);
    row.append(nameCell, countCell);
    tableResults.append(row);
  }
}

async function loadDashboard() {
  refreshButton.disabled = true;
  errorMessage.hidden = true;
  databaseName.textContent = "Loading SQLite data…";
  setStatus("Loading…", "pending");

  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || result.status !== "ok") {
      throw new Error(result.message || `API returned HTTP ${response.status}`);
    }

    databaseName.textContent = `Connected to ${result.database}`;
    renderTables(result.tables);
    renderOrders(result.orders);
    renderPayments(result.payments);
    setStatus("Database connected", "ok");
    await Promise.all([loadInventory(), loadEvents()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    databaseName.textContent = "Could not load database data";
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    setStatus("Connection failed", "error");
    appendMessageRow(tableResults, 2, "Database structure unavailable.");
    appendMessageRow(orderResults, 5, "Orders unavailable.");
    appendMessageRow(paymentHistory, 7, "Payment history unavailable.");
    makePaymentButton.disabled = true;
  } finally {
    refreshButton.disabled = false;
  }
}

initializeOrders({ loadDashboard, setStatus });
refreshButton.addEventListener("click", loadDashboard);
loadDashboard();
