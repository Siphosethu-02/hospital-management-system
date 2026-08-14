# MediCare HMS — Firebase Edition

A full-stack Hospital Management System, rebuilt to run entirely on Firebase's free Spark tier: **no server, no billing account, one Firebase project.**

This is a from-scratch architectural migration of an existing React + Node.js/Express + MySQL system (still present in `server/` and the Docker Compose files, kept until you've verified this version works for you - see "What happened to the old backend" below). Every piece of business logic that used to run on a server now runs either in the browser or as a Firestore Security Rule; there is no API, no Express, no MySQL in this deployment path at all.

## Contents
- [Architecture](#architecture)
- [Firebase services used](#firebase-services-used)
- [Firestore structure](#firestore-structure)
- [Authentication](#authentication)
- [Security rules](#security-rules)
- [Free-tier limitations](#free-tier-limitations-read-this)
- [Local development](#local-development)
- [Firebase project setup](#firebase-project-setup)
- [Migrating existing data](#migrating-existing-data)
- [Deployment](#deployment)
- [Demo accounts](#demo-accounts)
- [Troubleshooting](#troubleshooting)
- [What happened to the old backend](#what-happened-to-the-old-backend)

---

## Architecture

```
+-----------------------------------------------+
|              Your Browser                       |
|  +-------------------------------------------+ |
|  |   React app (client/, built with Vite)     | |
|  |   - Firebase Auth SDK (login/session)      | |
|  |   - Firestore SDK (all data read/write)    | |
|  |   - jsPDF (invoices/reports, in-browser)   | |
|  +-------------------------------------------+ |
+---------------------+---------------------------+
                       |  HTTPS, direct to Firebase
                       v
+-----------------------------------------------+
|                  Firebase                        |
|  +---------------+   +----------------------+    |
|  | Firebase Auth  |   |  Cloud Firestore      |    |
|  | (accounts,     |   |  (all app data,       |    |
|  |  sessions)     |   |  Security Rules       |    |
|  |                |   |  enforce every        |    |
|  |                |   |  permission)          |    |
|  +---------------+   +----------------------+    |
|  +---------------------------------------------+  |
|  |        Firebase Hosting (static)              |  |
|  |        serves the built React app             |  |
|  +---------------------------------------------+  |
+-----------------------------------------------------+
```

**One URL, works on any device.** Firebase Hosting serves the whole app from a single domain; there's no separate API host, so there's nothing cross-origin to configure. The existing responsive Tailwind UI (desktop/tablet/mobile) and dark mode are unchanged - this migration only touched the data layer, not the UI itself.

There is **no server anywhere in this path** - not a hidden one, not a minimal one. Every one of the 28 preserved features (see the bottom of this file) runs as browser code + Firestore + Security Rules.

## Firebase services used

| Service | Spark (free) tier | Used for |
|---|---|---|
| **Firebase Hosting** | 10 GB storage, 360 MB/day transfer | Serving the built React SPA |
| **Firebase Authentication** | 50,000 MAU, unlimited email/password | Login, sessions, password changes |
| **Cloud Firestore** | 1 GiB storage, 50K reads/day, 20K writes/day, 20K deletes/day | Every piece of app data |

**Not used, deliberately:**
- **Cloud Functions** - zero used, anywhere. See "Why no Cloud Functions" below.
- **Cloud Storage** - unavailable on Spark since February 3, 2026 (Google now requires the Blaze billing plan even for zero usage - this is a real, current policy, not a stale assumption). File uploads use a base64-in-Firestore fallback instead - see "Free-tier limitations."

### Why no Cloud Functions
Custom claims (the normal way to put a "role" on a Firebase Auth user cheaply) require the Admin SDK, which needs a trusted server context - normally a Cloud Function. Rather than depend on Cloud Functions' free-tier quota - which, like Storage, could change without notice (Firebase has changed free-tier policy three times in the last two years) - this app stores `role` as a plain Firestore field instead, and Security Rules read it directly. See [Authentication](#authentication) below for exactly how.

## Firestore structure

Full schema, with the reasoning behind every design decision, lives in **[`FIRESTORE_SCHEMA.md`](./FIRESTORE_SCHEMA.md)** - read it before making changes to any collection. Summary of what's in there:

- 17 collections: `users`, `doctors`, `patients`, `departments`, `doctorAvailability`, `slotLocks`, `appointments`, `medicalRecords`, `vitals`, `prescriptions`, `medicines`, `medicineCategories`, `medicineStock`, `labTests`, `invoices`, `notifications`, `auditLogs`
- Deliberately **not** a 1:1 conversion of the old SQL tables - denormalized names (e.g. an appointment stores the doctor's name directly, not just their ID) to avoid needing joins Firestore doesn't support
- `slotLocks` exists purely to make double-booking prevention truly atomic within the constraints of what a client-side Firestore transaction can actually do (it can't run a query inside a transaction - only read/write documents by direct reference)
- `laboratory_tests`/`laboratory_results` merged into one `labTests` document with an embedded `result` field, since a result never exists independently of its test

## Authentication

Firebase Authentication (email/password) replaces the old JWT system entirely - `signInWithEmailAndPassword`, session persistence, `onAuthStateChanged` for restoring a session on page load. No tokens to manage manually, no refresh logic.

**Roles**: stored as a `role` field on `users/{uid}` (not a Firebase custom claim - see "Why no Cloud Functions" above). `firestore.rules` reads this field via `get()` on every permission check.

**Account creation**: there is no public sign-up. An admin creates staff accounts, and an admin or receptionist grants an existing patient portal access - both use a "secondary Firebase App instance" trick (`getSecondaryAuth()` in `client/src/firebase/config.js`) so creating someone else's login doesn't sign the acting admin out of their own session.

## Security rules

`firestore.rules` is the entire authorization layer - there is no Express middleware behind it double-checking anything, because there is no Express. Full rule-by-rule reasoning is commented directly in the file; the short version:

- Every collection's rules read the caller's `role` from `users/{request.auth.uid}` and gate access accordingly (admin/doctor/nurse/receptionist/pharmacist/lab_staff/patient)
- A patient can only ever read/write **their own** records - enforced via a denormalized `patientUserId` field on every patient-facing document, checked with `resource.data.patientUserId == request.auth.uid`. A mismatch is a Firestore permission-denied error, not a redirect - a patient changing an ID in the URL cannot access another patient's data, full stop
- Self-service profile edits are restricted to a specific field allowlist via `diff().affectedKeys().hasOnly([...])` - a patient can update their phone number, not their own role or another patient's allergy list
- `auditLogs` can be created (self-attributed only) and read (admin only), but **never** updated or deleted by anyone, including admins - `allow update, delete: if false;`
- `doctors` and `departments` are readable **without login** (the public marketing site needs this) - see the tradeoff documented directly above that rule in `firestore.rules`: Firestore Security Rules can't expose only *some* fields of a document to the public the way the old server's endpoint could, so this is a deliberate, disclosed choice, not an oversight

**Deploy rule changes** any time you edit `firestore.rules`:
```bash
firebase deploy --only firestore:rules
```

## Free-tier limitations (read this)

Stated plainly, not buried:

1. **File uploads are capped and limited.** No Cloud Storage on Spark (confirmed current as of Feb 2026). Patient photos, medical record attachments, and lab report files are stored as base64 directly on their Firestore document, capped at 500KB each. Large scanned documents/multi-page reports aren't supported in this version - the UI clearly states the size limit rather than failing silently. See `FIRESTORE_SCHEMA.md`'s file-upload note for the safer path if you need real file storage later (a separate free service like Cloudinary, called directly from the browser - not wired up here since that's a new third-party dependency this migration didn't add without your say-so).
2. **Reports and list pagination are computed client-side**, over a capped batch of documents (see `firestoreUtils.js`'s `paginateClientSide`). Fine at a single hospital's demo/small-scale data volume (dozens to low hundreds of records per collection); not a substitute for real analytics infrastructure at genuine production scale.
3. **The audit log is not tamper-proof the way a server-enforced one is.** It's written by the same browser session performing the action. Security Rules stop it from being edited/deleted and force self-attribution, but a technically sophisticated user calling the Firestore SDK directly (bypassing the UI) could in principle skip logging their own action. Documented in detail in `FIRESTORE_SCHEMA.md`'s `auditLogs` section.
4. **Public doctor listings expose the whole doctor document**, not a curated subset, because Firestore rules can't filter fields for public reads the way the old server endpoint did. No field currently in the schema is highly sensitive, but if you add one to `doctors/{uid}` later, reconsider this.
5. **Firestore's daily quotas are real**: 50K reads/20K writes/20K deletes per day, 1 GiB total storage. Fine for a demo or a small clinic; watch usage (Firebase Console -> Firestore -> Usage) if you expect real traffic.
6. **Firebase's free-tier policy has changed three times in the last two years** (Storage most recently, Feb 2026). Nothing here can guarantee Spark stays free forever - only that this specific build needs zero paid services *today*, verified at the time this was written.

## Local development

```bash
cd client
cp .env.example .env      # fill in your Firebase project's config (see below)
npm install
npm run dev
```
Opens at `http://localhost:5173`, talking directly to your real Firebase project (Firestore/Auth don't have a meaningful "local-only" mode for a project this size - there's no separate local backend to run). If you want a fully offline sandbox, look into the Firebase Local Emulator Suite (`firebase emulators:start`) - not set up here by default, since it adds a second thing to configure correctly for comparatively little benefit at this project's scale.

## Firebase project setup

1. [Firebase Console](https://console.firebase.google.com) -> **Add project** -> name it -> you can decline Google Analytics, it's not used here.
2. **Build -> Authentication -> Get started -> Sign-in method -> Email/Password -> Enable.**
3. **Build -> Firestore Database -> Create database -> Start in production mode** (not test mode - `firestore.rules` in this repo provides real rules from the start) -> pick a region close to your users.
4. **Project Settings (gear icon) -> General -> Your apps -> Add app -> Web (`</>`)** -> register it (no Hosting setup needed here, the CLI handles that) -> copy the config values into `client/.env`.
5. Install the CLI if you don't have it: `npm install -g firebase-tools`, then `firebase login`.
6. From the project root: `firebase use --add` -> pick your project -> give it the alias `default` (matches `.firebaserc`).

## Migrating existing data

If you have real data in the old MySQL database (the demo/seed dataset, or anything else), see **[`scripts/migrate-to-firestore.js`](./scripts/migrate-to-firestore.js)** - full setup instructions are in the script's own header comment. Short version:
```bash
# 1. Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
#    Save as scripts/serviceAccountKey.json (already gitignored)
cd scripts
npm install
npm run migrate
```
Passwords cannot be migrated (bcrypt hashes aren't compatible with Firebase Auth's format) - demo accounts get the same passwords already documented below; any other migrated account gets a fresh random one, printed at the end of the run.

## Deployment

```bash
npm install -g firebase-tools   # if you haven't already
firebase login
cd client && npm install && npm run build && cd ..
firebase deploy --only hosting,firestore:rules,firestore:indexes
```
That's the whole deployment - no server to provision, no Docker required for this path (`docker-compose.yml`/`docker-compose.prod.yml` still work for the old MySQL/Express version if you want it, but the Firebase deployment is entirely independent of Docker). Your app is live at `https://YOUR-PROJECT-ID.web.app`.

Redeploying after a change is the same `npm run build && firebase deploy` - Firebase Hosting keeps your last several releases and `firebase hosting:rollback` reverts instantly if something's wrong.

## Demo accounts

Same credentials as the MySQL version, recreated as Firebase Authentication users the first time you run the migration script (or create manually via the Firebase Console -> Authentication -> Add user, then add a matching `users/{uid}` Firestore document - see `FIRESTORE_SCHEMA.md`'s `users` collection for the exact shape):

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@hms.local` | `ChangeMe123!` |
| Doctor | `doctor@medicarehms.demo` | `Demo@1234` |
| Nurse | `nurse@medicarehms.demo` | `Demo@1234` |
| Receptionist | `receptionist@medicarehms.demo` | `Demo@1234` |
| Pharmacist | `pharmacist@medicarehms.demo` | `Demo@1234` |
| Laboratory Staff | `lab@medicarehms.demo` | `Demo@1234` |
| Patient | `patient@medicarehms.demo` | `Demo@1234` |

## Troubleshooting

**"Missing or insufficient permissions" errors in the browser console.**
`firestore.rules` is rejecting the read/write. Almost always one of: (a) you're testing with a role that genuinely shouldn't have that access (working as intended), (b) `firestore.rules` hasn't been deployed since your last edit (`firebase deploy --only firestore:rules`), or (c) the `users/{uid}` document for the logged-in account doesn't exist or has the wrong `role` value - check it directly in the Firebase Console -> Firestore.

**"The query requires an index" error.**
Firestore needs a composite index for that specific query shape. The error message includes a direct link that creates it in one click - click it, wait a minute or two for the index to build, retry. `firestore.indexes.json` already covers every query this app's code makes; you'd only see this if you've added a new query pattern.

**Login works but the app shows a blank/broken dashboard.**
Check that the `users/{uid}` Firestore document actually exists for that account (Console -> Firestore -> `users` collection) - an Auth account with no matching Firestore document has no role and nothing to authorize against. This is exactly what the migration script and admin-account-creation flow both create automatically; it only goes missing if an account was created some other way (e.g. directly in the Auth console) without the matching document.

**"Firebase config is missing" error on startup.**
`client/.env` doesn't exist or is missing values - copy `client/.env.example` and fill in your project's config (Firebase Console -> Project Settings -> General -> Your apps).

**A file upload fails with a size error.**
Expected - see [Free-tier limitations](#free-tier-limitations-read-this) above. Cloud Storage isn't available on Spark; base64-in-Firestore has a real size ceiling.

## What happened to the old backend

`server/` (Express/MySQL) and both `docker-compose.yml` files are **still in this repository, untouched** - not deleted, not modified. This is deliberate: verify the Firebase version does everything you need before removing a working fallback. Once you're confident, it's safe to delete `server/`, `docker-compose.yml`, `docker-compose.prod.yml`, `client/Dockerfile`, `client/Dockerfile.prod`, and `client/Caddyfile` - none of them are referenced by the Firebase deployment path in any way.

---

## Preserved functionality

Every one of the following works the same as before, now on Firestore + Security Rules instead of MySQL + Express: authentication, admin/doctor/nurse/pharmacist/lab-staff/patient dashboards, user management, patient management, doctor management, departments, doctor availability, appointments (with real atomic double-booking prevention), medical records, vitals, prescriptions (with a real FIFO stock-dispensing transaction), pharmacy inventory, medicine inventory, laboratory tests and results, billing/invoices/payments, notifications, reports, audit logs, PDF generation (now entirely in-browser via jsPDF), role-based permissions, public hospital pages, responsive UI, dark mode, and the existing navigation/UX.
