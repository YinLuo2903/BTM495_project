export function appendMessageRow(target, columnCount, message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.className = "muted";
  cell.textContent = message;
  row.append(cell);
  target.replaceChildren(row);
}

export function formatAmount(amount) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function showMessage(target, text, isError) {
  target.textContent = text;
  target.className = isError ? "error" : "muted";
}

export async function callApi(method, path, body) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "ok") {
    throw new Error(result.message || `Request failed with HTTP ${response.status}`);
  }
  return result;
}

export function iconButton(label, text, danger, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-button ${danger ? "button-danger" : "button-secondary"}`;
  button.textContent = text;
  button.title = button.ariaLabel = label;
  button.addEventListener("click", onClick);
  return button;
}

export function textRow(values) {
  const row = document.createElement("tr");
  for (const value of values) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.append(cell);
  }
  return row;
}
