const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const loginMessage = document.querySelector("#login-message");
const loginError = document.querySelector("#login-error");

async function submitLogin(event) {
  event.preventDefault();
  loginError.hidden = true;
  loginMessage.textContent = "";
  loginButton.disabled = true;

  try {
    const formData = new FormData(loginForm);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });
    const result = await response.json();
    if (!response.ok || result.status !== "ok") {
      throw new Error(result.message || `Login failed with HTTP ${response.status}`);
    }

    const role = result.user.is_admin ? "Admin" : "Customer";
    loginMessage.textContent = `Login check passed for ${result.user.name} (${role}).`;
    loginForm.reset();
  } catch (error) {
    loginError.textContent = error instanceof Error ? error.message : String(error);
    loginError.hidden = false;
  } finally {
    loginButton.disabled = false;
  }
}

loginForm.addEventListener("submit", submitLogin);
