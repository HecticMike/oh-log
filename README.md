# PsA Logbook

PsA Logbook is a mobile-first PWA for psoriatic arthritis tracking. It keeps every entry local-first with fast logging, filters, and optional Google Drive backup/restore that writes to a visible `PsA-Logbook` folder plus a `psa-logbook-data.json` file. No backend is required, and tokens stay in memory only.

## Lookup lists

Dropdown options for regions, joints, symptoms, triggers, actions, and timeframes are maintained inside `src/lib/lookups.ts`. Edit that file to change labels or add new entries (stable keys are essential so saved records keep matching). Each list includes an `OTHER_KEY` entry to surface a free-text box when “Other” is chosen.

## Local development

1. `npm install`
2. `npm run dev`
   - Starts Vite on `http://localhost:5173` (or the host/port you pass). Kill it once you see the server logs.
3. `npm run typecheck`
4. `npm run build`

The app loads the Google Identity Services script (`https://accounts.google.com/gsi/client`) so Drive controls appear once you supply a real client ID (see below).

## Google Drive backup setup

1. In Google Cloud Console:
   - Create a project or reuse one.
   - Enable the Google Drive API.
   - Configure the OAuth consent screen for external/first-party users.
  - Create an **OAuth client ID → Web application**, then add authorized JS origins for:
    - `http://localhost:5173`
    - `https://<your-github-username>.github.io`
  - If the consent screen is in Testing, add your account email under **Test users** so you can authorize the Drive scopes.
2. Copy the client ID string and paste it into `src/config.ts` (`GOOGLE_CLIENT_ID`).
3. Reload the app. The Drive controls stay disabled until the client ID is set.

Drive backups work with scope `https://www.googleapis.com/auth/drive.file`, the folder `PsA-Logbook`, and the file `psa-logbook-data.json`. Tokens are kept only in memory (module state), and imports merge events by `id` choosing the record with the newest `updatedAt`.

## GitHub Pages deployment

  - Repository name: `psa-logbook` (see `vite.config.ts` `base` and `.github/workflows/deploy.yml`).
- Vite calculates `pagesBase = process.env.VITE_BASE ?? '/psa-tracker/'`. To change the base path (e.g., if you rename the repository), rebuild with `VITE_BASE=/your-new-repo/` so assets load from the right folder.
  - Push to `main`; the workflow runs `npm ci`, `npm run build` (with `VITE_BASE=/psa-logbook/`), and uses `peaceiris/actions-gh-pages` to publish `dist/` into the `gh-pages` branch.
  - In GitHub repo **Settings > Pages**, confirm the source is `gh-pages` branch with the root directory, and that GitHub Actions is enabled to deploy. The live URL will be `https://<your-github-username>.github.io/psa-logbook/`.

## PWA & iPhone experience

- Open the site in Safari, tap the **Share** button, then **Add to Home Screen**. The viewport is optimized for mobile and caches assets via a service worker (`vite-plugin-pwa`).
- The manifest (`PsA Logbook`) and icons (`public/icon-192.png`, `public/icon-512.png`) are configured for install prompts.

## Backup & restore notes

- **Local-first:** logging, filters, and recap are usable offline. Drive is optional and disabled until you configure Google.
- **Backup flow:** `Connect Google Drive` prompts for consent, then `Backup now` exports all events to the Drive file via a multipart PATCH request. `Restore from Drive` downloads that JSON and merges it by `id`, keeping whichever record has the newest `updatedAt`. The timeframe selector uses approximate days (year = 365, six months = 183, month = 30, week = 7) when slicing the dataset before export.
- **JSON export/import:** Use the `Export JSON` button to download a copy. Use the `Import JSON` input to merge a saved file by the same rules.
- **CSV export:** `Export CSV` downloads deterministic rows that include region/joint keys, symptom/trigger/action keys + custom text, and the `side` value. The file appears as `psa-logbook-events.csv`.
- **Drive visibility:** The folder `PsA-Logbook` and file `psa-logbook-data.json` remain visible within your Google Drive. There is no hidden storage. Imports/restore merges follow the same "latest updatedAt wins" rule.
- **Side selection:** The log form’s Left/Right tickboxes map to `left`, `right`, `both`, or `''` (none). This value is stored with each event and is exported alongside the rest of the metadata.

## Testing / smoke checks

- `npm install`
  ```
  up to date, audited 385 packages in 3s

  107 packages are looking for funding
    run `npm fund` for details

  found 0 vulnerabilities
  ```
- `npm run typecheck`
  ```
  > psa-logbook@0.0.0 typecheck
  > tsc --noEmit
  ```
- `npm run build`
  ```
  > psa-logbook@0.0.0 build
  > tsc && vite build

  vite v7.3.1 building client environment for production...
  ✓ 58 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/registerSW.js              0.16 kB
  dist/manifest.webmanifest       0.32 kB
  dist/index.html                 0.92 kB │ gzip:  0.49 kB
  dist/assets/index-Bp3-CLrW.css  3.53 kB │ gzip:  1.31 kB
  dist/assets/index-1Kk36X3D.js   311.57 kB │ gzip: 99.68 kB
  ✓ built in 2.22s

  PWA v1.2.0
  mode      generateSW
  precache  10 entries (316.06 KiB)
  files generated
    dist/sw.js
    dist/workbox-8c29f6e4.js
  ```
- `npm run dev -- --host 0.0.0.0 --port 4173`
  ```
  command timed out after 14021 milliseconds
  ```
  (Started Vite dev server, confirmed it booted, then cancelled after a brief smoke check.)
