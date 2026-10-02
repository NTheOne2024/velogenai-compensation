const message = document.getElementById("message");
let currentUser = null;

function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
    message.hidden = false;
}

async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed.");
    }

    return data;
}

function addText(parent, text, className = "") {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    paragraph.className = className;
    parent.appendChild(paragraph);
}

function showEmpty(container, text) {
    container.replaceChildren();
    addText(container, text, "empty");
}

function createUserCard(user) {
    const card = document.createElement("article");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = user.username;
    card.appendChild(title);

    addText(card, user.email);
    addText(card, `ID: ${user.id} · Role: ${user.role}`, "muted");
    addText(
        card,
        `Registered: ${new Date(user.createdAt).toLocaleString()}`,
        "muted"
    );

    const button = document.createElement("button");
    button.className = "danger";
    button.textContent = user.id === currentUser.id
        ? "Your account"
        : "Delete user";
    button.disabled = user.id === currentUser.id;

    button.addEventListener("click", async () => {
        const confirmed = window.confirm(
            `Delete ${user.username} and all their generations permanently?`
        );

        if (!confirmed) return;

        button.disabled = true;

        try {
            await api(`/api/admin/users/${user.id}`, {
                method: "DELETE"
            });

            await refresh();
            showMessage("User and their generations deleted.");
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            button.disabled = user.id === currentUser.id;
        }
    });

    card.appendChild(button);
    return card;
}

function createGenerationCard(generation) {
    const card = document.createElement("article");
    card.className = "card";

    if (generation.status === "completed" && generation.imageUrl) {
        const image = document.createElement("img");
        image.src = generation.imageUrl;
        image.alt = generation.prompt;
        image.loading = "lazy";
        card.appendChild(image);
    }

    addText(card, generation.prompt);
    addText(
        card,
        `Generation #${generation.id} · Owner ID: ${generation.userId}`,
        "muted"
    );
    addText(
        card,
        `${generation.model} · ${generation.width} × ${generation.height}`,
        "muted"
    );
    addText(
        card,
        `${generation.status} · ${generation.isPublic ? "Public" : "Private"}`,
        "muted"
    );
    addText(
        card,
        new Date(generation.createdAt).toLocaleString(),
        "muted"
    );

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

                await refresh();
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
    deleteButton.textContent = "Delete generation";

    deleteButton.addEventListener("click", async () => {
        if (!window.confirm("Permanently delete this generation?")) {
            return;
        }

        deleteButton.disabled = true;

        try {
            await api(`/api/generations/${generation.id}`, {
                method: "DELETE"
            });

            await refresh();
            showMessage("Generation deleted.");
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            deleteButton.disabled = false;
        }
    });

    actions.appendChild(deleteButton);
    card.appendChild(actions);

    return card;
}

async function loadUsers() {
    const data = await api("/api/admin/users");
    const container = document.getElementById("users");

    container.replaceChildren();

    if (data.users.length === 0) {
        showEmpty(container, "No users found.");
        return;
    }

    for (const user of data.users) {
        container.appendChild(createUserCard(user));
    }
}

async function loadGenerations() {
    const data = await api("/api/admin/generations");
    const container = document.getElementById("generations");

    container.replaceChildren();

    if (data.generations.length === 0) {
        showEmpty(container, "No generations found.");
        return;
    }

    for (const generation of data.generations) {
        container.appendChild(createGenerationCard(generation));
    }
}

async function refresh() {
    await Promise.all([loadUsers(), loadGenerations()]);
}

document.getElementById("logout-button")
    .addEventListener("click", async () => {
        try {
            await api("/api/auth/logout", { method: "POST" });
            window.location.href = "/";
        } catch (error) {
            showMessage(error.message, true);
        }
    });

async function initialize() {
    try {
        const data = await api("/api/auth/me");
        currentUser = data.user;

        if (!currentUser) {
            window.location.replace("/login.html");
            return;
        }

        document.getElementById("account-label").textContent =
            `${currentUser.username} (${currentUser.role})`;

        document.getElementById("logout-button").hidden = false;

        if (currentUser.role !== "ADMIN") {
            showMessage("Administrator access required.", true);
            return;
        }

        document.getElementById("admin-content").hidden = false;
        await refresh();
    } catch (error) {
        showMessage(error.message, true);
    }
}

initialize();