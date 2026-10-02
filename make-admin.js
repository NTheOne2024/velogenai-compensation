const { db } = require("./database");

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
    console.error("Usage: node make-admin.js your@email.com");
    db.close();
    process.exit(1);
}

const user = db.prepare(
    "SELECT id, username FROM users WHERE email = ?"
).get(email);

if (!user) {
    console.error("Account not found. Register that email on the website first.");
    db.close();
    process.exit(1);
}

db.prepare(
    "UPDATE users SET role = 'ADMIN' WHERE id = ?"
).run(user.id);

console.log(`${user.username} now has the ADMIN role.`);

db.close();