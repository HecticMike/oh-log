
import { useCallback, useEffect, useMemo, useState } from 'react';
import './index.css';
import {
  createId,
  emptyHousehold,
  emptyLog,
  mergeById,
  nowISO,
  type Episode,
  type Household,
  type LogData,
  type MedCatalogItem,
  type MedEntry,
  type Member,
  type TempEntry
} from './lib/models';
import {
  connectDrive,
  createDriveJsonFile,
  getDriveUser,
  isDriveConfigured,
  pickDriveFile,
  pickDriveFolder,
  type PickedDriveFile
} from './lib/drive';
import {
  getStoredHouseholdFileId,
  getStoredLogFileId,
  loadHouseholdFromDrive,
  loadLogFromDrive,
  saveHouseholdToDrive,
  saveLogToDrive,
  setStoredHouseholdFileId,
  setStoredLogFileId,
  type DriveFileState
} from './lib/storage';
import {
  GOOGLE_API_KEY_DEFINED,
  GOOGLE_API_KEY_MASKED,
  GOOGLE_APP_ID,
  GOOGLE_APP_ID_DEFINED,
  GOOGLE_CLIENT_ID_DEFINED
} from './config';

const formatDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '');
const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '');

const toLocalDateInput = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toISOFromDate = (value: string) => {
  if (!value) return nowISO();
  const date = new Date(`${value}T00:00:00`);
  return date.toISOString();
};

const toLocalTimeInput = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const toISOFromTime = (value: string) => {
  const now = new Date();
  if (!value) return now.toISOString();
  const [hours, minutes] = value.split(':').map((item) => Number(item));
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours || 0, minutes || 0, 0);
  return date.toISOString();
};

const routeFromHash = () => {
  const hash = window.location.hash.replace('#', '');
  if (!hash || hash === 'home') return { page: 'home' } as const;
  if (hash.startsWith('person=')) return { page: 'person', memberId: hash.replace('person=', '') } as const;
  if (hash.startsWith('episode=')) return { page: 'episode', episodeId: hash.replace('episode=', '') } as const;
  if (hash === 'settings') return { page: 'settings' } as const;
  return { page: 'home' } as const;
};

type Route = ReturnType<typeof routeFromHash>;

type DriveState = {
  connected: boolean;
  busy: boolean;
  message: string | null;
};

const TemperatureChart = ({ entries }: { entries: TempEntry[] }) => {
  if (entries.length === 0) {
    return <div className="chart-empty">No temperature entries yet.</div>;
  }
  const width = 520;
  const height = 180;
  const padding = 28;
  const values = entries.map((entry) => entry.tempC);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = min === max ? 1 : max - min;
  const xStep = entries.length > 1 ? (width - padding * 2) / (entries.length - 1) : 0;
  const points = entries.map((entry, index) => {
    const x = padding + index * xStep;
    const y = padding + ((max - entry.tempC) / span) * (height - padding * 2);
    return { x, y, entry };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  return (
    <svg className="temp-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Temperature chart">
      <defs>
        <linearGradient id="tempLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7C9F91" />
          <stop offset="100%" stopColor="#D37B52" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={width} height={height} rx="16" className="chart-bg" />
      <path d={linePath} fill="none" stroke="url(#tempLine)" strokeWidth="3" />
      {points.map((point) => (
        <circle key={point.entry.id} cx={point.x} cy={point.y} r="5" className="chart-point" />
      ))}
      <text x={padding} y={padding - 8} className="chart-label">
        {min.toFixed(1)} C
      </text>
      <text x={padding} y={height - 6} className="chart-label">
        {max.toFixed(1)} C
      </text>
    </svg>
  );
};

type EpisodeViewProps = {
  episode: Episode;
  member?: Member;
  temps: TempEntry[];
  meds: MedEntry[];
  catalog: MedCatalogItem[];
  onUpdateEpisode: (episodeId: string, updates: Partial<Episode>) => Promise<void>;
  onAddTemp: (episodeId: string, tempC: number, atISO: string, note: string) => Promise<void>;
  onAddMed: (episodeId: string, catalogItem: MedCatalogItem, doseText: string, atISO: string, route: string, note: string) => Promise<void>;
  onUpsertCatalog: (name: string) => Promise<MedCatalogItem | null>;
  onToggleFavorite: (itemId: string) => Promise<void>;
  onNavigate: (hash: string) => void;
};

const EpisodeView = ({
  episode,
  member,
  temps,
  meds,
  catalog,
  onUpdateEpisode,
  onAddTemp,
  onAddMed,
  onUpsertCatalog,
  onToggleFavorite,
  onNavigate
}: EpisodeViewProps) => {
  const episodeTemps = useMemo(
    () => temps.slice().sort((a, b) => new Date(a.atISO).getTime() - new Date(b.atISO).getTime()),
    [temps]
  );
  const episodeMeds = useMemo(
    () => meds.slice().sort((a, b) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime()),
    [meds]
  );

  const [category, setCategory] = useState(episode.category);
  const [symptomsText, setSymptomsText] = useState(episode.symptoms.join(', '));
  const [severity, setSeverity] = useState(String(episode.severity));
  const [notes, setNotes] = useState(episode.notes);
  const [startDate, setStartDate] = useState(toLocalDateInput(episode.startedAtISO));
  const [tempValue, setTempValue] = useState('');
  const [tempTime, setTempTime] = useState(toLocalTimeInput(nowISO()));
  const [tempNote, setTempNote] = useState('');
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medRoute, setMedRoute] = useState('');
  const [medTime, setMedTime] = useState(toLocalTimeInput(nowISO()));
  const [medNote, setMedNote] = useState('');
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);

  useEffect(() => {
    setCategory(episode.category);
    setSymptomsText(episode.symptoms.join(', '));
    setSeverity(String(episode.severity));
    setNotes(episode.notes);
    setStartDate(toLocalDateInput(episode.startedAtISO));
  }, [episode.category, episode.symptoms, episode.severity, episode.notes, episode.startedAtISO]);

  const recentCatalog = useMemo(() => {
    const seen = new Set<string>();
    const recent = episodeMeds
      .map((entry) => catalog.find((item) => item.id === entry.medId))
      .filter((item): item is MedCatalogItem => Boolean(item))
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    return recent.slice(0, 4);
  }, [episodeMeds, catalog]);

  const favoriteCatalog = useMemo(
    () => catalog.filter((item) => item.isFavorite).slice(0, 6),
    [catalog]
  );

  const suggestions = useMemo(() => {
    const query = medName.trim().toLowerCase();
    if (!query) return catalog.slice(0, 6);
    return catalog.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 6);
  }, [medName, catalog]);

  const handleEpisodeSave = async () => {
    await onUpdateEpisode(episode.id, {
      category: category.trim() || 'Illness',
      symptoms: symptomsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      severity: Math.min(5, Math.max(1, Number(severity) || 3)),
      notes,
      startedAtISO: toISOFromDate(startDate)
    });
  };

  const handleTempSubmit = async () => {
    const parsed = Number(tempValue);
    if (!Number.isFinite(parsed)) return;
    const iso = toISOFromTime(tempTime);
    await onAddTemp(episode.id, parsed, iso, tempNote.trim());
    setTempValue('');
    setTempNote('');
  };

  const handleMedSubmit = async () => {
    const iso = toISOFromTime(medTime);
    let catalogItem: MedCatalogItem | null = null;
    if (selectedMedId) {
      catalogItem = catalog.find((item) => item.id === selectedMedId) ?? null;
    }
    if (!catalogItem) {
      catalogItem = await onUpsertCatalog(medName);
    }
    if (!catalogItem) return;
    await onAddMed(episode.id, catalogItem, medDose.trim(), iso, medRoute.trim(), medNote.trim());
    setMedName('');
    setMedDose('');
    setMedRoute('');
    setMedNote('');
    setSelectedMedId(null);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{member?.name ?? 'Episode'}</h2>
          <p>
            Started {formatDate(episode.startedAtISO)}
            {episode.endedAtISO ? ` · Closed ${formatDate(episode.endedAtISO)}` : ' · Ongoing'}
          </p>
        </div>
        <div className="panel-actions">
          <button type="button" className="ghost" onClick={() => onNavigate(`#person=${episode.memberId}`)}>
            Back
          </button>
          <button
            type="button"
            className="primary"
            onClick={() =>
              onUpdateEpisode(episode.id, {
                endedAtISO: episode.endedAtISO ? null : nowISO()
              })
            }
          >
            {episode.endedAtISO ? 'Reopen episode' : 'Close episode'}
          </button>
        </div>
      </div>

      <div className="section">
        <h3>Episode details</h3>
        <div className="form-grid">
          <label>
            Category
            <input value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
          <label>
            Severity (1-5)
            <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Symptoms
            <input
              value={symptomsText}
              onChange={(event) => setSymptomsText(event.target.value)}
              placeholder="Fever, cough"
            />
          </label>
          <label>
            Start date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="full">
            Notes
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        <button type="button" className="ghost" onClick={handleEpisodeSave}>
          Save details
        </button>
      </div>

      <div className="section">
        <div className="section-header">
          <h3>Temperature log</h3>
          <p>Track fevers and recovery.</p>
        </div>
        <div className="form-grid">
          <label>
            Temp (C)
            <input
              type="number"
              step="0.1"
              value={tempValue}
              onChange={(event) => setTempValue(event.target.value)}
              placeholder="37.5"
            />
          </label>
          <label>
            Time
            <input type="time" value={tempTime} onChange={(event) => setTempTime(event.target.value)} />
          </label>
          <label>
            Note
            <input value={tempNote} onChange={(event) => setTempNote(event.target.value)} placeholder="Optional" />
          </label>
          <button type="button" className="primary" onClick={handleTempSubmit}>
            Add temperature
          </button>
        </div>
        <TemperatureChart entries={episodeTemps} />
        <div className="log-list">
          {episodeTemps.map((entry) => (
            <div key={entry.id} className="log-row">
              <div>{formatDateTime(entry.atISO)}</div>
              <div>
                {entry.tempC.toFixed(1)} C {entry.note ? `· ${entry.note}` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h3>Medication log</h3>
          <p>Use type-ahead or pick from favorites and recent meds.</p>
        </div>
        <div className="chip-row">
          {favoriteCatalog.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip ${selectedMedId === item.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedMedId(item.id);
                setMedName(item.name);
              }}
            >
              {item.name}
            </button>
          ))}
          {favoriteCatalog.length === 0 && <span className="chip hint">No favorites yet.</span>}
        </div>
        <div className="chip-row">
          {recentCatalog.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip ${selectedMedId === item.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedMedId(item.id);
                setMedName(item.name);
              }}
            >
              {item.name}
            </button>
          ))}
          {recentCatalog.length === 0 && <span className="chip hint">No recent meds yet.</span>}
        </div>
        <div className="form-grid">
          <label>
            Medication
            <input
              value={medName}
              onChange={(event) => {
                setMedName(event.target.value);
                setSelectedMedId(null);
              }}
              placeholder="Acetaminophen"
            />
          </label>
          <label>
            Dose
            <input value={medDose} onChange={(event) => setMedDose(event.target.value)} placeholder="500 mg" />
          </label>
          <label>
            Route
            <input value={medRoute} onChange={(event) => setMedRoute(event.target.value)} placeholder="Oral" />
          </label>
          <label>
            Time
            <input type="time" value={medTime} onChange={(event) => setMedTime(event.target.value)} />
          </label>
          <label className="full">
            Note
            <input value={medNote} onChange={(event) => setMedNote(event.target.value)} placeholder="Optional" />
          </label>
          <button type="button" className="primary" onClick={handleMedSubmit}>
            Add medication
          </button>
          </div>
        <div className="suggestions">
          {suggestions.map((item) => (
            <div key={item.id} className="suggestion-row">
              <button
                type="button"
                className={`chip ${selectedMedId === item.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedMedId(item.id);
                  setMedName(item.name);
                }}
              >
                {item.name}
              </button>
              <button type="button" className="ghost" onClick={() => onToggleFavorite(item.id)}>
                {item.isFavorite ? 'Unfavorite' : 'Favorite'}
              </button>
            </div>
          ))}
        </div>
        <div className="log-list">
          {episodeMeds.map((entry) => (
            <div key={entry.id} className="log-row">
              <div>{formatDateTime(entry.atISO)}</div>
              <div>
                {entry.medName} {entry.doseText && `· ${entry.doseText}`} {entry.route && `· ${entry.route}`} {entry.note && `· ${entry.note}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
type DiagnosticsInfo = {
  origin: string;
  clientIdConfigured: boolean;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  appId: string;
  appIdConfigured: boolean;
};

type SettingsViewProps = {
  members: Member[];
  householdFileName?: string;
  logFileName?: string;
  drive: DriveState;
  lastSyncISO?: string | null;
  driveAccountEmail?: string | null;
  folderNotice?: string | null;
  diagnostics: DiagnosticsInfo;
  onConnect: () => Promise<void>;
  onPickFile: (kind: 'household' | 'log') => Promise<void>;
  onPickFolderAndCreate: () => Promise<void>;
  onSaveMembers: (nextMembers: Member[]) => Promise<void>;
  onNavigate: (hash: string) => void;
  hasFiles: boolean;
};

const SettingsView = ({
  members,
  householdFileName,
  logFileName,
  drive,
  lastSyncISO,
  driveAccountEmail,
  folderNotice,
  diagnostics,
  onConnect,
  onPickFile,
  onPickFolderAndCreate,
  onSaveMembers,
  onNavigate,
  hasFiles
}: SettingsViewProps) => {
  const [draft, setDraft] = useState<Member[]>(members);
  const [setupStep, setSetupStep] = useState<'signin' | 'choose'>('signin');

  useEffect(() => {
    setDraft(members);
  }, [members]);

  useEffect(() => {
    if (drive.connected) {
      setSetupStep('choose');
    } else {
      setSetupStep('signin');
    }
  }, [drive.connected]);

  const updateDraft = (index: number, changes: Partial<Member>) => {
    setDraft((prev) =>
      prev.map((member, memberIndex) => (memberIndex === index ? { ...member, ...changes } : member))
    );
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Settings</h2>
          <p>Connect Google Drive and update household details.</p>
        </div>
        <button type="button" className="ghost" onClick={() => onNavigate('#home')}>
          Back
        </button>
      </div>

      {!hasFiles && (
        <div className="wizard">
          <h3>Setup Wizard</h3>
          <p>Use the same Drive files on multiple phones to keep data in sync.</p>
      <div className="wizard-step">
        <div className="step-label">Step 1</div>
        <div>
          <strong>Sign in with Google</strong>
          <p>Authorize Drive access (drive.file scope only).</p>
          <p className="helper-text">
            Signed in as {driveAccountEmail ?? 'your Google account'}.
          </p>
        </div>
        <button type="button" className="primary" onClick={onConnect} disabled={drive.busy || !isDriveConfigured()}>
          {drive.connected ? 'Signed in' : 'Sign in with Google'}
        </button>
      </div>
      <div className={`wizard-step ${setupStep === 'choose' ? '' : 'disabled'}`}>
            <div className="step-label">Step 2</div>
            <div>
              <strong>Choose data files</strong>
              <p>Create new shared files or pick existing ones.</p>
        </div>
          <div className="wizard-actions">
            <button
              type="button"
              onClick={onPickFolderAndCreate}
              disabled={!drive.connected || drive.busy || !diagnostics.appIdConfigured}
            >
              Create new shared data files
            </button>
          <button type="button" onClick={() => onPickFile('household')} disabled={!drive.connected || drive.busy}>
            Pick existing household.json
          </button>
          <button type="button" onClick={() => onPickFile('log')} disabled={!drive.connected || drive.busy}>
            Pick existing our-health-log.json
          </button>
        </div>
        {folderNotice && <p className="message small">{folderNotice}</p>}
      </div>
          {!isDriveConfigured() && (
            <p className="message">Configure VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY in .env.local first.</p>
          )}
            {drive.message && <p className="message">{drive.message}</p>}
            {!diagnostics.appIdConfigured && (
              <p className="message small">
                Set `VITE_GOOGLE_APP_ID` to your Google Cloud project number (Console → Project info) before creating shared files.
              </p>
            )}
        </div>
      )}

      <div className="settings-grid">
        <div className="settings-card">
          <h3>Drive Status</h3>
          <p>Drive file access is limited to selected files.</p>
          <div className="status-row">
            <span>Account</span>
            <strong>{drive.connected ? 'Connected (drive.file scope)' : 'Not connected'}</strong>
          </div>
          <div className="status-row">
            <span>Household file</span>
            <strong>{householdFileName ?? 'Not selected'}</strong>
          </div>
          <div className="status-row">
            <span>Log file</span>
            <strong>{logFileName ?? 'Not selected'}</strong>
          </div>
          <div className="status-row">
            <span>Last sync</span>
            <strong>{lastSyncISO ? formatDateTime(lastSyncISO) : 'Not yet'}</strong>
          </div>
          <button type="button" className="primary" onClick={onConnect} disabled={drive.busy}>
            {drive.connected ? 'Reconnect Drive' : 'Connect Drive'}
          </button>
          <button type="button" onClick={() => onPickFile('household')} disabled={drive.busy || !drive.connected}>
            Re-pick household.json
          </button>
          <button type="button" onClick={() => onPickFile('log')} disabled={drive.busy || !drive.connected}>
            Re-pick our-health-log.json
          </button>
        </div>
        <div className="settings-card">
          <h3>Drive diagnostics</h3>
          <p>Quick checks for your Google credentials.</p>
          <div className="status-row">
            <span>Signed-in origin</span>
            <strong>{diagnostics.origin}</strong>
          </div>
          <div className="status-row">
            <span>Client ID present</span>
            <strong>{diagnostics.clientIdConfigured ? 'Yes' : 'No'}</strong>
          </div>
          <div className="status-row">
            <span>API key present</span>
            <strong>{diagnostics.apiKeyConfigured ? 'Yes' : 'No'}</strong>
          </div>
          <div className="status-row">
            <span>API key masked</span>
            <strong>{diagnostics.apiKeyMasked}</strong>
          </div>
          <div className="status-row">
            <span>App ID</span>
            <strong>{diagnostics.appId || 'Not set'}</strong>
          </div>
        </div>
        <div className="settings-card">
          <h3>Household</h3>
          <p>Update member names and accent colors.</p>
          <div className="form-grid">
            {draft.map((member, index) => (
              <div key={member.id} className="member-row">
                <input
                  value={member.name}
                  onChange={(event) => updateDraft(index, { name: event.target.value })}
                />
                <input
                  type="color"
                  value={member.accentColor}
                  onChange={(event) => updateDraft(index, { accentColor: event.target.value })}
                />
              </div>
            ))}
          </div>
          <button type="button" className="primary" onClick={() => onSaveMembers(draft)}>
            Save household
          </button>
        </div>
      </div>
    </section>
  );
};

export default function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash());
  const [drive, setDrive] = useState<DriveState>({ connected: false, busy: false, message: null });
  const [householdState, setHouseholdState] = useState<DriveFileState<Household> | null>(null);
  const [logState, setLogState] = useState<DriveFileState<LogData> | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [lastSyncISO, setLastSyncISO] = useState<string | null>(null);
  const [driveAccountEmail, setDriveAccountEmail] = useState<string | null>(null);
  const [folderNotice, setFolderNotice] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const diagnostics = useMemo(
    () => ({
      origin,
      clientIdConfigured: GOOGLE_CLIENT_ID_DEFINED,
      apiKeyConfigured: GOOGLE_API_KEY_DEFINED,
      apiKeyMasked: GOOGLE_API_KEY_MASKED,
      appId: GOOGLE_APP_ID || '',
      appIdConfigured: GOOGLE_APP_ID_DEFINED
    }),
    []
  );
  const developerKeyChecklist =
    'Developer key invalid. Ensure the API key allows https://<owner>.github.io/<repo>/, the Google Picker API is enabled before applying restrictions, and clear the PWA/service worker cache before rerunning.';
  const blockedAccountChecklist =
    'Cannot access your Google account. Check your OAuth JavaScript origin (https://<owner>.github.io), add this account as a test user, and allow cross-site tracking/cookies in Safari before trying again.';
  const annotateDeveloperKeyError = (err: unknown): boolean => {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    if (lower.includes('developer key') && lower.includes('invalid')) {
      setFolderNotice(developerKeyChecklist);
      return true;
    }
    if (lower.includes('cannot access') && lower.includes('google account')) {
      setFolderNotice(blockedAccountChecklist);
      return true;
    }
    return false;
  };

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) {
      window.location.hash = '#home';
    }
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setBusy = (busy: boolean) => setDrive((prev) => ({ ...prev, busy }));
  const setDriveMessage = (message: string | null) => setDrive((prev) => ({ ...prev, message }));

  const loadStoredFiles = useCallback(async () => {
    const householdFileId = getStoredHouseholdFileId();
    const logFileId = getStoredLogFileId();
    if (householdFileId) {
      const household = await loadHouseholdFromDrive(householdFileId);
      setHouseholdState(household);
    }
    if (logFileId) {
      const log = await loadLogFromDrive(logFileId);
      setLogState(log);
    }
    if (householdFileId || logFileId) {
      setLastSyncISO(nowISO());
    }
  }, []);

  const refreshDriveAccount = useCallback(async () => {
    try {
      const user = await getDriveUser();
      setDriveAccountEmail(user.emailAddress ?? null);
    } catch (err) {
      console.warn('Could not fetch Drive account info', err);
    }
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setDriveMessage(null);
    try {
      await connectDrive();
      setDrive((prev) => ({ ...prev, connected: true }));
      await loadStoredFiles();
      await refreshDriveAccount();
    } catch (err) {
      setDriveMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePickFile = async (kind: 'household' | 'log') => {
    setBusy(true);
    setDriveMessage(null);
    setFolderNotice(null);
    try {
      if (!drive.connected) {
        await connectDrive();
        setDrive((prev) => ({ ...prev, connected: true }));
      }
      const picked: PickedDriveFile = await pickDriveFile(
        kind === 'household' ? 'Select household.json' : 'Select our-health-log.json'
      );
      if (kind === 'household') {
        setStoredHouseholdFileId(picked.id);
        const household = await loadHouseholdFromDrive(picked.id);
        setHouseholdState(household);
      } else {
        setStoredLogFileId(picked.id);
        const log = await loadLogFromDrive(picked.id);
        setLogState(log);
      }
      setLastSyncISO(nowISO());
    } catch (err) {
      setDriveMessage((err as Error).message);
      if (annotateDeveloperKeyError(err)) {
        return;
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePickFolderAndCreate = async () => {
    setBusy(true);
    setDriveMessage(null);
    setFolderNotice(null);
    if (!GOOGLE_API_KEY_DEFINED) {
      setFolderNotice('Missing VITE_GOOGLE_API_KEY in build - check GitHub Actions secrets.');
      setBusy(false);
      return;
    }
    try {
      if (!drive.connected) {
        await connectDrive();
        setDrive((prev) => ({ ...prev, connected: true }));
      }
      const folder = await pickDriveFolder('Choose a folder for Our Health files');
      const householdTemplate = emptyHousehold();
      const logTemplate = emptyLog();
      const householdResult = await createDriveJsonFile(folder.id, 'household.json', householdTemplate);
      const logResult = await createDriveJsonFile(folder.id, 'our-health-log.json', logTemplate);
      setStoredHouseholdFileId(householdResult.meta.id);
      setStoredLogFileId(logResult.meta.id);
      setHouseholdState({
        fileId: householdResult.meta.id,
        name: householdResult.meta.name,
        etag: householdResult.meta.etag,
        modifiedTime: householdResult.meta.modifiedTime,
        data: householdTemplate
      });
      setLogState({
        fileId: logResult.meta.id,
        name: logResult.meta.name,
        etag: logResult.meta.etag,
        modifiedTime: logResult.meta.modifiedTime,
        data: logTemplate
      });
        setLastSyncISO(nowISO());
      await refreshDriveAccount();
    } catch (err) {
      setDriveMessage((err as Error).message);
      if (annotateDeveloperKeyError(err)) {
        return;
      }
      if ((err as Error).message.includes('No folder selected') || (err as Error).message.includes('Picker closed')) {
        setFolderNotice('If you created the folder in another Google account, switch accounts and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const updateHousehold = async (updater: (current: Household) => Household) => {
    if (!householdState) return;
    setBusy(true);
    setLocalMessage(null);
    try {
      const next = updater({ ...householdState.data, lastUpdatedAtISO: nowISO() });
      const result = await saveHouseholdToDrive(householdState, next);
      setHouseholdState(result.state);
      setLastSyncISO(nowISO());
      if (result.merged) {
        setLocalMessage('Household updated with a Drive merge. Review any changes.');
      }
    } catch (err) {
      setLocalMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateLog = async (updater: (current: LogData) => LogData) => {
    if (!logState) return;
    setBusy(true);
    setLocalMessage(null);
    try {
      const next = updater({ ...logState.data, lastUpdatedAtISO: nowISO() });
      const result = await saveLogToDrive(logState, next);
      setLogState(result.state);
      setLastSyncISO(nowISO());
      if (result.merged) {
        setLocalMessage('Log updated with a Drive merge. Review any changes.');
      }
    } catch (err) {
      setLocalMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const members = householdState?.data.members ?? emptyHousehold().members;
  const episodes = logState?.data.episodes ?? emptyLog().episodes;
  const temps = logState?.data.temps ?? emptyLog().temps;
  const meds = logState?.data.meds ?? emptyLog().meds;
  const catalog = logState?.data.medCatalog ?? emptyLog().medCatalog;

  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const navigate = (hash: string) => {
    window.location.hash = hash;
  };

  const createEpisode = async (member: Member) => {
    if (!logState) return;
    const now = nowISO();
    const episode: Episode = {
      id: createId(),
      memberId: member.id,
      category: 'Illness',
      symptoms: [],
      severity: 3,
      notes: '',
      startedAtISO: now,
      endedAtISO: null,
      createdAtISO: now,
      updatedAtISO: now
    };
    await updateLog((current) => ({
      ...current,
      episodes: mergeById([episode], current.episodes)
    }));
    navigate(`#episode=${episode.id}`);
  };

  const updateEpisode = async (episodeId: string, updates: Partial<Episode>) => {
    if (!logState) return;
    const now = nowISO();
    await updateLog((current) => {
      const nextEpisodes = current.episodes.map((episode) =>
        episode.id === episodeId
          ? { ...episode, ...updates, updatedAtISO: now }
          : episode
      );
      return { ...current, episodes: nextEpisodes };
    });
  };

  const addTempEntry = async (episodeId: string, tempC: number, atISO: string, note: string) => {
    if (!logState) return;
    const now = nowISO();
    const entry: TempEntry = {
      id: createId(),
      episodeId,
      atISO,
      tempC,
      note,
      createdAtISO: now,
      updatedAtISO: now
    };
    await updateLog((current) => ({
      ...current,
      temps: mergeById([entry], current.temps)
    }));
  };

  const addMedEntry = async (episodeId: string, catalogItem: MedCatalogItem, doseText: string, atISO: string, route: string, note: string) => {
    if (!logState) return;
    const now = nowISO();
    const entry: MedEntry = {
      id: createId(),
      episodeId,
      medId: catalogItem.id,
      medName: catalogItem.name,
      doseText,
      route: route || undefined,
      note,
      atISO,
      createdAtISO: now,
      updatedAtISO: now
    };
    await updateLog((current) => ({
      ...current,
      meds: mergeById([entry], current.meds)
    }));
  };

  const upsertCatalogItem = async (name: string): Promise<MedCatalogItem | null> => {
    if (!logState) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = catalog.find((item) => item.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const now = nowISO();
    const created: MedCatalogItem = {
      id: createId(),
      name: trimmed,
      isFavorite: false,
      createdAtISO: now,
      updatedAtISO: now
    };
    await updateLog((current) => ({
      ...current,
      medCatalog: mergeById([created], current.medCatalog)
    }));
    return created;
  };

  const toggleFavorite = async (itemId: string) => {
    if (!logState) return;
    const now = nowISO();
    await updateLog((current) => ({
      ...current,
      medCatalog: current.medCatalog.map((item) =>
        item.id === itemId ? { ...item, isFavorite: !item.isFavorite, updatedAtISO: now } : item
      )
    }));
  };

  const householdReady = Boolean(householdState);
  const logReady = Boolean(logState);
  const hasFiles = householdReady && logReady;

  const renderHome = () => (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>People</h2>
          <p>Pick a person to view illness episodes.</p>
        </div>
        <button type="button" className="ghost" onClick={() => navigate('#settings')}>
          Settings
        </button>
      </div>
      <div className="people-grid">
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            className="person-card"
            style={{ borderColor: member.accentColor }}
            onClick={() => navigate(`#person=${member.id}`)}
          >
            <span className="person-color" style={{ background: member.accentColor }} />
            <div>
              <div className="person-name">{member.name}</div>
              <div className="person-sub">Episodes: {episodes.filter((ep) => ep.memberId === member.id).length}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );

  const renderPerson = (memberId: string) => {
    const member = memberMap.get(memberId);
    if (!member) return <div className="panel">Person not found.</div>;
    const memberEpisodes = episodes
      .filter((episode) => episode.memberId === memberId)
      .sort((a, b) => {
        const aOpen = a.endedAtISO ? 1 : 0;
        const bOpen = b.endedAtISO ? 1 : 0;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return new Date(b.startedAtISO).getTime() - new Date(a.startedAtISO).getTime();
      });

    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{member.name}</h2>
            <p style={{ color: member.accentColor }}>Household member</p>
          </div>
          <div className="panel-actions">
            <button type="button" className="primary" onClick={() => createEpisode(member)}>
              Add episode
            </button>
            <button type="button" className="ghost" onClick={() => navigate('#home')}>
              Back
            </button>
          </div>
        </div>
        <div className="episode-list">
          {memberEpisodes.length === 0 && <p className="empty">No episodes yet.</p>}
          {memberEpisodes.map((episode) => (
            <button
              key={episode.id}
              type="button"
              className="episode-card"
              onClick={() => navigate(`#episode=${episode.id}`)}
            >
              <div>
                <div className="episode-title">{episode.category}</div>
                <div className="episode-sub">
                  Severity {episode.severity} · {episode.endedAtISO ? `Closed ${formatDate(episode.endedAtISO)}` : 'Ongoing'}
                </div>
              </div>
              <span className={`episode-pill ${episode.endedAtISO ? 'closed' : 'open'}`}>
                {episode.endedAtISO ? 'Closed' : 'Open'}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const renderEpisode = (episodeId: string) => {
    const episode = episodes.find((item) => item.id === episodeId);
    if (!episode) return <div className="panel">Episode not found.</div>;
    const member = memberMap.get(episode.memberId);
    return (
      <EpisodeView
        episode={episode}
        member={member}
        temps={temps.filter((temp) => temp.episodeId === episodeId)}
        meds={meds.filter((entry) => entry.episodeId === episodeId)}
        catalog={catalog}
        onUpdateEpisode={updateEpisode}
        onAddTemp={addTempEntry}
        onAddMed={addMedEntry}
        onUpsertCatalog={upsertCatalogItem}
        onToggleFavorite={toggleFavorite}
        onNavigate={navigate}
      />
    );
  };

  const handleSaveMembers = async (nextMembers: Member[]) => {
    await updateHousehold((current) => ({
      ...current,
      members: current.members.map((member, index) => ({
        ...member,
        name: nextMembers[index]?.name ?? member.name,
        accentColor: nextMembers[index]?.accentColor ?? member.accentColor,
        updatedAtISO: nowISO()
      }))
    }));
  };

  const renderSettings = () => (
      <SettingsView
        members={members}
        householdFileName={householdState?.name}
        logFileName={logState?.name}
        drive={drive}
        lastSyncISO={lastSyncISO}
        driveAccountEmail={driveAccountEmail}
        folderNotice={folderNotice}
        diagnostics={diagnostics}
        onConnect={handleConnect}
        onPickFile={handlePickFile}
        onPickFolderAndCreate={handlePickFolderAndCreate}
      onSaveMembers={handleSaveMembers}
      onNavigate={navigate}
      hasFiles={hasFiles}
    />
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="app-title">Our Health</div>
          <div className="app-sub">Household illness tracking with Drive-backed files.</div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="ghost" onClick={() => navigate('#home')}>
            Home
          </button>
          <button type="button" className="ghost" onClick={() => navigate('#settings')}>
            Settings
          </button>
        </div>
      </header>

      {!hasFiles && route.page !== 'settings' && (
        <section className="callout">
          <div>
            <h2>Complete Setup</h2>
            <p>Connect Drive and choose data files to start logging.</p>
          </div>
          <div className="callout-actions">
            <button type="button" className="primary" onClick={() => navigate('#settings')}>
              Open setup wizard
            </button>
          </div>
        </section>
      )}

      {route.page === 'home' && renderHome()}
      {route.page === 'person' && renderPerson(route.memberId)}
      {route.page === 'episode' && renderEpisode(route.episodeId)}
      {route.page === 'settings' && renderSettings()}

      {localMessage && <p className="message">{localMessage}</p>}
    </div>
  );
}
