# iCare 32 frontend (React + Vite)

The user interface (phone-first). See the main `README.md` in the project root for full setup.

- `src/pages` — screens (home, patients, patient record, new patient, collections, admin)
- `src/components/patient` — patient record sections (tooth chart, plan, payments, files …)
- `src/components/print` — the letterhead receipt and quotation
- `src/styles/app.css` — design tokens and components; `print.css` — printed documents

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run lint
```

The API address is set with `VITE_API_BASE_URL` (see `.env.development`, `.env.production`
and `.env.example`). Default: `/api` on the same server (the dev server forwards it to port 8000).
