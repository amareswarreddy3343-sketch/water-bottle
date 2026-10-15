# Changes

## Clinic computer release (October 2026)

Runs on one computer in the clinic; everyone on the clinic Wi-Fi uses it from their phone.
Nothing is ever erased — every change is in a history and the data is backed up every day.

| Change | What it does |
|---|---|
| **Clinic computer setup** | `start.bat` keeps the app running (restarts it if it stops); `install-autostart.bat` starts it with Windows and opens the firewall for the Wi-Fi; `backup-now.bat`, `restore-backup.bat` (drag a backup onto it) and `reset-admin-password.bat`. Steps in README → *Clinic computer setup*. |
| **Registration at reception** | Only reception (and the admin) register patients; doctors no longer have a *New patient* button. **Register → New patient / Old patient**: an old patient is found by name, phone or ID and gets **today's visit** on their existing record — no duplicate. While typing a new patient's phone or name, *Already registered?* shows matching patients with a *Today's visit* button. A reason for the visit can be added. One visit per patient per day. |
| **Appointments that show up on their day** | The doctor gives the next appointment (date, optional time and purpose; quick *1 week*, *1 month* … buttons) from the patient's page. On that day it is on everyone's dashboard under **Today's appointments** (Expected → Arrived when reception checks the patient in; Missed afterwards). Dashboards also show the **next 7 days**. A patient can have several upcoming appointments; they can be moved or cancelled (kept as cancelled). |
| **"Today" fixed** | "Today" is always the clinic's date from the server (Asia/Kolkata), never the phone's own clock. |
| **Dashboards** | Reception: today's appointments with *Check in*, today's visits (waiting / seen), today's collection, next 7 days, *New patient* / *Old patient visit*. Doctor: **Waiting today** (new and old patients registered today; moves to *Seen* once the doctor writes something), today's appointments, next 7 days. |
| **Medicines (prescriptions)** | At the **end** of the patient's page: medicines with dose, how often (1-0-1, SOS …), days, before / after food, notes and advice, each prescription with its **date**. Printable on the clinic letterhead. Reception can print them. |
| **Crown and root colours** | A tooth's **crown and root have their own colours** (e.g. caries on the crown, RCT on the root). Each colour is set by the admin for the crown, the root or both (like *Missing*). **Up to 10 colours.** Earlier whole-tooth colours were moved to the right part automatically. |
| **Tap / double-tap on the chart** | **Tap** a crown or a root to see its note (and colour) without opening anything. **Double-tap** opens the note editor for that part with the cursor in the note box. |
| **Complaints** | The per-doctor *Can add chief complaints* switch is gone — every doctor can add complaints. |
| **Collections per doctor** | Collections (money) are shown to a doctor only when the admin turns on **Can see collections** for that doctor (Admin → Team). The admin always sees them; reception sees today's total. |
| **Remove team members** | Admin → Team → person → **Remove**: they are signed out and cannot sign in, but every patient, note, treatment and payment they recorded stays, with their name. **Removed members** can be restored. |
| **History** | Admin → **History**: who changed what and when — registrations, visits, appointments, complaints, tooth chart, plan, treatments, payments, files, prescriptions, team, settings, passwords, sign-ins — with search, filters and the saved old values. Each patient page has a **History** button for the admin. |
| **Nothing is erased** | Deleted payments are voided (no longer counted, still stored); deleted files go to a trash folder and can be **restored** (Reports and photos → Deleted); prescriptions, plan items and removed colours are kept in the history; clearing a tooth keeps a copy. |
| **Backups** | Automatic daily backup of the whole database plus uploaded files (to `BACKUP_DIR`, e.g. OneDrive or a USB drive), also before upgrades and restores; Admin → **Backups** with *Back up now* and downloads; `npm run restore` / `restore-backup.bat` backs up the current data before restoring. |
| **Forgot password on the Wi-Fi** | The admin's temporary password works without internet. Emailed links work with Gmail SMTP (app password) and `APP_URL=http://<clinic-PC-IP>:8000`. |
| **Tests** | 36 new API tests (119 in total) and new browser tests on a phone screen for all three roles, including a run with the clinic date moved to the appointment day. |

### Notes after updating

- Doctors who should see collections must be switched on once in Admin → Team (it starts off).
- Appointments are given by doctors (and the admin); reception checks patients in.
- Existing data is upgraded on the first start (payments, colours, visits, next appointments) and a
  backup is taken before that.

## Passwords (October 2026)

- **Forgot password?** on the sign-in screen: emails a one-time link (30 minutes) to choose a new
  password. The answer is the same whether or not the email has an account, at most one email a
  minute per person, and the link's secret part never appears in server logs.
- **Admin reset** in Admin → Team: a temporary password (shown once, with a Copy button) or an
  emailed link. People with a temporary password must choose their own at the next sign-in.
- **Change password** in the account menu.
- Any password change signs that person out everywhere else.
- Email through **Brevo** or **Resend** (HTTPS — works on Railway's Hobby plan, which blocks SMTP)
  or **SMTP** (e.g. Gmail app password on the clinic PC / a VPS). Without email, the forgot page tells
  staff to ask the admin.
- Emergency admin recovery with the `RESET_PASSWORD_EMAIL` / `RESET_PASSWORD` variables
  (applied once).
- 15 new API tests (83 in total) and a 13-step browser test of every password flow.

## Railway hosting (October 2026)

- Ready to deploy on Railway with no build/start settings: `npm install` at the top folder now
  installs the backend and frontend too.
- Uses Railway's MongoDB address (`MONGODB_URI=${{MongoDB.MONGO_URL}}`, database `dentalflow`),
  stores uploads, the login secret and the first admin password on the attached volume,
  serves https file links automatically, and refuses to start without a database (so patient data
  is never written to the container's temporary disk). Steps in README → Deploying to Railway.

## October 2026 — clinic features and phone-first redesign

### New features

| Feature | What it does |
|---|---|
| **Comorbidities** | "Pre-existing medical problems" is now **Comorbidities**: tick boxes for diabetes, hypertension, cardiac disease, asthma, thyroid, bleeding disorder / blood thinners, kidney, liver, epilepsy, pregnancy, drug allergy and smoking, plus a free-text box for anything else. Shown as chips on the patient page, patient list and today's appointments. The **admin adds and removes** items in Admin → Comorbidities. Can be filled in at registration. |
| **Patient page order** | Comorbidities → complaints → **tooth chart and tooth notes** → **treatment plan** → treatments done → payments → reports and photos → next appointment. A row of shortcuts at the top jumps to each part. |
| **Tooth chart** | Each tooth has a **whole-tooth note, a separate root note** and notes per crown surface (buccal/labial, lingual/palatal, occlusal/incisal, mesial, distal). Tap the root or crown on the large tooth drawing, or a surface on the surface map. Previous / next buttons move along the arch. |
| **Status colours** | One status per tooth, shown as its colour: **black = missing / extracted, gray = caries** (plus filled and root canal treated to start with). The **admin sets up to 5** statuses and colours (Admin → Tooth colours). Teeth with notes show a small dot instead of turning gray. |
| **Select teeth** | **All**, **Upper** and **Lower** buttons (and **Pick** for any teeth). Tap teeth to deselect the ones not needed, then **Update** applies a status and/or a note (whole tooth, root or a surface; added to existing notes or replacing them) to all selected teeth at once. |
| **Treatment plan / quotation** | Doctors add proposed procedures with tooth and cost (common procedures are suggested). The estimate does **not** change the bill. **Print quotation** gives an A4 quotation on a **pink** letterhead. **Mark done** moves an item into treatments done (with date and final cost) and adds it to the bill; **Not done yet** reverses it. |
| **Payments** | Reception (and doctors / admin) record the **amount and mode — cash or UPI** (with an optional UPI reference). Bill, paid, balance (or advance) and the cash / UPI split are shown on the patient page. Old payments count as cash. The admin can delete a payment entered by mistake. |
| **Collections** | New page for doctors and admin: today / yesterday / this week / this month / chosen dates, totals by cash and UPI, every payment with patient, time and who received it. The home screen shows today's collection for everyone. |
| **Paid receipt** | Rebuilt on the **iCare 32 letterhead** (green frame, logo, cell number, email, timings, Patient Name / Age / Sex / Date, address at the bottom; no QR code). Lists every treatment and **every payment with date, mode and who received it**, the bill total, paid by cash / UPI, balance, and the amount in words. |
| **Reports and photos** | **Take photo** opens the phone camera; **Upload file** takes photos or PDFs (several at once). Large photos are resized before upload so they go up quickly on mobile data. Files show as a thumbnail grid; tap to view full-screen, swipe between them, tap to zoom. Reception can now see and upload them too. New type: **Photo**. |
| **Check in** | One button on the patient page; shows "Checked in at …" for today. |

### New look (phone-first)

- Whole interface rebuilt to be minimal and fast on phones: bottom tab bar (Home, Patients,
  New, Collections, Admin), big touch targets, forms that open as bottom sheets, live search,
  no sideways scrolling down to 360 px wide. On a computer the tabs become a sidebar.
- Clinic branding: the tooth-and-heart logo, berry accent, green for money received.
  Light and dark themes (account menu, top right).
- Can be added to the phone's home screen and opens full-screen.
- Old addresses (`/doctor-hub`, `/register-patient`) redirect to the new pages.

### Under the hood

- New API: settings, tooth bulk update, treatment plan, payment delete, collections report;
  payment mode/reference, comorbidities and tooth status fields (all additive — older clients
  keep working). Existing data is upgraded automatically on start.
- 21 new API tests (67 in total) and a 43-step phone-size browser test of every feature for all
  three roles — all passing.
- Unused Tailwind tooling and 20 MB of unused images removed; React Router updated to v7
  (fixes the remaining moderate advisory — `npm audit`: 0 issues).
- Fonts are bundled with the app, so it looks the same without internet at the clinic.

---

## Conversion to MERN — what changed

### Stack

| Before                                   | After                                          |
|------------------------------------------|------------------------------------------------|
| Django 5 + Django REST Framework         | Express 5 on Node.js                           |
| PostgreSQL                               | MongoDB (Mongoose 8)                           |
| SimpleJWT                                | jsonwebtoken (same 8 h / 7 day lifetimes, refresh rotation, logout blacklist) |
| Django FileField / media                 | Multer, same `mediafiles/reports/YYYY/MM/` layout |
| `seed.py`, `createsuperuser`             | `npm run seed`, `npm run create-admin`         |
| —                                        | `npm run migrate:postgres` (copies existing data, keeps passwords) |
| React 19 + Vite                          | unchanged (bug fixes only)                     |
| Docker Compose for PostgreSQL            | not needed — built-in MongoDB, one Node server |

### Deployment without Docker

- **Built-in MongoDB:** when `MONGODB_URI` is empty, the server starts its own MongoDB
  (downloaded automatically on first start, data in `backend/data/db`, kept across restarts).
  Set `MONGODB_URI` to use MongoDB Atlas or any other MongoDB instead.
- **One server, one port:** Express serves the built React app and the API together on port 8000;
  the app calls `/api` on the same address, so it works on any host name or LAN IP with no
  CORS or IP configuration. (The old setup needed the API IP baked into the frontend build.)
- **Zero configuration:** `.env` is optional. The login-token secret is generated and saved
  automatically, and the first start creates the Master admin with a random password
  (printed once, also saved in `backend/data/initial-admin-password.txt`).
- **One-click start:** `start.bat` (Windows) / `start.sh` (macOS, Linux) or `npm run setup` +
  `npm start` — installs packages, builds the app and starts the server.
- **Development:** `npm run dev` runs API + React dev server together; Vite forwards `/api`
  and `/media`, so no CORS setup is needed.
- **Tests:** `npm test` uses a temporary in-memory MongoDB — nothing to set up.
- `docker-compose.yml` removed. Node.js 20.19 or newer is required.

### How it was verified

- **API parity:** the original Django app and the new Express app were run side by side and sent
  the same 89 requests (every endpoint, every role, success and error cases). Status codes,
  JSON structure and values were identical for all 89.
- **Visual parity:** the original frontend (on Django) and the new frontend (on Express) were
  screenshotted through 22 screens for all three roles with identical data. 17 were
  pixel-identical; the other 5 differ only where a bug was fixed (below) or in the receipt's
  print timestamp.
- **Data migration:** a real PostgreSQL database created by the original app was migrated; all old
  passwords logged in and 13 read endpoints returned identical data from both systems.
- **Automated tests:** `backend/tests/api.test.js` — 46 end-to-end tests, all passing.
- **Lint/build:** `npm run lint` now reports 0 problems (was 31 errors + 7 warnings);
  `npm run build` passes; `npm audit` reports 0 issues in the backend.

### Errors found and fixed

#### Backend (confirmed against the original running code)

| Problem in the original | Fix |
|---|---|
| Adding a treatment without a date (or with `null`) crashed with **500** | Defaults to today's date |
| Registering a patient without a phone returned the cryptic error `'phone'` | Phone is optional, as the database allowed |
| Editing a patient with a negative age crashed with **500**; any gender text (e.g. "banana") was saved | Values are validated (400 with a clear message) |
| Invalid appointment date (e.g. 2026-02-30) crashed with **500** | Rejected with a clear message |
| Clearing pre-existing problems with `null` crashed with **500** | Treated as empty |
| A payment of `"NaN"` crashed with **500** | Rejected as invalid amount |
| The only Master admin could be changed to another role, locking everyone out of the Admin Panel | Blocked ("Cannot change the role of the last Master user.") |
| Deactivated users were told "Invalid email or password." | Correct message: "This account has been deactivated." |
| `can_edit_complaints: "false"` (string) turned access **on** | Booleans parsed properly |
| Reports could be uploaded for patient UIDs that don't exist | Rejected |
| Patient UIDs could collide (uniqueness was never checked) | Unique UID generation with retries |
| Duplicate view classes in `patients/views.py` (later ones silently replaced earlier ones) | Single implementation of each endpoint |
| A whole Windows virtualenv (`backend/dentalven/`, 9,000+ files) was committed to the project | Removed with the Python backend |
| Root `.gitignore` contained a PowerShell command instead of ignore rules | Rewritten |
| Uploaded files were only served when `DEBUG=True` (broken links in production) | Always served (active content forced to download) |

#### Frontend

| Problem in the original | Fix |
|---|---|
| **Wrong password:** the page silently reloaded and no error was shown (the token-refresh interceptor treated the login 401 as an expired session) | Login errors no longer trigger refresh/logout; "Invalid email or password." is shown |
| **White screen** when the API returned field errors (e.g. complaint shorter than 3 characters): error objects were rendered directly ("Objects are not valid as a React child") | All error messages go through `getErrorMessage()` |
| `UnifiedPatientDetail`: hook called conditionally (`useAuthStore().hasRole && useAuthStore()...`) and `setLocalPatient` undefined in the payment widget | Fixed |
| `DoctorPatientHubPage` passed `paidAmount` and `onPaymentUpdated` twice | Duplicates removed |
| Registration form inputs had two `onBlur` props, so "Name/Age/Phone is required" hints never appeared when leaving a field empty | Merged into one handler |
| Default treatment date, the appointment "TODAY" badge and the date-picker minimum used the **UTC** date (wrong in India between 00:00 and 05:30) | Use the local date |
| Adding a treatment changed the displayed total even when the admin had set a manual total | Manual total respected |
| Doctors saw a report **Delete** button that always failed (the API only lets the Master admin delete) | Button shown to the Master admin only; errors displayed |
| "Print Receipt" did nothing at all for patients without treatments | Shows "No treatment records found" |
| Tooth-chart delete dialog reopened on the wrong step, and its "Back" button closed the dialog | Fixed |
| Tooth notes dialog closed and lost the text when saving failed | Stays open and shows the error |
| Treatment form: if one row failed, already-saved rows stayed in the form and were saved again on retry | Saved rows are removed |
| Doctor Hub loaded each patient's treatments one at a time (very slow with many patients) | Loaded in parallel (6 at a time) |
| Logout did not revoke the refresh token on the server | Revoked |
| Rotated refresh tokens were ignored | Stored |
| `package-lock.json` out of sync with `package.json` (`npm ci` failed) | Regenerated; non-breaking security updates applied (axios etc.) |
| Favicon pointed to a missing `/vite.svg` | Uses the ClinicalFlow logo |
| Password placeholder said "Min 8 characters" but the rule is 6 | Text corrected |
| 31 ESLint errors + 7 warnings (unused code, effects, empty catches, use-before-declare) | 0 |
| Stray `postcss.config.jss` | Removed |

### Left as they were (your call)

- *(The earlier notes about the unused tooth-notes box, the receptionist's read-only search
  page, the large images and React Router v6 no longer apply — all resolved in the October 2026 update.)*
- The Django admin site (`/admin/`) has no MERN equivalent; the in-app Admin Panel covers user management.
