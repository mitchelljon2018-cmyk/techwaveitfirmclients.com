# Techwave Client Management System (TCMS)

A client & institution management system for Techwave IT Firm. It's built
with plain **HTML, CSS and JavaScript** and runs **fully offline** — no
account to create, no internet connection required, no server to install.
All data is stored in this browser's Local Storage.

> **Note:** an earlier version of this project used Firebase (a cloud
> backend) so data could sync across devices, but that required every user
> to set up their own Firebase project before the app would even load —
> the login screen would spin on "Loading…" forever with the placeholder
> config left in place. This version has been converted back to a fully
> offline, self-contained app: open `index.html` (or `app.html` once
> signed in) and it works immediately, with no setup step.

## How data storage works

Everything — accounts, clients, reports, notes, messages, activity log,
branding/settings — is saved to this browser's Local Storage, scoped to
this one browser on this one device. That means:

- **No internet connection needed**, and nothing ever leaves the machine.
- Data is **only visible in the browser it was entered in**. If you need
  the same data on another computer, you'll need to keep everyone working
  from the same browser/machine (e.g. a shared front-desk PC), or ask for
  an export/import feature to be added.
- Clearing the browser's site data / Local Storage for this app will erase
  everything, so avoid "Clear browsing data → All time" on the browser
  this is running in, and take periodic backups if the data matters.

## First run

The very first time `index.html` is opened with no administrator account
yet, it shows a **"Create administrator account"** screen instead of the
sign-in form. Fill that in once, and from then on it behaves like a normal
login page.

## Roles

- **Administrator** — full access: clients, all engagement reports,
  accounts, branding, messaging.
- **Reporting Staff** — can view the shared client list and file
  **Engagement Reports** against a client. A staff member's own reports
  are private: only that staff member and an administrator can see them.

## Features

- **Real accounts.** An administrator can create, edit, enable, disable and
  delete accounts. Every account (including the admin's) changes its own
  password — nobody else can do that for them. Passwords are never stored
  in plain text; they're salted and hashed before being saved.
- **Engagement Reports** — a dedicated form (client, engagement type, date,
  outcome, follow-up date, summary) that reporting staff fill in
  individually, separate from the general client registry.
- **Messaging** — send a message to one specific account or broadcast to
  everyone; unread count shown in the sidebar.
- **Login screen background slider** — an administrator can upload as many
  images as they like in Settings and they rotate automatically on the
  sign-in screen.
- Responsive **mobile app view**: a bottom navigation bar and slide-in menu
  on phones, a full sidebar on desktop, plus a `manifest.json` so it can be
  added to a phone's home screen like an app.

## File structure

- `index.html` — login / first-run setup screen
- `app.html` — the main application shell (dashboard, clients, reports, etc.)
- `js/local-store.js` — Local Storage engine + password hashing (replaces Firebase)
- `js/db.js` — data layer used by the rest of the app (same API as before)
- `js/auth.js` — login page behaviour + shared theme/toast helpers
- `js/app.js` — main application logic (runs inside `app.html`)
- `css/style.css` — all styling
