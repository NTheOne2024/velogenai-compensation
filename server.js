require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { db, imagesDir, toGeneration } = require("./database");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Check that private configuration exists.
if (!process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32) {
    throw new Error("Set a session secret of at least 32 characters in .env");
}

if (!process.env.SEGMIND_API_KEY) {
    throw new Error("Set SEGMIND_API_KEY in .env");
}

app.disable("x-powered-by");

// Reject browser requests that change data from another origin.
app.use("/api", (req, res, next) => {
    const changingData = ["POST", "PATCH", "DELETE"].includes(req.method);
    const origin = req.get("origin");

    if (changingData && origin &&
        origin !== `${req.protocol}://${req.get("host")}`) {
        return res.status(403).json({ error: "Request origin not allowed." });
    }

    next();
});

// Read JSON sent by the frontend.
app.use(express.json({ limit: "16kb" }));

// Store login sessions on the server.
app.use(session({
    name: "velogenai.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: false, // Local development uses HTTP.
        maxAge: 1000 * 60 * 60 * 8
    }
}));

// Look up the logged-in user for every API request.
// This means deleted users immediately lose access.
app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");

    req.user = req.session.userId
        ? db.prepare(`
            SELECT id, username, email, role, created_at
            FROM users WHERE id = ?
        `).get(req.session.userId)
        : null;

    next();
});

// Convert a user row without exposing the password hash.
function toUser(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        role: row.role,
        createdAt: row.created_at
    };
}

// Require a logged-in account.
function requireLogin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: "Please log in first." });
    }

    next();
}

// Require the ADMIN role.
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Administrator access required." });
    }

    next();
}

// Start a fresh session after successful authentication.
async function startSession(req, userId) {
    await new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) return reject(error);
            resolve();
        });
    });

    req.session.userId = userId;

    await new Promise((resolve, reject) => {
        req.session.save(error => {
            if (error) return reject(error);
            resolve();
        });
    });
}

// Delete the stored image if it exists.
async function removeImage(id) {
    await fs.rm(path.join(imagesDir, `${id}.image`), { force: true });
}

// Identify the image format from its contents.
function imageMime(buffer) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        return "image/jpeg";
    }

    if (buffer.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )) {
        return "image/png";
    }

    if (buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP") {
        return "image/webp";
    }

    return null;
}

// ---------- HEALTH CHECK ----------

app.get("/api/health", (req, res) => {
    res.json({ message: "VelogenAI server is running." });
});

// ---------- AUTHENTICATION ----------

// Return the current user, or null for a guest.
app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user ? toUser(req.user) : null });
});

// Register an account. Public registration always creates a USER.
app.post("/api/auth/register", async (req, res) => {
    const { username, email, password } = req.body || {};

    if (typeof username !== "string" ||
        !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return res.status(400).json({
            error: "Username must contain 3–30 letters, numbers or underscores."
        });
    }

    if (typeof email !== "string" ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: "Enter a valid email address." });
    }

    if (typeof password !== "string" ||
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({
            error: "Password must have at least 8 characters and at most 72 bytes."
        });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    let result;

    try {
        result = db.prepare(`
            INSERT INTO users
            (username, email, password_hash, role, created_at)
            VALUES (?, ?, ?, 'USER', ?)
        `).run(
            username,
            normalizedEmail,
            passwordHash,
            new Date().toISOString()
        );
    } catch (error) {
        if (String(error.message).includes("UNIQUE constraint failed")) {
            return res.status(409).json({
                error: "That username or email is already registered."
            });
        }

        throw error;
    }

    const userId = Number(result.lastInsertRowid);
    await startSession(req, userId);

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    res.status(201).json({ user: toUser(user) });
});

// Log in using an email address and password.
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};

    if (typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 254 ||
        Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({ error: "Enter your email and password." });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?")
        .get(email.trim().toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: "Incorrect email or password." });
    }

    await startSession(req, user.id);
    res.json({ user: toUser(user) });
});

// Log out and remove the session cookie.
app.post("/api/auth/logout", async (req, res) => {
    await new Promise((resolve, reject) => {
        req.session.destroy(error => {
            if (error) return reject(error);
            resolve();
        });
    });

    res.clearCookie("velogenai.sid", {
        httpOnly: true,
        sameSite: "strict",
        secure: false
    });

    res.json({ message: "Logged out." });
});

// ---------- IMAGE GENERATIONS ----------

// Guest feature: view completed images marked as public.
app.get("/api/generations/public", (req, res) => {
    const rows = db.prepare(`
        SELECT * FROM generations
        WHERE is_public = 1 AND status = 'completed'
        ORDER BY id DESC
    `).all();

    res.json({ generations: rows.map(toGeneration) });
});

// Logged-in users can view their own generation history.
app.get("/api/generations", requireLogin, (req, res) => {
    const rows = db.prepare(`
        SELECT * FROM generations
        WHERE user_id = ?
        ORDER BY id DESC
    `).all(req.user.id);

    res.json({ generations: rows.map(toGeneration) });
});

// Allow one generation at a time per user.
const activeGenerations = new Set();

// Create an image through Segmind.
app.post("/api/generations", requireLogin, async (req, res) => {
    const { prompt } = req.body || {};

    if (typeof prompt !== "string" ||
        prompt.trim().length === 0 ||
        prompt.trim().length > 2000) {
        return res.status(400).json({
            error: "Enter a prompt containing 1–2000 characters."
        });
    }

    const userId = req.user.id;

    if (activeGenerations.has(userId)) {
        return res.status(429).json({
            error: "Wait for your current generation to finish."
        });
    }

    const model = "fast-flux-schnell";

    const result = db.prepare(`
        INSERT INTO generations
        (user_id, prompt, model, width, height, status, created_at)
        VALUES (?, ?, ?, 1024, 1024, 'pending', ?)
    `).run(userId, prompt.trim(), model, new Date().toISOString());

    const id = Number(result.lastInsertRowid);
    activeGenerations.add(userId);

    try {
        const response = await fetch(
            `https://api.segmind.com/v1/${model}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": process.env.SEGMIND_API_KEY
                },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    steps: 4,
                    aspect_ratio: "1:1"
                }),
                signal: AbortSignal.timeout(120000)
            }
        );

        if (!response.ok) {
            throw new Error(`Segmind returned HTTP ${response.status}.`);
        }

        const image = Buffer.from(await response.arrayBuffer());

        if (!imageMime(image)) {
            throw new Error("Segmind did not return a supported image.");
        }

        // A user or generation might have been deleted while waiting.
        const existing = db.prepare(
            "SELECT id FROM generations WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(410).json({
                error: "The generation was removed while processing."
            });
        }

        await fs.writeFile(path.join(imagesDir, `${id}.image`), image);

        const update = db.prepare(`
            UPDATE generations
            SET image_url = ?, status = 'completed'
            WHERE id = ?
        `).run(`/api/generations/${id}/image`, id);

        if (!update.changes) {
            await removeImage(id);
            return res.status(410).json({
                error: "The generation was removed while processing."
            });
        }

        const row = db.prepare(
            "SELECT * FROM generations WHERE id = ?"
        ).get(id);

        res.status(201).json({ generation: toGeneration(row) });
    } catch (error) {
        db.prepare(`
            UPDATE generations SET status = 'failed' WHERE id = ?
        `).run(id);

        await removeImage(id);

        console.error("Image generation failed:", error.message);

        res.status(502).json({
            error: "Image generation failed. Check your Segmind key, balance and server terminal."
        });
    } finally {
        activeGenerations.delete(userId);
    }
});

// Serve an image only if the visitor has permission to see it.
app.get("/api/generations/:id/image", async (req, res) => {
    const row = db.prepare(
        "SELECT * FROM generations WHERE id = ?"
    ).get(req.params.id);

    const allowed = row && (
        row.is_public === 1 ||
        req.user?.id === row.user_id ||
        req.user?.role === "ADMIN"
    );

    if (!allowed || row.status !== "completed") {
        return res.status(404).json({ error: "Image not found." });
    }

    let image;

    try {
        image = await fs.readFile(path.join(imagesDir, `${row.id}.image`));
    } catch (error) {
        if (error.code === "ENOENT") {
            return res.status(404).json({ error: "Image file not found." });
        }

        throw error;
    }

    res.set("Content-Type", imageMime(image) || "application/octet-stream");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(image);
});

// Owners and admins can change an image's visibility.
app.patch("/api/generations/:id", requireLogin, (req, res) => {
    const row = db.prepare(
        "SELECT * FROM generations WHERE id = ?"
    ).get(req.params.id);

    if (!row) {
        return res.status(404).json({ error: "Generation not found." });
    }

    if (row.user_id !== req.user.id && req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Access denied." });
    }

    const { isPublic } = req.body || {};

    if (typeof isPublic !== "boolean") {
        return res.status(400).json({ error: "isPublic must be a boolean." });
    }

    if (row.status !== "completed") {
        return res.status(400).json({
            error: "Only completed generations can be shared."
        });
    }

    db.prepare(`
        UPDATE generations SET is_public = ? WHERE id = ?
    `).run(isPublic ? 1 : 0, row.id);

    const updated = db.prepare(
        "SELECT * FROM generations WHERE id = ?"
    ).get(row.id);

    res.json({ generation: toGeneration(updated) });
});

// Owners and admins can delete generations.
app.delete("/api/generations/:id", requireLogin, async (req, res) => {
    const row = db.prepare(
        "SELECT * FROM generations WHERE id = ?"
    ).get(req.params.id);

    if (!row) {
        return res.status(404).json({ error: "Generation not found." });
    }

    if (row.user_id !== req.user.id && req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Access denied." });
    }

    db.prepare("DELETE FROM generations WHERE id = ?").run(row.id);
    await removeImage(row.id);

    res.json({ message: "Generation deleted." });
});

// ---------- ADMINISTRATION ----------

// Admin-only feature: view all generation resources.
app.get("/api/admin/generations", requireLogin, requireAdmin, (req, res) => {
    const rows = db.prepare(`
        SELECT * FROM generations ORDER BY id DESC
    `).all();

    res.json({ generations: rows.map(toGeneration) });
});

// View users without exposing their password hashes.
app.get("/api/admin/users", requireLogin, requireAdmin, (req, res) => {
    const rows = db.prepare(`
        SELECT id, username, email, role, created_at
        FROM users ORDER BY id DESC
    `).all();

    res.json({ users: rows.map(toUser) });
});

// Delete another user and their generations.
app.delete("/api/admin/users/:id",
    requireLogin,
    requireAdmin,
    async (req, res) => {
        const user = db.prepare(
            "SELECT id FROM users WHERE id = ?"
        ).get(req.params.id);

        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        if (user.id === req.user.id) {
            return res.status(400).json({
                error: "You cannot delete your own admin account."
            });
        }

        const generations = db.prepare(`
            SELECT id FROM generations WHERE user_id = ?
        `).all(user.id);

        // The foreign key cascade deletes their generation records.
        db.prepare("DELETE FROM users WHERE id = ?").run(user.id);

        for (const generation of generations) {
            await removeImage(generation.id);
        }

        res.json({ message: "User and their generations deleted." });
    }
);

// ---------- FRONTEND AND ERRORS ----------

// Serve only public frontend files, never .env or data/.
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found." });
});

// Express 5 forwards rejected async handlers to this middleware.
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Invalid JSON." });
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({ error: "Request is too large." });
    }

    console.error("Server error:", error.message);
    res.status(500).json({ error: "An unexpected server error occurred." });
});

// Run locally on this computer.
app.listen(PORT, "127.0.0.1", () => {
    console.log(`VelogenAI running at http://localhost:${PORT}`);
});