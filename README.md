# Our Health

Our Health is a client-only, PWA-friendly web app for household illness tracking. All personal data lives in Google Drive files selected via Google Picker. The repository ships only with templates (no real household data).

## MVP Features
- Household profiles from `household.json` (4 members with name + accent color)
- Per-person illness episodes (category, symptoms, severity, notes)
- Per-episode temperature log with chart
- Per-episode medication log with Drive-backed catalog (type-ahead + recent/favorites)
- Drive access limited to user-selected files (`drive.file` scope)
- Optimistic merge on save to handle edits from multiple devices
- Setup Wizard for two-phone/shared file onboarding

## Data Files
The app expects two JSON files in Google Drive:
- `household.json`
- `our-health-log.json`

Templates are provided in `data/templates/`:
- `data/templates/household.template.json`
- `data/templates/our-health-log.template.json`

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure Google APIs:
   - Create an OAuth client ID (Web) in Google Cloud Console.
   - Add your GitHub Pages origin (for example, `https://YOUR_USER.github.io`) and local dev origin (`http://localhost:5173`) to the authorized JavaScript origins.
   - Enable the Google Drive API for the project.
   - Create an API key (required for Google Picker).
3. Copy `.env.example` to `.env.local` and fill in:
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_GOOGLE_API_KEY`
   - `VITE_GOOGLE_APP_ID` (project number; required for folder creation)

No secrets are committed to this repository. `.env.local` is ignored.

### Env vars
- `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, and optional `VITE_GOOGLE_APP_ID` are consumed by `src/config.ts` via `import.meta.env`.
- For GitHub Pages the workflow injects `VITE_BASE=/‌<repo>/` so the app and manifest respect the repo-specific base path.

## Run Locally
```bash
npm run dev
```

## Build
```bash
npm run lint
npm run typecheck
npm run build
```

## Using the App
1. Open the app and go to Settings.
2. Use the Setup Wizard:
   - Step 1: Sign in with Google.
   - Step 2: Create new shared files (pick a folder) or select existing `household.json` and `our-health-log.json`.
   - If the folder picker does not show your My Drive folders (e.g., only Shared drives appear), use the “Create files in My Drive (no folder selection)” button, then move the created files into the shared folder afterward; the file IDs stay the same.
3. Add episodes, temperature entries, and medications. Changes save directly to Drive.
4. For recurring antibiotics, open a member's **Logs -> Medication** section and create an antibiotic course (every N hours for D days), then export reminders as `.ics`.

Autosave is immediate: each create/edit/delete writes to Drive while online. No manual save step is required.

## Antibiotic reminders on iPhone
1. Create an antibiotic course in the member Medication section.
2. Tap `Export reminders (.ics)`.
3. Open the downloaded `.ics` file on each iPhone and add it to Calendar.
4. Events include reminders at dose time and 10 minutes before.

## Merge Behavior
On save, the app writes with `If-Match` (ETag). If another device has updated the file, the app:
1. Loads the latest file.
2. Merges by ID (union for episodes, temps, meds, and medCatalog).
3. Retries the save once.

## GitHub Pages checklist
The GitHub Actions workflow in `.github/workflows/deploy.yml` builds and deploys to `./dist`. The workflow injects `VITE_BASE=/<repository-name>/` so the app and manifest honor the repo-specific base path.

1. Enable Pages in the repo settings and select “GitHub Actions” as the source.
2. Add the secrets `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, and (optional) `VITE_GOOGLE_APP_ID`.
3. In Settings → Pages, confirm “Source: GitHub Actions.”
4. Push to `main` (or trigger the workflow manually) so the **Deploy Our Health** workflow runs and publishes `https://<owner>.github.io/<repo>/`.
5. Use the diagnostics panel in Settings to verify the signed-in origin, client ID/API key presence and the masked API key suffix.
   The panel also shows the App ID; set `VITE_GOOGLE_APP_ID` to the Google Cloud project number to enable folder creation.

## If you see “Developer key invalid”
If Picker reports “Developer key invalid,” the diagnostics panel and the folder notice will remind you what to try next:

1. Allow `https://<owner>.github.io/<repo>/` (and any local dev origin) in the API key’s referrer restrictions, or temporarily remove restrictions while you verify the flow.
2. Enable the Google Picker API for the same Google project before tightening restrictions.
3. Clear the PWA/service worker cache (DevTools → Application → Clear storage) and reload the page.

## Google Cloud checklist
1. Configure a Web OAuth client ID with authorized JavaScript origins that include both `https://<owner>.github.io/<repo>/` and `http://localhost:5173`.
2. Add your Google account as a test user if the project is not public/verified.
3. Restrict the API key (used for Picker) to the same origins and enable the Google Drive API.
4. Store the OAuth client ID and API key in `.env.local` (or GitHub secrets) under `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY`.
## Notes
- The repository only contains placeholder data. Replace with your own copies stored in Drive.
- The app is client-only; no server storage is used.
