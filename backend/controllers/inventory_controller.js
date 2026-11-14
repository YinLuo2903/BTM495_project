import { appendMessageRow, callApi, formatAmount, iconButton, showMessage, textRow } from "/controllers/shared.js";

const inventoryResults = document.querySelector("#inventory-results");
const historyResults = document.querySelector("#history-results");
const inventoryMessage = document.querySelector("#inventory-message");
const itemForm = document.querySelector("#item-form");
let inventoryItems = [];

export async function loadInventory() {
  try {
    inventoryItems = (await callApi("GET", "/api/inventory")).items;
  } catch (error) {
    appendMessageRow(inventoryResults, 5, "Inventory unavailable.");
    showMessage(inventoryMessage, error.message, true);
    return;
  }
  if (inventoryItems.length === 0) {
    appendMessageRow(inventoryResults, 5, "No items yet. Save one above.");
    return;
  }
  inventoryResults.replaceChildren();
  for (const item of inventoryItems) {
    const row = textRow([
      `#${item.item_id}`,
      item.name,
      formatAmount(item.price),
      item.stock_quantity === null ? "Not tracked" : String(item.stock_quantity),
    ]);
    const cell = document.createElement("td");
    cell.className = "row-actions";
    cell.append(
      iconButton(`Edit item #${item.item_id}`, "✎", false, () => fillItemForm(item)),
      iconButton(`History of item #${item.item_id}`, "🕘", false, () => loadHistory(item.item_id)),
      iconButton(`Delete item #${item.item_id}`, "🗑", true, () => deleteItem(item.item_id)),
    );
    row.append(cell);
    inventoryResults.append(row);
  }
}

function fillItemForm(item) {
  itemForm.querySelector("#item-id").value = item.item_id;
  itemForm.querySelector("#item-name").value = item.name;
  itemForm.querySelector("#item-price").value = item.price;
  itemForm.querySelector("#item-stock").value = item.stock_quantity ?? "";
  itemForm.querySelector("#item-name").focus();
}

async function loadHistory(itemId) {
  try {
    const { history } = await callApi("GET", `/api/inventory/${itemId}/history`);
    document.querySelector("#history-title").textContent = `Stock history for item #${itemId}`;
    if (history.length === 0) {
      appendMessageRow(historyResults, 5, "No stock changes recorded.");
      return;
    }
    historyResults.replaceChildren(
      ...history.map((entry) =>
        textRow([
          entry.createdAt,
          entry.oldQuantity ?? "—",
          entry.newQuantity ?? "not tracked",
          entry.adminId ?? "system",
          entry.reason ?? "",
        ]),
      ),
    );
  } catch (error) {
    showMessage(inventoryMessage, error.message, true);
  }
}

async function saveItem(event) {
  event.preventDefault();
  const field = (id) => itemForm.querySelector(id).value.trim();
  const itemId = Number(field("#item-id"));
  const stock = field("#item-stock");
  const admin = field("#item-admin");
  const audit = {
    admin_id: admin === "" ? null : Number(admin),
    reason: field("#item-reason") || null,
  };
  const fields = {
    name: field("#item-name"),
    price: Number(field("#item-price")),
    stock_quantity: stock === "" ? null : Number(stock),
  };
  const exists = inventoryItems.some((item) => item.item_id === itemId);
  try {
    const result = exists
      ? await callApi("PATCH", `/api/inventory/${itemId}`, { ...fields, ...audit })
      : await callApi("POST", "/api/inventory", { item_id: itemId, ...fields, ...audit });
    showMessage(inventoryMessage, result.message, false);
    await loadInventory();
    await loadHistory(itemId);
  } catch (error) {
    showMessage(inventoryMessage, error.message, true);
  }
}

async function deleteItem(itemId) {
  if (!window.confirm(`Delete item #${itemId}, its stock and its history?`)) {
    return;
  }
  try {
    showMessage(inventoryMessage, (await callApi("DELETE", `/api/inventory/${itemId}`)).message, false);
    historyResults.replaceChildren();
    appendMessageRow(historyResults, 5, "Choose the history icon on an item.");
    await loadInventory();
  } catch (error) {
    showMessage(inventoryMessage, error.message, true);
  }
}

itemForm.addEventListener("submit", saveItem);
