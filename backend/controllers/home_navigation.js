const navigation = document.querySelector(".home-nav");

const links = document.createElement("div");
links.className = "home-nav-links";
for (const [label, href] of [
  ["Home", "/views/customer/index.html"],
  ["Items", "/views/customer/items.html"],
  ["Appointments", "/views/customer/appointments.html"],
  ["Shopping Cart", "/views/customer/cart.html"],
]) {
  const link = document.createElement("a");
  link.textContent = label;
  link.href = href;
  links.append(link);
}

const accounts = document.createElement("div");
accounts.className = "home-nav-accounts";
for (const [label, options] of [
  ["Admin", [["Login check", "/#login-title"], ["Signup unavailable", null]]],
  ["Customer", [
    ["Login check", "/views/customer/login.html"],
    ["Signup", "/views/customer/signup.html"],
  ]],
]) {
  const group = document.createElement("div");
  group.className = "home-nav-account";
  group.setAttribute("aria-label", `${label} account`);
  const heading = document.createElement("span");
  heading.className = "home-nav-label";
  heading.textContent = label;
  group.append(heading);
  for (const [text, href] of options) {
    const element = document.createElement(href ? "a" : "span");
    element.textContent = text;
    if (href) {
      element.href = href;
    } else {
      element.className = "home-nav-unavailable";
    }
    group.append(element);
  }
  accounts.append(group);
}

navigation.append(links, accounts);
