const form = document.getElementById("auth-form");
const message = document.getElementById("message");
const submitButton = document.getElementById("submit-button");
const switchButton = document.getElementById("switch-button");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

let registering = false;

function showError(text) {
    message.textContent = text;
    message.classList.add("error");
    message.hidden = false;
}

// Switch between login and registration.
switchButton.addEventListener("click", () => {
    registering = !registering;

    document.getElementById("username-field").hidden = !registering;
    usernameInput.required = registering;
    usernameInput.disabled = !registering;

    passwordInput.minLength = registering ? 8 : 1;
    passwordInput.autocomplete = registering
        ? "new-password"
        : "current-password";

    document.getElementById("form-title").textContent = registering
        ? "Create your account"
        : "Welcome back";

    document.getElementById("form-description").textContent = registering
        ? "Register to generate images and manage your history."
        : "Log in to create and manage your images.";

    submitButton.textContent = registering ? "Register" : "Login";

    switchButton.textContent = registering
        ? "Already have an account? Login"
        : "Need an account? Register";

    message.hidden = true;
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    message.hidden = true;

    submitButton.disabled = true;
    switchButton.disabled = true;
    submitButton.textContent = "Please wait...";

    const body = {
        email: document.getElementById("email").value.trim(),
        password: passwordInput.value
    };

    if (registering) {
        body.username = usernameInput.value.trim();
    }

    try {
        const endpoint = registering ? "register" : "login";

        const response = await fetch(`/api/auth/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Authentication failed.");
        }

        window.location.href = "/";
    } catch (error) {
        showError(error.message);
    } finally {
        submitButton.disabled = false;
        switchButton.disabled = false;
        submitButton.textContent = registering ? "Register" : "Login";
    }
});