import { callApi, formatAmount } from "/controllers/shared.js";

const page = document.body.dataset.customerPage;
const navigation = document.querySelector(".customer-nav");
const pages = [
  ["home", "Home", "index.html"],
  ["items", "Items", "items.html"],
  ["cart", "Cart", "cart.html"],
  ["checkout", "Checkout", "checkout.html"],
  ["orders", "My orders", "orders.html"],
  ["events", "Events", "events.html"],
  ["appointments", "Appointments", "appointments.html"],
  ["profile", "Profile", "profile.html"],
  ["login", "Login", "login.html"],
  ["signup", "Signup", "signup.html"],
];

for (const [id, label, href] of pages) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  if (id === page || (page === "item" && id === "items")) {
    link.setAttribute("aria-current", "page");
  }
  navigation.append(link);
}

function showError(target, error) {
  target.textContent = error instanceof Error ? error.message : String(error);
  target.className = "error";
}

function itemLink(item) {
  const link = document.createElement("a");
  link.href = `item.html?id=${encodeURIComponent(item.item_id)}`;
  link.textContent = item.name;
  return link;
}

function renderItems(items, list, message) {
  list.replaceChildren();
  message.textContent = items.length ? "" : "No items found.";
  for (const item of items) {
    const entry = document.createElement("li");
    const details = document.createElement("p");
    details.textContent = `${formatAmount(item.price)}${item.brand ? ` · ${item.brand}` : ""}${item.category ? ` · ${item.category}` : ""}`;
    entry.append(itemLink(item), details);
    list.append(entry);
  }
}

async function loadItems() {
  const list = document.querySelector("#items-list");
  const message = document.querySelector("#items-message");
  try {
    const { items } = await callApi("GET", "/api/inventory");
    if (page === "home") {
      renderItems(items.slice(0, 3), list, message);
      return;
    }
    const search = document.querySelector("#item-search");
    const category = document.querySelector("#item-category");
    const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort();
    for (const name of categories) {
      category.add(new Option(name, name));
    }
    const update = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const matches = items.filter((item) =>
        (!category.value || item.category === category.value) &&
        [item.name, item.brand].some((value) => (value || "").toLocaleLowerCase().includes(query)),
      );
      renderItems(matches, list, message);
    };
    search.addEventListener("input", update);
    category.addEventListener("change", update);
    update();
  } catch (error) {
    showError(message, error);
  }
}

async function loadItem() {
  const message = document.querySelector("#item-message");
  const detail = document.querySelector("#item-detail");
  const id = new URLSearchParams(location.search).get("id");
  if (!id || !/^[1-9]\d*$/.test(id)) {
    message.textContent = "Choose an item from the items page.";
    return;
  }
  try {
    const { items } = await callApi("GET", "/api/inventory");
    const item = items.find((entry) => String(entry.item_id) === id);
    if (!item) {
      message.textContent = "Item not found.";
      return;
    }
    message.textContent = "";
    const title = document.createElement("h2");
    title.textContent = item.name;
    const description = document.createElement("p");
    description.textContent = item.description || "No description available.";
    const details = document.createElement("p");
    details.textContent = `${formatAmount(item.price)}${item.brand ? ` · ${item.brand}` : ""}${item.category ? ` · ${item.category}` : ""}`;
    detail.replaceChildren(title, description, details);
  } catch (error) {
    showError(message, error);
  }
}

async function loadEvents() {
  const list = document.querySelector("#events-list");
  const message = document.querySelector("#events-message");
  try {
    const { events } = await callApi("GET", "/api/events");
    const visibleEvents = page === "home" ? events.slice(0, 3) : events;
    message.textContent = visibleEvents.length ? "" : "No events available.";
    list.replaceChildren();
    for (const event of visibleEvents) {
      const entry = document.createElement("li");
      const name = document.createElement("strong");
      const details = document.createElement("p");
      name.textContent = event.name;
      details.textContent = `${event.customer_ids.length} / ${event.participant_limit} registered`;
      entry.append(name, details);
      list.append(entry);
    }
  } catch (error) {
    showError(message, error);
  }
}

if (page === "home" || page === "items") {
  loadItems();
}
if (page === "item") {
  loadItem();
}
if (page === "home" || page === "events") {
  loadEvents();
}
