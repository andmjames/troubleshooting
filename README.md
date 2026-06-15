# Equipment Troubleshooting App — PMI Tape

Two tools in one app, in the PMI Tape internal style:

- **Help me with troubleshooting** — pick a machine, describe the problem, and get a short bulleted answer drawn from past repair logs (prioritized), the machine's manuals, and the web. Relevant manual-page images and past repair photos show up inline. Runs as a background job with polling, so long answers never time out.
- **Log a repair** — pick a machine, describe the problem and the fix, attach photos. Claude reviews it and asks a couple of quick follow-up questions so the log is useful later. Saved logs feed the troubleshooter.
- **Add a manual** — any employee picks a machine, drops a PDF, and the app renders + reads every page in the background (with a progress bar). No command line.

Stack: React (CRA) · Netlify Functions (incl. background functions) · Supabase (`zhvfcipveeeybczzmues`) · Claude API. Same shared design system as Order Pulling / Bill Upload.

---

## 1. Environment variables

Set these in Netlify (Site settings → Environment variables) and in a local `.env` for development. See `.env.example`.

| Variable | Where | What |
|---|---|---|
| `REACT_APP_SUPABASE_URL` | client | `https://zhvfcipveeeybczzmues.supabase.co` |
| `REACT_APP_SUPABASE_ANON_KEY` | client | Supabase anon key |
| `SUPABASE_URL` | functions | same URL |
| `SUPABASE_SERVICE_ROLE_KEY` | functions | Supabase **service role** key (never exposed to the browser) |
| `ANTHROPIC_API_KEY` | functions + ingestion | your Anthropic key |

## 2. Database

Already provisioned in Supabase project `zhvfcipveeeybczzmues`:

- Tables: `et_machines`, `et_manuals`, `et_manual_pages`, `et_repair_logs`, `et_troubleshoot_jobs`
- Search functions: `et_search_repair_logs`, `et_search_manual_pages` (Postgres full-text)
- Storage buckets (private): `manuals`, `manual-pages`, `repair-photos`, with RLS policies allowing the app to read/write just those three buckets
- The 20 machines are pre-loaded.

> Security note: the `et_` tables have RLS disabled and the storage policies allow the
> anon key (which ships in the browser) to read/write the three app buckets. That matches
> "anyone using the app" for an internal, known-URL tool — the same posture as your other
> internal apps. If you later put this on the open internet, add a PIN gate or Supabase Auth.

## 3. Run / deploy

```bash
npm install                    # app deps
npm start                      # local dev
# Deploy: push to the GitHub repo connected to Netlify (same as your other apps)
```

The Netlify Functions have their own `netlify/functions/package.json` (Supabase + mupdf),
so Netlify installs those separately from the React app — `mupdf` never enters the browser bundle.

### How the background work is wired

Both heavy operations use Netlify **background functions** (filename ends in `-background`,
runs up to 15 min, returns 202 immediately):

- **Troubleshooting**: the browser inserts a row in `et_troubleshoot_jobs`, calls
  `troubleshoot-background`, then polls the row until `status = done`. No HTTP timeout
  regardless of how long Claude + web search take.
- **Manual processing**: `manual-process-background` renders + reads pages in chunks of 25
  and re-invokes itself for the next chunk, so even a 400-page manual can't hit the 15-min
  ceiling. The upload screen polls `et_manuals.pages_done` for the progress bar.

---

## 4. How to add manuals and set model numbers  ← (your question)

### Adding manuals — now done in the app

Open **Add a manual** on the home screen → pick the machine → drop the PDF. The app
uploads it and processes every page in the background (you'll see a progress bar; you
can leave the screen and it keeps going). Each page gets a rendered image plus an
AI description, so the troubleshooter can both cite and **show** pages — including the
scanned assembly drawings that have no text layer. A machine can have several manuals;
just upload each one.

That's the path for employees. No command line, no setup.

### Bulk loading (optional, for you)

If you'd rather load all ~50 manuals at once from your Mac, the original CLI script is
still included and uses poppler locally:

```bash
brew install poppler
cd netlify/functions && npm install && cd ../..   # or just `npm install` at root for the script's supabase dep
export SUPABASE_URL=https://zhvfcipveeeybczzmues.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...
export ANTHROPIC_API_KEY=...
node scripts/ingest-manual.js --pdf "/path/to/Manual.pdf" --machine "Shanklin L Bar Sealer"
```

Both paths write to the same tables — use whichever is convenient.

### Model numbers (one-time, per machine)

Model numbers live on the machine row, not on the manuals. Most are set already. To
change one, run this in the Supabase SQL editor (or tell me and I'll set them):

```sql
update et_machines set model_number = 'A26A', manufacturer = 'Shanklin'
where name = 'Shanklin L Bar Sealer';
```

---

## File map

```
src/
  App.js                      view routing: home → picker → chat | repair | manual
  components/
    Home.js                   three choice cards
    MachinePicker.js          searchable machine list (shared by all three flows)
    TroubleshootChat.js       AI chat (background job + polling), sources, images, lightbox
    RepairLog.js              problem/solution + photos + AI intake
    UploadManual.js           PDF dropzone + live processing progress
    Toast.js, ErrorBoundary.js
  lib/
    supabase.js               client + machine/photo/log/job/manual helpers
    icons.js                  inline SVG icons
netlify/functions/
  package.json                functions-only deps (supabase + mupdf)
  _shared.js                  service client + Claude helper
  troubleshoot-background.js  logs (prioritized) + manuals + web → writes job result
  repair-intake.js            up to 3 short follow-up questions
  manual-process-background.js  renders + reads PDF pages in chunks (mupdf, WASM)
scripts/
  ingest-manual.js            optional CLI bulk loader (poppler)
```
