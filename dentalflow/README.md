# iCare 32 Dental Clinic (DentalFlow) — MERN stack

Clinic management app built for phones first (works on tablets and computers too):
patient registration (new patients and returning patients' visits), comorbidities, chief
complaints, a tooth chart with separate crown and root colours and notes, treatment plans
with a printable pink quotation, treatments, appointments that show up on their day,
prescriptions (medicines with the date) on the letterhead, cash / UPI payments with a
printable letterhead receipt, reports and photos (straight from the phone camera) and daily
collections. Every change is kept in a history, deleted items can be restored, and the data
is backed up automatically every day.

It runs on **one computer in the clinic**; every phone, tablet and computer on the clinic
Wi-Fi opens it in the browser. No internet is needed after the first start.

| Role | Can do |
|------|--------|
| **Reception** | register new patients and returning patients' visits, check in patients who have an appointment, record payments (cash / UPI), upload photos and reports, print receipts, quotations and prescriptions, see today's collection |
| **Doctor** | everything clinical: comorbidities, complaints, tooth chart, treatment plan, treatments, next appointments, prescriptions; sees collections only if the admin allows that doctor |
| **Admin** | everything, plus the team (add, remove, restore), who sees collections, the history of every change, backups, the comorbidity list, tooth chart colours (up to 10), deleting mistaken payments / files (kept, can be restored) and adjusting a bill total |

| Layer    | Technology                                              |
|----------|---------------------------------------------------------|
| Database | **MongoDB** (built-in, or MongoDB Atlas / any MongoDB)  |
| Server   | **Express 5** on **Node.js** — serves the API *and* the app |
| App      | **React 19** + Vite, React Router, Zustand              |

**No Docker, no separate database install.** The only requirement is **Node.js 20.19+**
(LTS from https://nodejs.org). One server process runs everything on one port.

---

## Clinic computer setup (everyone on the same Wi-Fi)

The app runs on one Windows computer in the clinic (it stays on during clinic hours). Phones,
tablets and other computers connected to the **same Wi-Fi** open it in the browser.

1. **Install Node.js** (LTS) from https://nodejs.org on that computer.
2. **Copy this folder** to the computer, e.g. `C:\iCare32`. (Not inside OneDrive/Google Drive.)
3. **Double-click `start.bat`.** The first start installs everything and downloads the database
   engine (needs internet once). The window shows:

   ```
   • On this computer:  http://localhost:8000
   • From other devices on the network:  http://192.168.1.50:8000
   ```

   It also shows the first admin password (saved in `backend\data\initial-admin-password.txt`).
   When Windows asks, **allow Node.js on private networks**.
4. **Run `install-autostart.bat` once** (right-click → *Run as administrator*). The app then starts
   by itself, minimised, whenever the computer starts, and the firewall is opened for port 8000.
5. On each phone: connect to the clinic Wi-Fi, open **http://192.168.1.50:8000** (the address from
   step 3) in Chrome / Safari and choose **Add to Home screen**.

Check once on the clinic computer:

- **Wi-Fi network profile = Private** (Settings → Network & internet → Wi-Fi → your network).
  On a *Public* network Windows blocks the phones.
- **Sleep = Never** while plugged in (Settings → System → Power). A sleeping computer means the
  app is unreachable.
- **Fixed address:** in the Wi-Fi router's settings, *reserve* the computer's IP address
  (DHCP reservation, using the address shown in step 3). Otherwise the address can change after
  a router restart and the phones' home-screen icons stop working.

Keep the server window open (minimised is fine). If the app ever stops, `start.bat` starts it
again after 10 seconds.

| File | What it does |
|------|--------------|
| `start.bat` | starts the app (and keeps it running) |
| `install-autostart.bat` | start automatically with Windows + open the firewall (run once) |
| `remove-autostart.bat` | stop starting automatically (data untouched) |
| `backup-now.bat` | back up everything now |
| `restore-backup.bat` | drag a backup file onto it to restore (the current data is backed up first) |
| `reset-admin-password.bat` | set a new password for any account, e.g. when the admin is locked out |

### Backups — so no data is ever lost

- **Automatic:** once a day the whole database is saved as one file
  (`icare32-backup-YYYY-MM-DD_HHMM.jsonl.gz`), and new or changed photos / reports are copied
  to a `media` folder next to it. A backup is also taken before every data upgrade and restore.
  The last 60 backup files are kept.
- **Where:** `backend\data\backups` by default. **Put them outside this computer** by setting
  `BACKUP_DIR` in `backend\.env` to a OneDrive / Google Drive folder or a USB drive, e.g.
  `BACKUP_DIR=C:\Users\Clinic\OneDrive\iCare32-backups`.
- **Admin → Backups** shows the last backup, has *Back up now*, and downloads any backup file
  (e.g. to keep a copy on a pen drive or email it to yourself).
- **Restore:** close the server window, drag the backup file onto `restore-backup.bat`, type
  `YES`, then start the app again. (Or `npm run restore -- <file> --yes`.) The data as it was
  before the restore is backed up first, so a restore can itself be undone.

Nothing is erased inside the app either: removed team members, deleted payments, files,
prescriptions and plan items, cleared teeth and changed details are kept, and **Admin → History**
shows who changed what and when (with the old values). Deleted files can be restored from the
patient's *Reports and photos → Deleted*.

### Moving to a new computer

Install Node.js on the new computer, copy the whole folder (with the server stopped), or copy the
code and restore the latest backup file with `restore-backup.bat`.

---

## Quick start (any PC or server)

**Windows:** double-click **`start.bat`**
**macOS / Linux:** run **`./start.sh`**

or, from this folder in a terminal:

```bash
npm run setup     # first time only: installs packages and builds the app
npm start
```

Then open **http://localhost:8000**. Other computers, tablets and phones on the same network
can use **http://YOUR-PC-IP:8000** (the address is printed when the server starts).

**On the phone:** open that address in Chrome (Android) or Safari (iPhone) and choose
*Add to Home screen* — the app then opens full-screen like an installed app.
Receipts and quotations open in a preview; *Print or save PDF* lets you print or share the PDF
(e.g. on WhatsApp).

### What happens on the first start

1. **Database** — the built-in MongoDB downloads automatically (once, ~100 MB; internet
   needed only this first time). Data is stored in `backend/data/db` and kept across restarts.
2. **Admin account** — a Master admin is created and its password is printed in the window:

   ```
   First start — Master admin account created
   Email:    admin@dental.com
   Password: kD3x...           (also saved in backend/data/initial-admin-password.txt)
   ```

   Log in with it, then add doctors and receptionists in the **Admin Panel**.
   (Want the old demo accounts with password `Admin@123`? Run `npm run seed`.)
3. **Login secret** — generated automatically and saved in `backend/data/.jwt-secret`.

**Backups:** automatic every day — see *Backups* above.

### Keep it running (clinic PC or office server)

```bash
npm install -g pm2
pm2 start "npm start" --name dentalflow
pm2 save
pm2 startup          # Linux/macOS: start automatically after reboot
```

On Windows you can instead put a shortcut to `start.bat` in the Startup folder
(`Win+R` → `shell:startup`).

---

## Passwords

- **Forgot password?** on the sign-in screen emails a link to choose a new password
  (works once, for 30 minutes) — when email is set up (below).
- **Admin → Team → a person → Reset password** gives a temporary password (always works, no
  email needed). The person must choose their own password the next time they sign in.
- **Account menu (top right) → Change password** for your own password.
- Changing or resetting a password signs that person out on every other phone and computer.
- **Locked out of the only admin account?** On the clinic computer double-click
  `reset-admin-password.bat` (or `npm run reset-password`). Or run `npm run create-admin`, or on Railway set the
  variables `RESET_PASSWORD_EMAIL` (the admin's email) and `RESET_PASSWORD` (a new password),
  wait for the redeploy, sign in, choose a new password, then delete both variables.

### Email for password resets

Pick one and add the variables (Railway → app service → Variables, or `backend/.env`):

| Option | Variables | Notes |
|--------|-----------|-------|
| **Brevo** (free, 300 emails/day) | `BREVO_API_KEY`, `MAIL_FROM=icare322025@gmail.com` | Works with the clinic's Gmail: add it as a sender in Brevo and click the confirmation link it emails. Works on Railway Hobby. |
| **Resend** | `RESEND_API_KEY`, `MAIL_FROM=clinic@your-domain` | Needs your own domain verified in Resend. Works on Railway Hobby. |
| **Gmail SMTP** | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=icare322025@gmail.com`, `SMTP_PASS=<Google app password>` | For the clinic PC or a VPS. **Not on Railway Hobby** (Railway blocks SMTP there). |

Optional: `APP_URL=https://your-domain` so links in emails use your own domain.
Without email, "Forgot password?" tells staff to ask the admin.

**On the clinic computer** email is optional: the admin can always give a temporary password
(Admin → Team → person → Reset password), which needs no internet. To also email reset links,
use Gmail SMTP with an *app password* (Google account → Security → 2-Step Verification →
App passwords) and set the address the phones use:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=icare322025@gmail.com
SMTP_PASS=abcdefghijklmnop
APP_URL=http://192.168.1.50:8000
```

Sending needs internet on the clinic computer, and the emailed link only opens on a phone
connected to the clinic Wi-Fi.

---

## Deploying to Railway (railway.com)

The app is ready for Railway: it finds Railway's database address, keeps uploads on an
attached volume, uses https links and stops with a clear message if the database is missing.

1. Put this folder in a **private GitHub repository**.
2. Railway → **New Project → Deploy from GitHub repo** → choose the repository.
3. In the project, **+ New → Database → MongoDB**.
4. Open the app service → **Variables** and add:

   | Variable | Value |
   |----------|-------|
   | `MONGODB_URI` | `${{MongoDB.MONGO_URL}}` |
   | `RAILPACK_NODE_VERSION` | `22` |
   | `INITIAL_ADMIN_PASSWORD` | *(optional)* password for the first admin; otherwise it is shown in the deploy logs |

5. Right-click the app service → **Attach volume**, mount path **`/data`** (photos, reports and
   the login secret are stored there automatically).
6. App service → **Settings → Networking → Generate Domain** (or add your own domain).
   Optional: Settings → Deploy → Healthcheck path `/api/health`. Choose the Singapore region for
   the app and the database (closest to India).
7. Turn on **Backups** (Daily) for both the MongoDB service and the app's volume.

Every push to GitHub redeploys automatically; the database and the volume are kept.
No build or start commands are needed (`npm install` → `npm run build` → `npm start`).
If the logs show "permission denied" for `/data`, add the variable `RAILWAY_RUN_UID=0`.

Other hosts (Render, a VPS, …): set `MONGODB_URI` (or use the built-in database on a VPS),
`TRUST_PROXY=true`, a persistent folder for `MEDIA_ROOT`, and `JWT_SECRET`.

---

## Development

```bash
npm install       # once (installs the backend and the frontend too)
npm run dev       # API on :8000 + React dev server with live reload on :5173
```

Open http://localhost:5173. The dev server forwards `/api` and `/media` to the API, so
nothing needs configuring. Other useful commands:

```bash
npm run seed          # demo accounts (admin/doctor/reception @dental.com, password Admin@123)
npm run create-admin  # create another Master admin
npm run lint          # frontend lint
npm test              # API tests (67, temporary in-memory database, nothing to set up)
```

Settings live in `backend/.env` (copy from `backend/.env.example`) — **all optional**.

---

## Moving existing data from the old PostgreSQL version

Copies users, patients, payments, edit history, check-ins, complaints, tooth charts,
treatments and reports into MongoDB. **Existing passwords keep working.** Old payments are
treated as cash, and old "pre-existing problems" text is kept as the comorbidity notes.

```bash
cd backend
npm install pg
# Windows:      set PG_URL=postgres://dentalflow_user:PASSWORD@localhost:5432/dentalflow
# macOS/Linux:  export PG_URL=postgres://dentalflow_user:PASSWORD@localhost:5432/dentalflow
npm run migrate:postgres -- --media-from "C:\path\to\old\backend\mediafiles"
```

It writes into the database the server uses (built-in, or `MONGODB_URI` if set).
Run it once before the first start, or add `--drop` to replace existing data.

---

## Project structure

```text
dentalflow/
  start.bat / start.sh     one-click start (installs, builds, runs, restarts if stopped)
  install-autostart.bat    clinic PC: start with Windows + open the firewall
  backup-now.bat, restore-backup.bat, reset-admin-password.bat, remove-autostart.bat
  package.json             setup / start / dev / seed / test / backup / restore commands
  backend/                 Node.js + Express + MongoDB server
    src/
      config/              settings, database connection, built-in MongoDB
      models/              Mongoose models (User, Patient, Treatment, ...)
      controllers/         request handlers (auth, patients, clinical, appointments,
                           prescriptions, reports, admin: history and backups)
      routes/              API routes (same URLs as the old Django API)
      middleware/          JWT auth, uploads, error handling
      utils/               validation, serializers, dates, money, tokens, history, backups
    scripts/               seed, create-admin, reset-password, backup, restore, PostgreSQL migration
    tests/                 end-to-end API tests
    data/                  (created at runtime) built-in database, secrets, backups
    mediafiles/            (created at runtime) uploaded reports (deleted ones in trash/)
  frontend/                React + Vite app
```

## Main routes

App: `/login`, `/dashboard`, `/patients`, `/patients/new`, `/patients/<ID>`, `/collections`, `/admin`
(the old `/register-patient` and `/doctor-hub` addresses still work)

| Area        | API endpoints |
|-------------|-----------|
| Health      | `GET /api/health/` |
| Auth        | `POST /api/auth/login/`, `POST /api/auth/refresh/`, `GET /api/auth/me/`, `POST /api/auth/logout/` |
| Users       | `POST /api/auth/admin/users/create/`, `GET .../list/?include_removed=1`, `GET/DELETE .../<id>/` (remove: kept, can be restored), `POST .../<id>/restore/`, `PATCH .../<id>/update/` (`can_view_collections`), `POST .../<id>/reset-password/` |
| Clinic date | `GET /api/meta/` (the clinic's today, always from the server) |
| Patients    | `POST /api/patients/` (reception / admin; also records today's visit), `GET /api/patients/<uid>/`, `GET /api/patients/search/?search=`, `GET /api/patients/duplicates/?phone=&name=`, `GET /api/patients/stats/`, `GET /api/patients/appointments/today/`, `PATCH .../<uid>/problems/` (comorbidities), `PATCH .../<uid>/payment/`, `GET/POST .../<uid>/payments/`, `DELETE .../<uid>/payments/<id>/` (voided, kept), `PATCH .../<uid>/total/`, `PATCH .../<uid>/edit/`, `GET .../<uid>/edits/`, `GET/POST .../<uid>/checkin/` (today's visit, one per day), `GET .../<uid>/appointments/`, `PATCH .../<uid>/appointment/` |
| Visits      | `GET /api/visits/today/` (waiting / seen) |
| Appointments | `GET /api/appointments/?date=`, `GET /api/appointments/upcoming/?days=7`, `POST /api/appointments/`, `PATCH /api/appointments/<id>/`, `POST /api/appointments/<id>/cancel/` |
| Prescriptions | `GET /api/prescriptions/<uid>/`, `POST /api/prescriptions/`, `PATCH/DELETE /api/prescriptions/item/<id>/` |
| History     | `GET /api/history/?patient_uid=&area=&q=&from=&to=&hide_logins=1&before=` (admin) |
| Backups     | `GET/POST /api/backups/`, `GET /api/backups/download/<file>` (admin) |
| Collections | `GET /api/payments/?from=YYYY-MM-DD&to=YYYY-MM-DD&mode=cash|upi` |
| Complaints  | `POST /api/complaints/`, `GET /api/complaints/<uid>/` |
| Tooth chart | `POST /api/tooth/` (`crown_status`, `root_status`, `notes`), `POST /api/tooth/bulk/`, `GET /api/tooth/<uid>/`, `GET/DELETE /api/tooth/<uid>/<tooth_id>/` |
| Treatment plan | `GET /api/proposals/<uid>/`, `POST /api/proposals/`, `PATCH/DELETE /api/proposals/item/<id>/`, `POST .../item/<id>/done/`, `POST .../item/<id>/undo/` |
| Treatments  | `POST /api/treatments/`, `GET /api/treatments/<uid>/` |
| Settings    | `GET/PATCH /api/settings/` (comorbidity list, tooth colours) |
| Reports     | `POST /api/reports/` (multipart), `GET /api/reports/<uid>/` (`?deleted=1` for the admin), `DELETE /api/reports/delete/<id>/` (moved to trash), `POST /api/reports/<id>/restore/`, `GET /api/reports/receipt/<uid>/` |

## Troubleshooting

- **"Instance failed to start" / download error on first start** — the PC needs internet for
  the one-time database download (from fastdl.mongodb.org). Behind a strict firewall, install
  MongoDB Community Server and set `MONGODB_URI=mongodb://127.0.0.1:27017/dentalflow`, or use Atlas.
- **Port 8000 already in use** — set `PORT=8080` (or any free port) in `backend/.env`.
- **Forgot the admin password** — `npm run create-admin` creates a new Master admin.
- **Other devices can't connect** — run `install-autostart.bat` as administrator (opens the
  firewall), make sure the Wi-Fi is set to *Private* on the clinic computer, the phone is on the
  same Wi-Fi (not mobile data or a guest network), and use the IP address shown in the start-up
  message. Some routers isolate devices on a "guest" network — use the main network.
- **The address changed** — reserve the computer's IP in the router (see *Clinic computer setup*).
- **"Port 8000 is already in use"** — the app is already running (look for its other window).
- **Testing appointments on a future day** — `CLINIC_FAKE_TODAY=2026-10-20` in `backend/.env`
  makes the app think it is that day. Remove it for real use (the server warns while it is set).
