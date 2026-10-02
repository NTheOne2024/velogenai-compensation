const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

// Store the database and generated images inside data/.
const dataDir = path.join(__dirname, "data");
const imagesDir = path.join(dataDir, "images");

fs.mkdirSync(imagesDir, { recursive: true });

// Open the database file, creating it if it doesn't exist.
const db = new DatabaseSync(path.join(dataDir, "velogenai.db"));

// Enforce relationships between users and generations.
db.exec("PRAGMA foreign_keys = ON;");

// Create our tables if they don't already exist.
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER'
            CHECK (role IN ('USER', 'ADMIN')),
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        model TEXT NOT NULL,
        width INTEGER NOT NULL CHECK (width > 0),
        height INTEGER NOT NULL CHECK (height > 0),
        image_url TEXT,
        is_public INTEGER NOT NULL DEFAULT 0
            CHECK (is_public IN (0, 1)),
        status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'completed', 'failed')),
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
    );
`);

// Convert database values into the resource returned by our API.
function toGeneration(row) {
    return {
        id: row.id,
        userId: row.user_id,
        prompt: row.prompt,
        model: row.model,
        width: row.width,
        height: row.height,
        imageUrl: row.image_url,
        isPublic: Boolean(row.is_public),
        status: row.status,
        createdAt: row.created_at
    };
}

module.exports = {
    db,
    imagesDir,
    toGeneration
};