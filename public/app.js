const message = document.getElementById("message");
const generateButton = document.getElementById("generate-button");

let currentUser = null;

function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
    message.hidden = false;
}

// Shared helper for contacting our REST API.
async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed.");
    }

    return data;
}

// Create a card using textContent so prompts are treated as text.
function createCard(generation, manageable) {
    const card = document.createElement("article");
    card.className = "card";

    if (generation.status === "completed" && generation.imageUrl) {
        const image = document.createElement("img");
        image.src = generation.imageUrl;
        image.alt = generation.prompt;
        image.loading = "lazy";
        card.appendChild(image);
    }

    const prompt = document.createElement("p");
    prompt.textContent = generation.prompt;
    card.appendChild(prompt);

    const details = document.createElement("p");
    details.className = "muted";
    details.textContent =
        `${generation.model} · ${generation.width} × ${generation.height}` +
        ` · ${generation.status}`;
    card.appendChild(details);

    const date = document.createElement("p");
    date.className = "muted";
    date.textContent = new Date(generation.createdAt).toLocaleString();
    card.appendChild(date);

    if (manageable) {
        const visibility = document.createElement("p");
        visibility.className = "muted";
        visibility.textContent = generation.isPublic ? "Public" : "Private";
        card.appendChild(visibility);

        const actions = document.createElement("div");
        actions.className = "card-actions";

        if (generation.status === "completed") {
            const shareButton = document.createElement("button");
            shareButton.className = "secondary";
            shareButton.textContent = generation.isPublic
                ? "Make private"
                : "Share publicly";

            shareButton.addEventListener("click", async () => {
                shareButton.disabled = true;

                try {
                    await api(`/api/generations/${generation.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            isPublic: !generation.isPublic
                        })
                    });

                    await refreshLists();
                    showMessage("Image visibility updated.");
                } catch (error) {
                    showMessage(error.message, true);
                } finally {
                    shareButton.disabled = false;
                }
            });

            actions.appendChild(shareButton);
        }

        const deleteButton = document.createElement("button");
        deleteButton.className = "danger";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", async () => {
            if (!window.confirm("Permanently delete this generation?")) {
                return;
            }

            deleteButton.disabled = true;

            try {
                await api(`/api/generations/${generation.id}`, {
                    method: "DELETE"
                });

                await refreshLists();
                showMessage("Generation deleted.");
            } catch (error) {
                showMessage(error.message, true);
            } finally {
                deleteButton.disabled = false;
            }
        });

        actions.appendChild(deleteButton);
        card.appendChild(actions);
    }

    return card;
}

function renderList(elementId, generations, manageable, emptyText) {
    const container = document.getElementById(elementId);
    container.replaceChildren();

    if (generations.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = emptyText;
        container.appendChild(empty);
        return;
    }

    for (const generation of generations) {
        container.appendChild(createCard(generation, manageable));
    }
}

async function loadGallery() {
    const data = await api("/api/generations/public");

    renderList(
        "gallery",
        data.generations,
        false,
        "No public images yet."
    );
}

async function loadHistory() {
    if (!currentUser) return;

    const data = await api("/api/generations");

    renderList(
        "history",
        data.generations,
        true,
        "Your generated images will appear here."
    );
}

async function refreshLists() {
    await Promise.all([loadGallery(), loadHistory()]);
}

document.getElementById("generation-form")
    .addEventListener("submit", async event => {
        event.preventDefault();

        generateButton.disabled = true;
        generateButton.textContent = "Generating...";
        showMessage("Generating your image. This may take a little while.");

        try {
            await api("/api/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: document.getElementById("prompt").value.trim()
                })
            });

            await refreshLists();
            showMessage("Your image is ready! Find it in your history.");
        } catch (error) {
            showMessage(error.message, true);

            // Also display failed generation records in the history.
            try {
                await loadHistory();
            } catch {
                // Keep the original error visible.
            }
        } finally {
            generateButton.disabled = false;
            generateButton.textContent = "Generate image";
        }
    });

document.getElementById("logout-button")
    .addEventListener("click", async () => {
        try {
            await api("/api/auth/logout", { method: "POST" });
            window.location.reload();
        } catch (error) {
            showMessage(error.message, true);
        }
    });

// Determine the visitor's role and load the appropriate content.
async function initialize() {
    try {
        const data = await api("/api/auth/me");
        currentUser = data.user;

        const loggedIn = Boolean(currentUser);

        document.getElementById("login-link").hidden = loggedIn;
        document.getElementById("logout-button").hidden = !loggedIn;
        document.getElementById("guest-notice").hidden = loggedIn;
        document.getElementById("generator-section").hidden = !loggedIn;
        document.getElementById("history-section").hidden = !loggedIn;
        document.getElementById("admin-link").hidden =
            currentUser?.role !== "ADMIN";

        document.getElementById("account-label").textContent = loggedIn
            ? `${currentUser.username} (${currentUser.role})`
            : "Guest";

        await refreshLists();
    } catch (error) {
        showMessage(error.message, true);
    }
}

initialize();