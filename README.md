# VelogenAI — Web Technologies Compensation Exercise

By Noor Shehadeh

## About

This is a small image-generation web application based on my own project, **VelogenAI**, which I own and operate at [velogenai.com](https://velogenai.com). This separate version focuses on the university exercise.

Users enter a prompt to generate an image through Segmind. They can view their history, share completed images in a public gallery, and delete their generations. Admins can manage all generations and user accounts.

## Software and dependencies

- Node.js **22.13.0 or newer**. I used **22.22.3**.
- npm. I used **10.9.8**.
- An internet connection and a working Segmind API key with available credits.
- Express **5.x** for the server and REST API.
- express-session for login sessions.
- bcryptjs for password hashing.
- dotenv for loading environment variables.
- SQLite through Node.js's built-in `node:sqlite` module. No separate database installation is needed.

The package versions are recorded in `package-lock.json`. All installed dependencies are listed in `package.json`.

## Installation

1. Clone this repository, or download its ZIP file from GitHub and extract it.
2. Open a terminal in the project folder containing `package.json`.
3. Install the dependencies:

```sh
npm ci
```

On Windows PowerShell, use `npm.cmd ci` if running `npm` gives a script execution error.

4. Copy `.env.example` to a new file named `.env` in the project folder.
5. Set the values in `.env`:

```dotenv
PORT=3000
SEGMIND_API_KEY=your_real_segmind_api_key
SESSION_SECRET=your_random_session_secret
```

| Variable | Purpose |
| --- | --- |
| `PORT` | Server port. The default is `3000`. |
| `SEGMIND_API_KEY` | The key used by the backend to call Segmind. |
| `SESSION_SECRET` | A private value used to protect login sessions. Must contain at least 32 characters. |

Generate a session secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the printed text into `SESSION_SECRET`. Keep `.env` private; it is excluded from GitHub.

### Segmind setup and testing costs

The app uses **Fast Flux Schnell** through:

```text
POST https://api.segmind.com/v1/fast-flux-schnell
```

The server sends the prompt, four generation steps, and a square aspect ratio. It authenticates using the `x-api-key` header and saves the returned image locally.

To create your own key, sign in at [Segmind's API Keys page](https://platform.segmind.com/api-keys), create a key, and place it in `.env`. Your account needs available credits. See the [Segmind quickstart](https://docs.segmind.com/docs/get-started/quickstart).

**The key I used is a real, working Segmind key. Generations are real API calls, not simulated results, and each image generated with my key is paid for from my Segmind balance. In my setup, the estimated cost is around a tenth of a cent per image. Please do not let this small cost hold you back from experimenting with image generation for assessment and testing purposes.**

My key is not included in the repository. For assessment, I will provide it separately so it can be entered into `.env`. If you use your own key, the cost comes from your own Segmind balance instead.

## Build and start

No separate build step is needed. The project uses plain JavaScript, HTML, and CSS.

Start the server:

```sh
node server.js
```

Open [http://localhost:3000](http://localhost:3000) in a browser. Express serves the frontend and the backend, so no separate client command is needed. If you change `PORT`, use that port in the address.

Keep the terminal running. Press `Ctrl+C` to stop the server.

The app automatically creates `data/velogenai.db` and `data/images/`. A fresh installation starts with no accounts or images. A SQLite experimental warning may appear with Node 22; this is expected.

## Create an admin

1. Start the app and register an account through the login page.
2. Stop the server with `Ctrl+C`.
3. Run the following command with the email address of that account:

```sh
node make-admin.js your@email.com
```

4. Restart the server with `node server.js` and log in again.
5. The **Admin** link will appear in the navigation.

Public registration always creates a `USER`. Only the local command can promote an account to `ADMIN`.

## Roles and resource features

| Role | Access |
| --- | --- |
| Guest | Feature 1: browse the public image gallery. Can also register and log in. |
| User | Features 1 and 2: browse the gallery and generate/manage their own images, including history, sharing, and deletion. |
| Admin | All user features, plus Feature 3: manage every user's generations. Can also view and delete user accounts. |

Guests are visitors who are not logged in. They do not have a database role.

The public gallery displays images previously obtained from Segmind. Viewing or managing existing images does not make another paid generation request.

Images are private by default. A private image can be accessed only by its owner or an admin. Permissions are checked on the server, including image access, so changing the frontend does not grant access.

## Resources and exercise requirements

The app manages **Users** and **ImageGeneration** resources. Segmind returns the generated image; the app stores it with the prompt, settings, and local management information.

The ImageGeneration resource has ten properties:

| Property | Type | Meaning |
| --- | --- | --- |
| `id` | Number | Local generation ID |
| `userId` | Number | Owner's user ID |
| `prompt` | String | Text used to generate the image |
| `model` | String | Segmind model name |
| `width` | Number | Image width in pixels |
| `height` | Number | Image height in pixels |
| `imageUrl` | String or null | Local image route; null before success |
| `isPublic` | Boolean | Whether the image is shared publicly |
| `status` | String | pending, completed, or failed |
| `createdAt` | Date represented as an ISO string | When the local generation record was created |

The implementation provides:

- External REST API integration with Segmind.
- Resource storage and management using SQLite and local image files.
- Ten resource properties, including string, number, boolean, and date information.
- User registration, login, and logout.
- Guest, User, and Admin access levels.
- Public, authenticated, and admin-only resource features.
- JavaScript, Node.js, Express, and REST routes using GET, POST, PATCH, and DELETE.
- Asynchronous client-server requests using `fetch` and `async`/`await`.
- A user interface for generating, viewing, sharing, and deleting images.

Concept approval and agreement with the submitted concept are separate assessment requirements; this README describes the implemented app.

## Main files

| File or folder | Purpose |
| --- | --- |
| `server.js` | REST routes, authentication, permissions, and Segmind calls |
| `database.js` | Database setup and resource conversion |
| `make-admin.js` | Promote an existing account to admin |
| `public/` | HTML, CSS, and frontend JavaScript |
| `.env.example` | Configuration template without real secrets |
| `data/` | Automatically created database and image storage; excluded from GitHub |

Passwords are stored as bcrypt hashes. Login sessions are kept in server memory, so restarting the server logs users out. Accounts and images remain saved. This version is intended to run locally for the exercise.

## Quick test

1. Open the homepage without logging in. The gallery is available, but generation is not.
2. Register and generate an image. It appears in your history as private.
3. Share it publicly, then log out. It appears in the guest gallery.
4. Log in with another normal account. It cannot manage the first user's private images or use the admin API.
5. Promote an account to admin. Check that it can view all generations and delete a temporary user's account. An admin cannot delete their own account through the admin page.

If generation fails, check the server terminal, API key, internet connection, and Segmind balance. The server health check is available at [http://localhost:3000/api/health](http://localhost:3000/api/health).
