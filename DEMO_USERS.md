# Demo Login Credentials

This file is generated automatically by `server/database/seed.js` (via `npm run db:seed`) and always reflects the accounts that script creates. **These are demo credentials only - never reuse them, or this seeding approach, for a real deployment.**

> This copy was written by hand to match the seed script's exact output template, since generating it "for real" requires a running MySQL instance. Run `npm run db:seed` (or `docker compose up --build`) once and this file will be overwritten with the live version — same content, plus an accurate generation timestamp and patient count pulled straight from the database.

## Accounts

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Administrator | `admin@hms.local` | `ChangeMe123!` | Full system access - Users, Departments, Reports, Audit Logs, and everything else. |
| Doctor | `doctor@medicarehms.demo` | `Demo@1234` | Dr. Sarah Mitchell - has patients, appointments, medical records, prescriptions, and lab requests already on file. |
| Nurse | `nurse@medicarehms.demo` | `Demo@1234` | Can look up patients and record vitals; has demo vitals history already recorded. |
| Receptionist | `receptionist@medicarehms.demo` | `Demo@1234` | Can register patients, book/cancel/reschedule appointments, and manage billing. |
| Pharmacist | `pharmacist@medicarehms.demo` | `Demo@1234` | Has pending prescriptions to dispense and can see the low-stock / expiring-soon alerts. |
| Laboratory Staff | `lab@medicarehms.demo` | `Demo@1234` | Has pending and completed lab requests to work through. |

## What's in the demo dataset

- **50 patients**, each with realistic demographics, allergies, chronic conditions, emergency contacts, and insurance info
- Each patient has **one completed past visit** (with recorded vitals, a medical record, and an invoice) and **one upcoming appointment**
- Most visits include a **prescription** for a condition-appropriate medicine; roughly half of those prescriptions have been **dispensed** through the real pharmacy stock-decrement logic
- About half of all patients have a **laboratory test** on file, most with results already uploaded (a few left "in progress" so the lab queue isn't empty)
- Invoices are a realistic mix of **paid, partially paid, and unpaid**
- **13 medicines** across every reference category, including one deliberately low on stock and one with a batch expiring soon - so the Pharmacy dashboard's alerts have something to show immediately
- Each demo account has a **welcome notification**, and the doctor account has a handful of appointment-reminder notifications

## Re-seeding

`npm run db:seed` is idempotent - running it again will:
- leave all six accounts untouched if they already exist
- **skip** regenerating the bulk dataset entirely once it detects it already ran (it checks for a marker notification on the admin account)

To force the bulk dataset to regenerate, delete that marker (a notification titled "Demo Data Seed v1" on the admin account), or reset the whole database (`docker compose down -v` if you're using Docker).

---
_Template version - run `npm run db:seed` against a live database to generate the real, timestamped version of this file._
