import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent } from 'react';

import * as XLSX from 'xlsx';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import './index.css';

import {
  createId,
  emptyHousehold,
  emptyLog,
  ensureLogData,
  mergeById,
  nowISO,
  type Episode,
  type Household,
  type LogData,
  type MedCatalogItem,
  type MedCourse,
  type MedEntry,
  type Member,
  type SymptomEntry,
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

import { buildCourseIcs, buildCourseSchedule, formatRelativeTime } from './lib/medicationCourse';







const formatDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '');
const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '');
const formatTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
const formatPeopleCardDateTime = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `today ${timeLabel}`;
  const dateLabel = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit'
  });
  return `${dateLabel} ${timeLabel}`;
};
const isRecentlyCreated = (iso?: string | null, windowMs = 20_000) => {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= windowMs;
};
const sanitizeFilePart = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'member';

const toLocalDateKey = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseHexColor = (hex: string) => {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b] as const;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b] as const;
  }
  return [120, 120, 120] as const;
};

const toMemberTint = (hex: string, alpha = 0.16) => {
  const [r, g, b] = parseHexColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const toMemberInk = (hex: string) => {
  const [r, g, b] = parseHexColor(hex);
  const ink = (value: number) => Math.max(0, Math.min(255, Math.round(value * 0.8)));
  return `rgb(${ink(r)}, ${ink(g)}, ${ink(b)})`;
};

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

const toISOFromDateTime = (dateValue: string, timeValue: string) => {
  const now = new Date();
  const [year, month, day] = dateValue
    ? dateValue.split('-').map((item) => Number(item))
    : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  const [hours, minutes] = timeValue.split(':').map((item) => Number(item));
  const date = new Date(year, (month || now.getMonth() + 1) - 1, day || now.getDate(), hours || 0, minutes || 0, 0);
  return date.toISOString();
};

type MemberSection = 'medication' | 'temperature' | 'symptoms' | 'illness' | 'calendar' | 'more';

const parseMemberSection = (value: string | null): MemberSection | undefined =>
  value === 'medication' ||
  value === 'temperature' ||
  value === 'symptoms' ||
  value === 'illness' ||
  value === 'calendar' ||
  value === 'more'
    ? value
    : undefined;

const legacyTabToSection = (tab: string | null): MemberSection | undefined => {
  if (tab === 'logs') return 'medication';
  if (tab === 'calendar') return 'calendar';
  if (tab === 'illness') return 'illness';
  if (tab === 'insights') return 'more';
  return undefined;
};

const routeFromHashString = (rawHash: string) => {
  const hash = rawHash.replace('#', '');
  if (!hash || hash === 'home') return { page: 'home' } as const;
  if (hash === 'settings') return { page: 'settings' } as const;

  if (hash.startsWith('person=')) {
    const params = new URLSearchParams(hash);
    const memberId = params.get('person') ?? hash.replace('person=', '').split('&')[0];
    const section = parseMemberSection(params.get('section')) ?? legacyTabToSection(params.get('tab')) ?? 'medication';
    return { page: 'person', memberId, section } as const;
  }

  if (hash.startsWith('episode=')) {
    const params = new URLSearchParams(hash);
    const episodeId = params.get('episode') ?? hash.replace('episode=', '').split('&')[0];
    return { page: 'episode', episodeId } as const;
  }

  return { page: 'home' } as const;
};

const routeFromHash = () => routeFromHashString(window.location.hash);







type Route = ReturnType<typeof routeFromHash>;







type DriveState = {



  connected: boolean;



  busy: boolean;



  message: string | null;



};







const FEVER_THRESHOLD = 37.8;







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

          <stop offset="0%" stopColor="#1C8C8C" />

          <stop offset="100%" stopColor="#F05A4F" />

        </linearGradient>

      </defs>

      <rect x="0" y="0" width={width} height={height} className="chart-bg" />

      <path d={linePath} fill="none" stroke="url(#tempLine)" strokeWidth="3" />

      {points.map((point) => (

        <rect

          key={point.entry.id}

          x={point.x - 3}

          y={point.y - 3}

          width={6}

          height={6}

          className="chart-point"

        />

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

type BarDatum = {
  label: string;
  value: number;
  meta?: string;
};

const MiniBarChart = ({
  id,
  title,
  data,
  valueSuffix = '',
  emptyLabel = 'No data yet.'
}: {
  id: string;
  title: string;
  data: BarDatum[];
  valueSuffix?: string;
  emptyLabel?: string;
}) => {
  if (data.length === 0) {
    return <div className="chart-empty">{emptyLabel}</div>;
  }
  const width = 340;
  const height = 180;
  const padding = 28;
  const gap = 10;
  const max = Math.max(...data.map((item) => item.value), 1);
  const barWidth = Math.max(
    14,
    (width - padding * 2 - gap * (data.length - 1)) / Math.max(data.length, 1)
  );
  const chartHeight = height - padding * 2 - 16;

  return (
    <svg id={id} className="insight-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      <rect x="0" y="0" width={width} height={height} className="chart-bg" />
      <text x={padding} y={padding - 8} className="chart-label">
        {title}
      </text>
      {data.map((item, index) => {
        const barHeight = Math.max(4, (item.value / max) * chartHeight);
        const x = padding + index * (barWidth + gap);
        const y = height - padding - barHeight;
        const label = item.label.length > 10 ? `${item.label.slice(0, 10)}...` : item.label;
        return (
          <g key={item.label}>
            <rect x={x} y={y} width={barWidth} height={barHeight} className="insight-bar" />
            <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" className="chart-value">
              {item.value}
              {valueSuffix}
            </text>
            <text x={x + barWidth / 2} y={height - padding + 12} textAnchor="middle" className="chart-label">
              {label}
            </text>
            {item.meta && (
              <text x={x + barWidth / 2} y={height - padding + 26} textAnchor="middle" className="chart-meta">
                {item.meta}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};











type EpisodeLinkSelectProps = {



  episodes: Episode[];



  value: string | null;



  onChange: (value: string | null) => void;



  disabled?: boolean;



};







const EpisodeLinkSelect = ({ episodes, value, onChange, disabled = false }: EpisodeLinkSelectProps) => (



  <label>



    Link to illness (optional)



    <select



      value={value ?? ''}
      onChange={(event) => onChange(event.target.value ? event.target.value : null)}



      disabled={disabled}



    >



      <option value="">Unlinked</option>



      {episodes.filter((episode) => !episode.deletedAtISO).map((episode) => (



        <option key={episode.id} value={episode.id}>



          {episode.category} - {formatDate(episode.startedAtISO)}



        </option>



      ))}



    </select>



  </label>



);







type LogEntryFormsProps = {



  member: Member;



  episodes: Episode[];

  temps: TempEntry[];

  symptoms: SymptomEntry[];

  meds: MedEntry[];

  catalog: MedCatalogItem[];






  onAddTemp: (memberId: string, tempC: number, atISO: string, note: string, episodeId: string | null) => Promise<void>;



  onAddMed: (



    memberId: string,



    catalogItem: MedCatalogItem,



    doseText: string,



    atISO: string,



    route: string,



    note: string,



    episodeId: string | null



  ) => Promise<void>;



  onAddSymptom: (



    memberId: string,



    symptoms: string[],



    atISO: string,



    note: string,



    episodeId: string | null



  ) => Promise<void>;



  onUpsertCatalog: (name: string) => Promise<MedCatalogItem | null>;



  onToggleFavorite: (itemId: string) => Promise<void>;



  lockEpisodeId?: string | null;



  heading?: string;

  idPrefix?: string;



};







const LogEntryForms = ({



  member,



  episodes,

  temps,

  symptoms,



  meds,



  catalog,



  onAddTemp,



  onAddMed,



  onAddSymptom,



  onUpsertCatalog,



  onToggleFavorite,



  lockEpisodeId,



  heading,
  idPrefix



}: LogEntryFormsProps) => {



  const locked = typeof lockEpisodeId === 'string';

  const fieldPrefix = idPrefix ?? member.id;

  const ongoingEpisodeId = useMemo(
    () => episodes.find((episode) => !episode.endedAtISO)?.id ?? null,
    [episodes]
  );

  const lastTempEntry = useMemo(() => {
    if (!temps.length) return null;
    return (
      temps
        .slice()
        .sort((a: TempEntry, b: TempEntry) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime())[0] ??       null
    );
  }, [temps]);

  const lastMedEntry = useMemo(() => {
    if (!meds.length) return null;
    return (
      meds
        .slice()
        .sort((a: MedEntry, b: MedEntry) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime())[0] ??       null
    );
  }, [meds]);

  const lastSymptomEntry = useMemo(() => {
    if (!symptoms.length) return null;
    return (
      symptoms
        .slice()
        .sort(
          (a: SymptomEntry, b: SymptomEntry) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime()
        )[0] ?? null
    );
  }, [symptoms]);

  const recentSymptomCombos = useMemo(() => {
    const combos = new Map<string, string>();
    const sorted = symptoms
      .slice()
      .sort((a: SymptomEntry, b: SymptomEntry) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime());
    for (const entry of sorted) {
      const normalized = entry.symptoms.map((item: string) => item.trim().toLowerCase()).filter(Boolean);
      if (!normalized.length) continue;
      const key = normalized.join('|');
      if (!combos.has(key)) {
        combos.set(key, entry.symptoms.join(', '));
      }
      if (combos.size >= 4) break;
    }
    return Array.from(combos.values());
  }, [symptoms]);

  const [tempValue, setTempValue] = useState('');



  const [tempTime, setTempTime] = useState(toLocalTimeInput(nowISO()));



  const [tempNote, setTempNote] = useState('');



  const [tempEpisodeId, setTempEpisodeId] = useState<string | null>(null);







  const [symptomText, setSymptomText] = useState('');



  const [symptomTime, setSymptomTime] = useState(toLocalTimeInput(nowISO()));



  const [symptomNote, setSymptomNote] = useState('');



  const [symptomEpisodeId, setSymptomEpisodeId] = useState<string | null>(null);







  const [medName, setMedName] = useState('');



  const [medDose, setMedDose] = useState('');



  const [medRoute, setMedRoute] = useState('');



  const [medTime, setMedTime] = useState(toLocalTimeInput(nowISO()));



  const [medNote, setMedNote] = useState('');



  const [medEpisodeId, setMedEpisodeId] = useState<string | null>(null);



  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);







  useEffect(() => {
    if (locked) return;
    setTempEpisodeId(ongoingEpisodeId);
    setSymptomEpisodeId(ongoingEpisodeId);
    setMedEpisodeId(ongoingEpisodeId);
    setTempTime(toLocalTimeInput(nowISO()));
    setSymptomTime(toLocalTimeInput(nowISO()));
    setMedTime(toLocalTimeInput(nowISO()));
  }, [member.id, locked, ongoingEpisodeId]);

  useEffect(() => {
    if (locked || !ongoingEpisodeId) return;
    if (!tempEpisodeId) setTempEpisodeId(ongoingEpisodeId);
    if (!symptomEpisodeId) setSymptomEpisodeId(ongoingEpisodeId);
    if (!medEpisodeId) setMedEpisodeId(ongoingEpisodeId);
  }, [locked, ongoingEpisodeId, tempEpisodeId, symptomEpisodeId, medEpisodeId]);

  useEffect(() => {
    // Keep quick-log fields writable; avoid re-applying the last medication on each render.
    setSelectedMedId(null);
    setMedName('');
    setMedDose('');
    setMedRoute('');
    setSymptomText('');
  }, [member.id]);







  const recentCatalog = useMemo(() => {



    const seen = new Set<string>();



    const recent = meds



      .slice()



      .sort((a, b) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime())



      .map((entry) => catalog.find((item) => item.id === entry.medId))



      .filter((item): item is MedCatalogItem => Boolean(item))



      .filter((item) => {



        if (seen.has(item.id)) return false;



        seen.add(item.id);



        return true;



      });



    return recent.slice(0, 6);



  }, [meds, catalog]);







  const favoriteCatalog = useMemo(



    () => catalog.filter((item) => item.isFavorite).slice(0, 6),



    [catalog]



  );







  const suggestions = useMemo(() => {



    const query = medName.trim().toLowerCase();



    if (!query) return catalog.slice(0, 6);



    return catalog.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 6);



  }, [medName, catalog]);

  const formatTemp = (value: number) => value.toFixed(1);

  const bumpTemp = (delta: number) => {
    const parsed = Number(tempValue);
    const base = Number.isFinite(parsed)
      ? parsed
      : lastTempEntry?.tempC ?? FEVER_THRESHOLD;
    const next = Math.round((base + delta) * 10) / 10;
    setTempValue(formatTemp(next));
  };

  const tempParsed = Number(tempValue);
  const tempOutOfRange =
    tempValue.trim().length > 0 && (!Number.isFinite(tempParsed) || tempParsed < 35 || tempParsed > 42.5);







  const handleTempSubmit = async () => {



    const parsed = Number(tempValue);



    if (!Number.isFinite(parsed)) return;



    await onAddTemp(



      member.id,



      parsed,



      toISOFromTime(tempTime),



      tempNote.trim(),



 locked ? lockEpisodeId : tempEpisodeId



    );



    setTempValue('');



    setTempNote('');
    setTempTime(toLocalTimeInput(nowISO()));



  };







  const handleSymptomSubmit = async () => {



    const parsed = symptomText



      .split(',')



      .map((item) => item.trim())



      .filter(Boolean);



    if (parsed.length === 0) return;



    await onAddSymptom(



      member.id,



      parsed,



      toISOFromTime(symptomTime),



      symptomNote.trim(),



 locked ? lockEpisodeId : symptomEpisodeId



    );



    setSymptomText('');



    setSymptomNote('');
    setSymptomTime(toLocalTimeInput(nowISO()));



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



    await onAddMed(



      member.id,



      catalogItem,



      medDose.trim(),



      iso,



      medRoute.trim(),



      medNote.trim(),



 locked ? lockEpisodeId : medEpisodeId



    );



    setMedName('');



    setMedDose('');



    setMedRoute('');



    setMedNote('');
    setMedTime(toLocalTimeInput(nowISO()));



    setSelectedMedId(null);



  };

  const handleRepeatMed = async () => {
    if (!lastMedEntry) return;
    let catalogItem = catalog.find((item) => item.id === lastMedEntry.medId) ?? null;
    if (!catalogItem) {
      catalogItem = await onUpsertCatalog(lastMedEntry.medName);
    }
    if (!catalogItem) return;
    await onAddMed(
      member.id,
      catalogItem,
      lastMedEntry.doseText,
      nowISO(),
      lastMedEntry.route ?? '',
      lastMedEntry.note ?? '',
      locked ? lockEpisodeId : medEpisodeId
    );
  };

  const handleRepeatSymptoms = async () => {
    if (!lastSymptomEntry) return;
    await onAddSymptom(
      member.id,
      lastSymptomEntry.symptoms,
      nowISO(),
      lastSymptomEntry.note ?? '',
      locked ? lockEpisodeId : symptomEpisodeId
    );
  };

  const handleRepeatTemp = async () => {
    if (!lastTempEntry) return;
    await onAddTemp(
      member.id,
      lastTempEntry.tempC,
      nowISO(),
      lastTempEntry.note ?? '',
      locked ? lockEpisodeId : tempEpisodeId
    );
  };







  return (



    <div className="log-quick">



      <div className="log-quick-header">



        <h3>{heading ?? 'Quick log'}</h3>



        <p>Log symptoms, temperature, and medication without linking to an illness.</p>



      </div>



      <div className="log-quick-grid">



        <div className="log-form log-form-temp" id={`temp-form-${fieldPrefix}`}>



          <h4>Temperature</h4>



          <div className="form-grid">



            <label>



              Temp (C)



              <input



                type="number"



                step="0.1"
                id={`temp-value-${fieldPrefix}`}



                value={tempValue}



                onChange={(event) => setTempValue(event.target.value)}



                placeholder="37.6"



              />



            </label>

            <div className="temp-nudges full">
              <span className="temp-nudge-label">Quick</span>
              <button type="button" className="chip" onClick={() => setTempValue(formatTemp(FEVER_THRESHOLD))}>
                {formatTemp(FEVER_THRESHOLD)}
              </button>
              <button type="button" className="chip" onClick={() => bumpTemp(0.1)}>
                +0.1
              </button>
              <button type="button" className="chip" onClick={() => bumpTemp(0.5)}>
                +0.5
              </button>
              <button type="button" className="chip" onClick={() => bumpTemp(1)}>
                +1.0
              </button>
              {lastTempEntry && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => setTempValue(formatTemp(lastTempEntry.tempC))}
                >
                  Last {formatTemp(lastTempEntry.tempC)}
                </button>
              )}
            </div>

            <p className={`input-hint full ${tempOutOfRange ? 'warning' : ''}`}>
              Expected range 35.0-42.5 C{tempOutOfRange ? ' (check value)' : ''}.
            </p>



            <label>



              Time



              <input type="time" value={tempTime} onChange={(event) => setTempTime(event.target.value)} />



            </label>



            <label>



              Note



              <input value={tempNote} onChange={(event) => setTempNote(event.target.value)} placeholder="Optional" />



            </label>



            {!locked && (



              <EpisodeLinkSelect episodes={episodes} value={tempEpisodeId} onChange={setTempEpisodeId} />



            )}



            <button type="button" className="primary" onClick={handleTempSubmit}>
              Add temperature
            </button>
            {lastTempEntry && (
              <button type="button" className="ghost" onClick={handleRepeatTemp}>
                Repeat last
              </button>
            )}



          </div>



        </div>







        <div className="log-form log-form-symptom" id={`symptom-form-${fieldPrefix}`}>



          <h4>Symptoms</h4>

          {recentSymptomCombos.length > 0 && (
            <div className="chip-row">
              {recentSymptomCombos.map((combo) => (
                <button
                  key={combo}
                  type="button"
                  className="chip"
                  onClick={() => setSymptomText(combo)}
                >
                  {combo}
                </button>
              ))}
            </div>
          )}

          <div className="form-grid">



            <label>



              Symptoms



              <input



                id={`symptom-text-${fieldPrefix}`}
                value={symptomText}



                onChange={(event) => setSymptomText(event.target.value)}



                placeholder="Fever, cough"



              />



            </label>



            <label>



              Time



              <input type="time" value={symptomTime} onChange={(event) => setSymptomTime(event.target.value)} />



            </label>



            <label>



              Note



              <input



                value={symptomNote}



                onChange={(event) => setSymptomNote(event.target.value)}



                placeholder="Optional"



              />



            </label>



            {!locked && (



              <EpisodeLinkSelect episodes={episodes} value={symptomEpisodeId} onChange={setSymptomEpisodeId} />



            )}



            <button type="button" className="primary" onClick={handleSymptomSubmit}>
              Add symptoms
            </button>
            {lastSymptomEntry && (
              <button type="button" className="ghost" onClick={handleRepeatSymptoms}>
                Repeat last
              </button>
            )}



          </div>



        </div>







        <div className="log-form log-form-med" id={`med-form-${fieldPrefix}`}>



          <h4>Medication</h4>



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



                id={`med-name-${fieldPrefix}`}
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



            <label>



              Note



              <input value={medNote} onChange={(event) => setMedNote(event.target.value)} placeholder="Optional" />



            </label>



            {!locked && (



              <EpisodeLinkSelect episodes={episodes} value={medEpisodeId} onChange={setMedEpisodeId} />



            )}



            <button type="button" className="primary" onClick={handleMedSubmit}>
              Add medication
            </button>
            {lastMedEntry && (
              <button type="button" className="ghost" onClick={handleRepeatMed}>
                Repeat last
              </button>
            )}



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



        </div>



      </div>



    </div>



  );



};







type TempLogListProps = {



  entries: TempEntry[];



  episodes: Episode[];



  onUpdate: (entryId: string, updates: Partial<TempEntry>) => Promise<void>;



  onDelete: (entryId: string) => Promise<void>;



};







const TempLogList = ({ entries, episodes, onUpdate, onDelete }: TempLogListProps) => {



  const sorted = useMemo(
    () => entries.slice().sort((a, b) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime()),
    [entries]
  );

  const [range, setRange] = useState<'today' | '7d' | 'all'>('all');

  const filtered = useMemo(() => {
    if (range === 'all') return sorted;
    const todayKey = toLocalDateKey(new Date().toISOString());
    if (range === 'today') {
      return sorted.filter((entry) => toLocalDateKey(entry.atISO) === todayKey);
    }
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return sorted.filter((entry) => new Date(entry.atISO) >= start);
  }, [range, sorted]);

  const grouped = useMemo(() => {
    const map = new Map<string, TempEntry[]>();
    filtered.forEach((entry) => {
      const key = toLocalDateKey(entry.atISO);
      if (!key) return;
      const bucket = map.get(key) ?? [];
      bucket.push(entry);
      map.set(key, bucket);
    });
    return Array.from(map.entries()).sort(
      (a, b) => new Date(`${b[0]}T00:00:00`).getTime() - new Date(`${a[0]}T00:00:00`).getTime()
    );
  }, [filtered]);



  const [editingId, setEditingId] = useState<string | null>(null);



  const [editTemp, setEditTemp] = useState('');



  const [editDate, setEditDate] = useState('');



  const [editTime, setEditTime] = useState('');



  const [editNote, setEditNote] = useState('');



  const [editEpisodeId, setEditEpisodeId] = useState<string | null>(null);

  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (entryId: string) => {
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      if (typeof window === 'undefined') return;
      if (window.confirm('Delete this entry-')) {
        onDelete(entryId);
      }
    }, 650);
  };

  const handleTouchStart = (entryId: string) => (event: TouchEvent) => {
    swipeStartX.current = event.touches[0]?.clientX ?? null;
    startLongPress(entryId);
  };

  const handleTouchMove = (entryId: string) => (event: TouchEvent) => {
    if (swipeStartX.current === null) return;
    const currentX = event.touches[0]?.clientX ?? swipeStartX.current;
    const delta = currentX - swipeStartX.current;
    if (Math.abs(delta) > 8) {
      clearLongPress();
    }
    if (delta < -35) {
      setSwipeOpenId(entryId);
    } else if (delta > 25) {
      setSwipeOpenId(null);
    }
  };

  const handleTouchEnd = () => {
    swipeStartX.current = null;
    clearLongPress();
  };







  const startEdit = (entry: TempEntry) => {



    setEditingId(entry.id);



    setEditTemp(String(entry.tempC));



    setEditDate(toLocalDateInput(entry.atISO));



    setEditTime(toLocalTimeInput(entry.atISO));



    setEditNote(entry.note);



    setEditEpisodeId(entry.episodeId ?? null);
    setSwipeOpenId(null);



  };







  const saveEdit = async () => {



    if (!editingId) return;



    const parsed = Number(editTemp);



    if (!Number.isFinite(parsed)) return;



    await onUpdate(editingId, {



      tempC: parsed,



      atISO: toISOFromDateTime(editDate, editTime),



      note: editNote,



      episodeId: editEpisodeId



    });



    setEditingId(null);



  };







  if (entries.length === 0) {
    return <p className="empty">No temperature entries yet.</p>;
  }







  return (
    <div className="log-list">
      <div className="log-filters">
        <button type="button" className={range === 'today' ? 'active' : ''} onClick={() => setRange('today')}>
          Today
        </button>
        <button type="button" className={range === '7d' ? 'active' : ''} onClick={() => setRange('7d')}>
          7 days
        </button>
        <button type="button" className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>
          All
        </button>
      </div>

      {grouped.length === 0 && <p className="empty">No entries for this range.</p>}

      {grouped.map(([dateKey, items]) => (
        <div key={dateKey} className="log-day-group">
          <div className="log-day">{formatDate(`${dateKey}T00:00:00`)}</div>
          {items.map((entry) => {
            const isEditing = editingId === entry.id;
            return (
              <div
                key={entry.id}
                className={`log-row ${swipeOpenId === entry.id ? 'swipe-open' : ''} ${
                  isRecentlyCreated(entry.createdAtISO) ? 'fresh' : ''
                }`}
                onTouchStart={handleTouchStart(entry.id)}
                onTouchMove={handleTouchMove(entry.id)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onClick={(event) => {
                  if (isEditing) return;
                  const target = event.target as HTMLElement;
                  if (target.closest('button, input, select, textarea, a')) return;
                  startEdit(entry);
                }}
              >
                {isEditing ? (
                  <div className="log-edit">
                    <div className="form-grid">
                      <label>
                        Temp (C)
                        <input value={editTemp} onChange={(event) => setEditTemp(event.target.value)} />
                      </label>
                      <label>
                        Date
                        <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                      </label>
                      <label>
                        Time
                        <input type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} />
                      </label>
                      <label>
                        Note
                        <input value={editNote} onChange={(event) => setEditNote(event.target.value)} />
                      </label>
                      <EpisodeLinkSelect episodes={episodes} value={editEpisodeId} onChange={setEditEpisodeId} />
                    </div>
                    <div className="log-actions">
                      <button type="button" className="primary" onClick={saveEdit}>
                        Save
                      </button>
                      <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>{entry.tempC.toFixed(1)} C</strong>
                      <span>{formatTime(entry.atISO)}</span>
                      {entry.note && <span>{entry.note}</span>}
                    </div>
                    <div className="log-actions">
                      <button type="button" className="ghost" onClick={() => startEdit(entry)}>
                        Edit
                      </button>
                      <button type="button" className="ghost" onClick={() => onDelete(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );



};







type MedLogListProps = {



  entries: MedEntry[];



  episodes: Episode[];



  onUpdate: (entryId: string, updates: Partial<MedEntry>) => Promise<void>;



  onDelete: (entryId: string) => Promise<void>;



  onUpsertCatalog: (name: string) => Promise<MedCatalogItem | null>;



};







const MedLogList = ({ entries, episodes, onUpdate, onDelete, onUpsertCatalog }: MedLogListProps) => {



  const sorted = useMemo(
    () => entries.slice().sort((a, b) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime()),
    [entries]
  );

  const [range, setRange] = useState<'today' | '7d' | 'all'>('all');

  const filtered = useMemo(() => {
    if (range === 'all') return sorted;
    const todayKey = toLocalDateKey(new Date().toISOString());
    if (range === 'today') {
      return sorted.filter((entry) => toLocalDateKey(entry.atISO) === todayKey);
    }
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return sorted.filter((entry) => new Date(entry.atISO) >= start);
  }, [range, sorted]);

  const grouped = useMemo(() => {
    const map = new Map<string, MedEntry[]>();
    filtered.forEach((entry) => {
      const key = toLocalDateKey(entry.atISO);
      if (!key) return;
      const bucket = map.get(key) ?? [];
      bucket.push(entry);
      map.set(key, bucket);
    });
    return Array.from(map.entries()).sort(
      (a, b) => new Date(`${b[0]}T00:00:00`).getTime() - new Date(`${a[0]}T00:00:00`).getTime()
    );
  }, [filtered]);



  const [editingId, setEditingId] = useState<string | null>(null);



  const [editName, setEditName] = useState('');



  const [editDose, setEditDose] = useState('');



  const [editRoute, setEditRoute] = useState('');



  const [editNote, setEditNote] = useState('');



  const [editDate, setEditDate] = useState('');



  const [editTime, setEditTime] = useState('');



  const [editEpisodeId, setEditEpisodeId] = useState<string | null>(null);

  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (entryId: string) => {
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      if (typeof window === 'undefined') return;
      if (window.confirm('Delete this entry-')) {
        onDelete(entryId);
      }
    }, 650);
  };

  const handleTouchStart = (entryId: string) => (event: TouchEvent) => {
    swipeStartX.current = event.touches[0]?.clientX ?? null;
    startLongPress(entryId);
  };

  const handleTouchMove = (entryId: string) => (event: TouchEvent) => {
    if (swipeStartX.current === null) return;
    const currentX = event.touches[0]?.clientX ?? swipeStartX.current;
    const delta = currentX - swipeStartX.current;
    if (Math.abs(delta) > 8) {
      clearLongPress();
    }
    if (delta < -35) {
      setSwipeOpenId(entryId);
    } else if (delta > 25) {
      setSwipeOpenId(null);
    }
  };

  const handleTouchEnd = () => {
    swipeStartX.current = null;
    clearLongPress();
  };







  const startEdit = (entry: MedEntry) => {



    setEditingId(entry.id);



    setEditName(entry.medName);



    setEditDose(entry.doseText);



    setEditRoute(entry.route ?? '');



    setEditNote(entry.note);



    setEditDate(toLocalDateInput(entry.atISO));



    setEditTime(toLocalTimeInput(entry.atISO));



    setEditEpisodeId(entry.episodeId ?? null);



  };







  const saveEdit = async () => {



    if (!editingId) return;



    const catalogItem = await onUpsertCatalog(editName);



    if (!catalogItem) return;



    await onUpdate(editingId, {



      medId: catalogItem.id,



      medName: catalogItem.name,



      doseText: editDose,



      route: editRoute,



      note: editNote,



      atISO: toISOFromDateTime(editDate, editTime),



      episodeId: editEpisodeId



    });



    setEditingId(null);



  };







  if (entries.length === 0) {
    return <p className="empty">No medication entries yet.</p>;
  }







  return (
    <div className="log-list">
      <div className="log-filters">
        <button type="button" className={range === 'today' ? 'active' : ''} onClick={() => setRange('today')}>
          Today
        </button>
        <button type="button" className={range === '7d' ? 'active' : ''} onClick={() => setRange('7d')}>
          7 days
        </button>
        <button type="button" className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>
          All
        </button>
      </div>

      {grouped.length === 0 && <p className="empty">No entries for this range.</p>}

      {grouped.map(([dateKey, items]) => (
        <div key={dateKey} className="log-day-group">
          <div className="log-day">{formatDate(`${dateKey}T00:00:00`)}</div>
          {items.map((entry) => {
            const isEditing = editingId === entry.id;
            return (
              <div
                key={entry.id}
                className={`log-row ${swipeOpenId === entry.id ? 'swipe-open' : ''} ${
                  isRecentlyCreated(entry.createdAtISO) ? 'fresh' : ''
                }`}
                onTouchStart={handleTouchStart(entry.id)}
                onTouchMove={handleTouchMove(entry.id)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onClick={(event) => {
                  if (isEditing) return;
                  const target = event.target as HTMLElement;
                  if (target.closest('button, input, select, textarea, a')) return;
                  startEdit(entry);
                }}
              >
                {isEditing ? (
                  <div className="log-edit">
                    <div className="form-grid">
                      <label>
                        Medication
                        <input value={editName} onChange={(event) => setEditName(event.target.value)} />
                      </label>
                      <label>
                        Dose
                        <input value={editDose} onChange={(event) => setEditDose(event.target.value)} />
                      </label>
                      <label>
                        Route
                        <input value={editRoute} onChange={(event) => setEditRoute(event.target.value)} />
                      </label>
                      <label>
                        Date
                        <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                      </label>
                      <label>
                        Time
                        <input type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} />
                      </label>
                      <label>
                        Note
                        <input value={editNote} onChange={(event) => setEditNote(event.target.value)} />
                      </label>
                      <EpisodeLinkSelect episodes={episodes} value={editEpisodeId} onChange={setEditEpisodeId} />
                    </div>
                    <div className="log-actions">
                      <button type="button" className="primary" onClick={saveEdit}>
                        Save
                      </button>
                      <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>{entry.medName}</strong>
                      <span>{formatTime(entry.atISO)}</span>
                      <span>{[entry.doseText, entry.route].filter(Boolean).join(' - ')}</span>
                      {entry.note && <span>{entry.note}</span>}
                    </div>
                    <div className="log-actions">
                      <button type="button" className="ghost" onClick={() => startEdit(entry)}>
                        Edit
                      </button>
                      <button type="button" className="ghost" onClick={() => onDelete(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );



};







type MedicationCourseSectionProps = {
  member: Member;
  catalog: MedCatalogItem[];
  courses: MedCourse[];
  onUpsertCatalog: (name: string) => Promise<MedCatalogItem | null>;
  onCreateCourse: (input: {
    memberId: string;
    catalogItem: MedCatalogItem;
    doseText: string;
    startAtISO: string;
    intervalHours: number;
    durationDays: number;
    route: string;
    note: string;
  }) => Promise<MedCourse | null>;
  onDeleteCourse: (courseId: string) => Promise<void>;
  onExportCourse: (course: MedCourse, member: Member) => void;
};

const MedicationCourseSection = ({
  member,
  catalog,
  courses,
  onUpsertCatalog,
  onCreateCourse,
  onDeleteCourse,
  onExportCourse
}: MedicationCourseSectionProps) => {
  const [medName, setMedName] = useState('');
  const [doseText, setDoseText] = useState('');
  const [route, setRoute] = useState('');
  const [startDate, setStartDate] = useState(toLocalDateInput(nowISO()));
  const [startTime, setStartTime] = useState(toLocalTimeInput(nowISO()));
  const [intervalHours, setIntervalHours] = useState('8');
  const [durationDays, setDurationDays] = useState('7');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStartDate(toLocalDateInput(nowISO()));
    setStartTime(toLocalTimeInput(nowISO()));
  }, [member.id]);

  const submitCourse = async () => {
    const interval = Math.max(1, Math.round(Number(intervalHours)));
    const duration = Math.max(1, Math.round(Number(durationDays)));
    if (!Number.isFinite(interval) || !Number.isFinite(duration)) return;
    setBusy(true);
    try {
      const catalogItem = await onUpsertCatalog(medName);
      if (!catalogItem) return;
      const created = await onCreateCourse({
        memberId: member.id,
        catalogItem,
        doseText: doseText.trim(),
        startAtISO: toISOFromDateTime(startDate, startTime),
        intervalHours: interval,
        durationDays: duration,
        route: route.trim(),
        note: note.trim()
      });
      if (!created) return;
      setNote('');
      if (typeof window !== 'undefined' && window.confirm('Course saved. Download reminder calendar now?')) {
        onExportCourse(created, member);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="med-course">
      <div className="section-header">
        <h4>Antibiotic course reminders</h4>
        <p>Every N hours for D days, exported as iPhone-ready calendar reminders.</p>
      </div>
      <div className="form-grid">
        <label>
          Medication
          <input
            list={`med-course-catalog-${member.id}`}
            value={medName}
            onChange={(event) => setMedName(event.target.value)}
            placeholder="Amoxicillin"
          />
          <datalist id={`med-course-catalog-${member.id}`}>
            {catalog.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
        </label>
        <label>
          Dose
          <input value={doseText} onChange={(event) => setDoseText(event.target.value)} placeholder="5 mL" />
        </label>
        <label>
          Start date
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          Start time
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label>
          Every (hours)
          <input
            type="number"
            min={1}
            step={1}
            value={intervalHours}
            onChange={(event) => setIntervalHours(event.target.value)}
          />
        </label>
        <label>
          Duration (days)
          <input
            type="number"
            min={1}
            step={1}
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
          />
        </label>
        <label>
          Route
          <input value={route} onChange={(event) => setRoute(event.target.value)} placeholder="Oral (optional)" />
        </label>
        <label>
          Note
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
        </label>
        <button type="button" className="primary" onClick={submitCourse} disabled={busy}>
          Save course
        </button>
      </div>

      <div className="med-course-list">
        {courses.length === 0 && <p className="empty">No medication courses yet.</p>}
        {courses.map((course) => {
          const count = buildCourseSchedule(course).length;
          return (
            <div key={course.id} className="med-course-item">
              <div>
                <strong>{course.medName}</strong>
                <span>
                  Every {course.intervalHours}h for {course.durationDays} day{course.durationDays === 1 ? '' : 's'} (
                  {count} doses)
                </span>
                <span>
                  Starts {formatDate(course.startAtISO)} {formatTime(course.startAtISO)}
                </span>
              </div>
              <div className="log-actions">
                <button type="button" className="ghost" onClick={() => onExportCourse(course, member)}>
                  Export reminders (.ics)
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (typeof window === 'undefined' || window.confirm('Delete this medication course?')) {
                      onDeleteCourse(course.id);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

type WorkspaceSectionNavProps = {
  active: MemberSection;
  onChange: (section: MemberSection) => void;
};

const WorkspaceSectionNav = ({ active, onChange }: WorkspaceSectionNavProps) => {
  const items: Array<{ id: MemberSection; label: string }> = [
    { id: 'medication', label: 'Medication' },
    { id: 'temperature', label: 'Temperature' },
    { id: 'symptoms', label: 'Symptoms' },
    { id: 'illness', label: 'Illness' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'more', label: 'More' }
  ];
  return (
    <div className="workspace-nav" role="tablist" aria-label="Member sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={active === item.id ? 'active' : ''}
          onClick={() => onChange(item.id)}
          role="tab"
          aria-selected={active === item.id}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};

type ComposerMode = 'medication' | 'temperature' | 'symptoms';

type LogComposerSheetProps = {
  open: boolean;
  mode: ComposerMode;
  member: Member;
  episodes: Episode[];
  catalog: MedCatalogItem[];
  recentMedicationChoices: string[];
  defaultEpisodeId: string | null;
  onOpenChange: (open: boolean) => void;
  onAddTemp: (memberId: string, tempC: number, atISO: string, note: string, episodeId: string | null) => Promise<void>;
  onAddMed: (
    memberId: string,
    catalogItem: MedCatalogItem,
    doseText: string,
    atISO: string,
    route: string,
    note: string,
    episodeId: string | null
  ) => Promise<void>;
  onAddSymptom: (
    memberId: string,
    symptoms: string[],
    atISO: string,
    note: string,
    episodeId: string | null
  ) => Promise<void>;
  onUpsertCatalog: (name: string) => Promise<MedCatalogItem | null>;
};

const LogComposerSheet = ({
  open,
  mode,
  member,
  episodes,
  catalog,
  recentMedicationChoices,
  defaultEpisodeId,
  onOpenChange,
  onAddTemp,
  onAddMed,
  onAddSymptom,
  onUpsertCatalog
}: LogComposerSheetProps) => {
  const reduceMotion = useReducedMotion();
  const [episodeId, setEpisodeId] = useState<string | null>(defaultEpisodeId);
  const [timeValue, setTimeValue] = useState(toLocalTimeInput(nowISO()));
  const [tempValue, setTempValue] = useState('');
  const [symptomText, setSymptomText] = useState('');
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [route, setRoute] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setEpisodeId(defaultEpisodeId);
    setTimeValue(toLocalTimeInput(nowISO()));
    setTempValue('');
    setSymptomText('');
    setMedName('');
    setMedDose('');
    setRoute('');
    setNote('');
  }, [open, mode, member.id, defaultEpisodeId]);

  const handleSubmit = async () => {
    if (mode === 'temperature') {
      const parsed = Number(tempValue);
      if (!Number.isFinite(parsed)) return;
      await onAddTemp(member.id, parsed, toISOFromTime(timeValue), note.trim(), episodeId);
      onOpenChange(false);
      return;
    }
    if (mode === 'symptoms') {
      const parsed = symptomText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (parsed.length === 0) return;
      await onAddSymptom(member.id, parsed, toISOFromTime(timeValue), note.trim(), episodeId);
      onOpenChange(false);
      return;
    }
    const catalogItem = await onUpsertCatalog(medName);
    if (!catalogItem) return;
    await onAddMed(member.id, catalogItem, medDose.trim(), toISOFromTime(timeValue), route.trim(), note.trim(), episodeId);
    onOpenChange(false);
  };

  const title = mode === 'medication' ? 'Add medication' : mode === 'temperature' ? 'Add temperature' : 'Add symptoms';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="composer-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.16 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className="composer-sheet"
                initial={{ y: reduceMotion ? 0 : 28, opacity: reduceMotion ? 1 : 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: reduceMotion ? 0 : 28, opacity: reduceMotion ? 1 : 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
                <div className="composer-sheet-header">
                  <Dialog.Title>{title}</Dialog.Title>
                  <Dialog.Close asChild>
                    <button type="button" className="ghost">Close</button>
                  </Dialog.Close>
                </div>
                {mode === 'medication' && recentMedicationChoices.length > 0 && (
                  <div className="composer-quick-picks" aria-label="Recent medication quick picks">
                    {recentMedicationChoices.map((name) => (
                      <button key={name} type="button" className="chip" onClick={() => setMedName(name)}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="form-grid">
                  {mode === 'medication' && (
                    <>
                      <label>
                        Medication
                        <input
                          list={`composer-catalog-${member.id}`}
                          value={medName}
                          onChange={(event) => setMedName(event.target.value)}
                          autoComplete="off"
                          placeholder="Paracetamol"
                        />
                        <datalist id={`composer-catalog-${member.id}`}>
                          {catalog.map((item) => (
                            <option key={item.id} value={item.name} />
                          ))}
                        </datalist>
                      </label>
                      <label>
                        Dose
                        <input value={medDose} onChange={(event) => setMedDose(event.target.value)} placeholder="500 mg" />
                      </label>
                      <label>
                        Route
                        <input value={route} onChange={(event) => setRoute(event.target.value)} placeholder="Oral" />
                      </label>
                    </>
                  )}
                  {mode === 'temperature' && (
                    <label>
                      Temp (C)
                      <input
                        type="number"
                        step="0.1"
                        value={tempValue}
                        onChange={(event) => setTempValue(event.target.value)}
                        placeholder="37.8"
                      />
                    </label>
                  )}
                  {mode === 'symptoms' && (
                    <label className="full">
                      Symptoms
                      <input
                        value={symptomText}
                        onChange={(event) => setSymptomText(event.target.value)}
                        placeholder="Fever, cough"
                      />
                    </label>
                  )}
                  <label>
                    Time
                    <input type="time" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} />
                  </label>
                  <label>
                    Link illness (optional)
                    <select
                      value={episodeId ?? ''}
                      onChange={(event) => setEpisodeId(event.target.value ? event.target.value : null)}
                    >
                      <option value="">Unlinked</option>
                      {episodes.filter((item) => !item.deletedAtISO).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.category} - {formatDate(item.startedAtISO)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full">
                    Note
                    <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
                  </label>
                </div>
                <div className="composer-sheet-actions">
                  <button type="button" className="primary" onClick={handleSubmit}>
                    Save
                  </button>
                  <Dialog.Close asChild>
                    <button type="button" className="ghost">Cancel</button>
                  </Dialog.Close>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
};

type SymptomLogListProps = {



  entries: SymptomEntry[];



  episodes: Episode[];



  onUpdate: (entryId: string, updates: Partial<SymptomEntry>) => Promise<void>;



  onDelete: (entryId: string) => Promise<void>;



};







const SymptomLogList = ({ entries, episodes, onUpdate, onDelete }: SymptomLogListProps) => {



  const sorted = useMemo(



    () => entries.slice().sort((a, b) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime()),



    [entries]



  );

  const [range, setRange] = useState<'today' | '7d' | 'all'>('all');

  const filtered = useMemo(() => {
    if (range === 'all') return sorted;
    const todayKey = toLocalDateKey(new Date().toISOString());
    if (range === 'today') {
      return sorted.filter((entry) => toLocalDateKey(entry.atISO) === todayKey);
    }
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return sorted.filter((entry) => new Date(entry.atISO) >= start);
  }, [range, sorted]);

  const grouped = useMemo(() => {
    const map = new Map<string, SymptomEntry[]>();
    filtered.forEach((entry) => {
      const key = toLocalDateKey(entry.atISO);
      if (!key) return;
      const bucket = map.get(key) ?? [];
      bucket.push(entry);
      map.set(key, bucket);
    });
    return Array.from(map.entries()).sort(
      (a, b) => new Date(`${b[0]}T00:00:00`).getTime() - new Date(`${a[0]}T00:00:00`).getTime()
    );
  }, [filtered]);



  const [editingId, setEditingId] = useState<string | null>(null);



  const [editSymptoms, setEditSymptoms] = useState('');



  const [editNote, setEditNote] = useState('');



  const [editDate, setEditDate] = useState('');



  const [editTime, setEditTime] = useState('');



  const [editEpisodeId, setEditEpisodeId] = useState<string | null>(null);

  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (entryId: string) => {
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      if (typeof window === 'undefined') return;
      if (window.confirm('Delete this entry-')) {
        onDelete(entryId);
      }
    }, 650);
  };

  const handleTouchStart = (entryId: string) => (event: TouchEvent) => {
    swipeStartX.current = event.touches[0]?.clientX ?? null;
    startLongPress(entryId);
  };

  const handleTouchMove = (entryId: string) => (event: TouchEvent) => {
    if (swipeStartX.current === null) return;
    const currentX = event.touches[0]?.clientX ?? swipeStartX.current;
    const delta = currentX - swipeStartX.current;
    if (Math.abs(delta) > 8) {
      clearLongPress();
    }
    if (delta < -35) {
      setSwipeOpenId(entryId);
    } else if (delta > 25) {
      setSwipeOpenId(null);
    }
  };

  const handleTouchEnd = () => {
    swipeStartX.current = null;
    clearLongPress();
  };







  const startEdit = (entry: SymptomEntry) => {



    setEditingId(entry.id);



    setEditSymptoms(entry.symptoms.join(', '));



    setEditNote(entry.note);



    setEditDate(toLocalDateInput(entry.atISO));



    setEditTime(toLocalTimeInput(entry.atISO));



    setEditEpisodeId(entry.episodeId ?? null);



  };







  const saveEdit = async () => {



    if (!editingId) return;



    const parsed = editSymptoms



      .split(',')



      .map((item) => item.trim())



      .filter(Boolean);



    if (parsed.length === 0) return;



    await onUpdate(editingId, {



      symptoms: parsed,



      note: editNote,



      atISO: toISOFromDateTime(editDate, editTime),



      episodeId: editEpisodeId



    });



    setEditingId(null);



  };







  if (entries.length === 0) {
    return <p className="empty">No symptom entries yet.</p>;
  }







  return (
    <div className="log-list">
      <div className="log-filters">
        <button type="button" className={range === 'today' ? 'active' : ''} onClick={() => setRange('today')}>
          Today
        </button>
        <button type="button" className={range === '7d' ? 'active' : ''} onClick={() => setRange('7d')}>
          7 days
        </button>
        <button type="button" className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>
          All
        </button>
      </div>

      {grouped.length === 0 && <p className="empty">No entries for this range.</p>}

      {grouped.map(([dateKey, items]) => (
        <div key={dateKey} className="log-day-group">
          <div className="log-day">{formatDate(`${dateKey}T00:00:00`)}</div>
          {items.map((entry) => {
            const isEditing = editingId === entry.id;
            return (
              <div
                key={entry.id}
                className={`log-row ${swipeOpenId === entry.id ? 'swipe-open' : ''} ${
                  isRecentlyCreated(entry.createdAtISO) ? 'fresh' : ''
                }`}
                onTouchStart={handleTouchStart(entry.id)}
                onTouchMove={handleTouchMove(entry.id)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onClick={(event) => {
                  if (isEditing) return;
                  const target = event.target as HTMLElement;
                  if (target.closest('button, input, select, textarea, a')) return;
                  startEdit(entry);
                }}
              >
                {isEditing ? (
                  <div className="log-edit">
                    <div className="form-grid">
                      <label>
                        Symptoms
                        <input value={editSymptoms} onChange={(event) => setEditSymptoms(event.target.value)} />
                      </label>
                      <label>
                        Date
                        <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                      </label>
                      <label>
                        Time
                        <input type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} />
                      </label>
                      <label>
                        Note
                        <input value={editNote} onChange={(event) => setEditNote(event.target.value)} />
                      </label>
                      <EpisodeLinkSelect episodes={episodes} value={editEpisodeId} onChange={setEditEpisodeId} />
                    </div>
                    <div className="log-actions">
                      <button type="button" className="primary" onClick={saveEdit}>
                        Save
                      </button>
                      <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>{entry.symptoms.join(', ')}</strong>
                      <span>{formatTime(entry.atISO)}</span>
                      {entry.note && <span>{entry.note}</span>}
                    </div>
                    <div className="log-actions">
                      <button type="button" className="ghost" onClick={() => startEdit(entry)}>
                        Edit
                      </button>
                      <button type="button" className="ghost" onClick={() => onDelete(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );



};







type CalendarViewProps = {



  member: Member;



  temps: TempEntry[];



  meds: MedEntry[];





  onQuickAdd: (type: 'temp' | 'med' | 'symptom') => void;
};







const CalendarView = ({ member, temps, meds, onQuickAdd }: CalendarViewProps) => {



  const [month, setMonth] = useState(() => new Date());

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);







  useEffect(() => {



    setMonth(new Date());



  }, [member.id]);

  useEffect(() => {
    setSelectedDateKey(null);
  }, [member.id, month]);







  const marks = useMemo(() => {



    const map = new Map<string, { fever: boolean; med: boolean }>();



    temps.forEach((entry) => {



      if (entry.tempC < FEVER_THRESHOLD) return;



      const key = toLocalDateKey(entry.atISO);



      if (!key) return;



      const current = map.get(key) ?? { fever: false, med: false };



      current.fever = true;



      map.set(key, current);



    });



    meds.forEach((entry) => {



      const key = toLocalDateKey(entry.atISO);



      if (!key) return;



      const current = map.get(key) ?? { fever: false, med: false };



      current.med = true;



      map.set(key, current);



    });



    return map;



  }, [temps, meds]);







  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);



  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);



  const startOffset = (monthStart.getDay() + 6) % 7;



  const totalDays = monthEnd.getDate();



  const cells = Math.ceil((startOffset + totalDays) / 7) * 7;



  const days = Array.from({ length: cells }, (_, index) => {



    const dayNumber = index - startOffset + 1;



    if (dayNumber < 1 || dayNumber > totalDays) return null;



    return new Date(month.getFullYear(), month.getMonth(), dayNumber);



  });







  const goPrev = () => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));



  const goNext = () => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));







  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });



  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const selectedTemps = useMemo(() => {
    if (!selectedDateKey) return [];
    return temps
      .filter((entry) => toLocalDateKey(entry.atISO) === selectedDateKey)
      .slice()
      .sort((a, b) => new Date(a.atISO).getTime() - new Date(b.atISO).getTime());
  }, [temps, selectedDateKey]);

  const selectedMeds = useMemo(() => {
    if (!selectedDateKey) return [];
    return meds
      .filter((entry) => toLocalDateKey(entry.atISO) === selectedDateKey)
      .slice()
      .sort((a, b) => new Date(a.atISO).getTime() - new Date(b.atISO).getTime());
  }, [meds, selectedDateKey]);

  const selectedLabel = selectedDateKey
    ? new Date(`${selectedDateKey}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      })
    : '';







  return (



    <div className="calendar">



      <div className="calendar-header">



        <h3>{monthLabel}</h3>



        <div className="calendar-actions">



          <button type="button" className="ghost" onClick={goPrev}>



            Prev



          </button>



          <button type="button" className="ghost" onClick={goNext}>



            Next



          </button>



        </div>



      </div>



      <div className="calendar-weekdays">

        {weekDays.map((day) => (

          <div key={day} className="calendar-weekday">

            {day}

          </div>

        ))}

      </div>

      <div className="calendar-grid">

        {days.map((day, index) => {



          if (!day) {



            return <div key={`empty-${index}`} className="calendar-cell empty" />;



          }



          const key = toLocalDateKey(day.toISOString());
          const mark = key ? marks.get(key) ?? { fever: false, med: false } : { fever: false, med: false };



          const isToday = toLocalDateKey(new Date().toISOString()) === key;



          return (
            <div
              key={key}
              className={`calendar-cell ${isToday ? 'today' : ''} ${
                selectedDateKey === key ? 'selected' : ''
              }`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedDateKey(key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedDateKey(key);
                }
              }}
            >



              <div className="calendar-date">{day.getDate()}</div>



              <div className="calendar-marks">



                {mark.fever && <span className="calendar-dot fever" />}



                {mark.med && <span className="calendar-dot med" />}



              </div>




            </div>



          );



        })}



      </div>

      {selectedDateKey && (
        <div className="calendar-day-panel">
          <div className="calendar-day-header">
            <h4>{selectedLabel}</h4>
            <button type="button" className="ghost" onClick={() => setSelectedDateKey(null)}>
              Close
            </button>
          </div>
          <div className="calendar-day-actions">
            <button type="button" className="ghost" onClick={() => onQuickAdd('temp')}>
              Add temp
            </button>
            <button type="button" className="ghost" onClick={() => onQuickAdd('symptom')}>
              Add symptoms
            </button>
            <button type="button" className="ghost" onClick={() => onQuickAdd('med')}>
              Add medication
            </button>
          </div>
          {selectedTemps.length === 0 && selectedMeds.length === 0 && (
            <p className="empty">No fever or medication entries for this day.</p>
          )}
          {selectedTemps.length > 0 && (
            <div className="calendar-day-section">
              <h5>Temperatures</h5>
              <div className="calendar-day-list">
                {selectedTemps.map((entry) => (
                  <div key={entry.id} className="calendar-day-item">
                    <span>{formatTime(entry.atISO)}</span>
                    <strong>{entry.tempC.toFixed(1)} C</strong>
                    {entry.note && <span>{entry.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectedMeds.length > 0 && (
            <div className="calendar-day-section">
              <h5>Medication</h5>
              <div className="calendar-day-list">
                {selectedMeds.map((entry) => (
                  <div key={entry.id} className="calendar-day-item">
                    <span>{formatTime(entry.atISO)}</span>
                    <strong>{entry.medName}</strong>
                    <span>{[entry.doseText, entry.route].filter(Boolean).join(' · ')}</span>
                    {entry.note && <span>{entry.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="calendar-legend">



        <span>



          <span className="calendar-dot fever" /> Fever {'>='} {FEVER_THRESHOLD.toFixed(1)} C



        </span>



        <span>



          <span className="calendar-dot med" /> Medication



        </span>



      </div>



    </div>



  );



};







type PersonViewProps = {



  member: Member;



  episodes: Episode[];

  temps: TempEntry[];

  meds: MedEntry[];

  medCourses: MedCourse[];

  symptoms: SymptomEntry[];

  catalog: MedCatalogItem[];

  initialSection?: MemberSection;

  onCreateEpisode: (member: Member) => Promise<void>;





  onDeleteEpisode: (episodeId: string) => Promise<void>;


  onAddTemp: (memberId: string, tempC: number, atISO: string, note: string, episodeId: string | null) => Promise<void>;



  onAddMed: (



    memberId: string,



    catalogItem: MedCatalogItem,



    doseText: string,



    atISO: string,



    route: string,



    note: string,



    episodeId: string | null



  ) => Promise<void>;

  onCreateMedCourse: (input: {
    memberId: string;
    catalogItem: MedCatalogItem;
    doseText: string;
    startAtISO: string;
    intervalHours: number;
    durationDays: number;
    route: string;
    note: string;
  }) => Promise<MedCourse | null>;

  onDeleteMedCourse: (courseId: string) => Promise<void>;

  onExportMedCourse: (course: MedCourse, member: Member) => void;

  onAddSymptom: (



    memberId: string,



    symptoms: string[],



    atISO: string,



    note: string,



    episodeId: string | null



  ) => Promise<void>;



  onUpdateTemp: (entryId: string, updates: Partial<TempEntry>) => Promise<void>;



  onUpdateMed: (entryId: string, updates: Partial<MedEntry>) => Promise<void>;



  onUpdateSymptom: (entryId: string, updates: Partial<SymptomEntry>) => Promise<void>;



  onDeleteTemp: (entryId: string) => Promise<void>;



  onDeleteMed: (entryId: string) => Promise<void>;



  onDeleteSymptom: (entryId: string) => Promise<void>;



  onUpsertCatalog: (name: string) => Promise<MedCatalogItem | null>;



  onExport: (member: Member) => void;



  onNavigate: (hash: string) => void;



};







const PersonView = ({



  member,



  episodes,



  temps,



  meds,



  medCourses,



  symptoms,



  catalog,



  initialSection,



  onCreateEpisode,





  onDeleteEpisode,
  onAddTemp,



  onAddMed,

  onCreateMedCourse,
  onDeleteMedCourse,
  onExportMedCourse,



  onAddSymptom,



  onUpdateTemp,



  onUpdateMed,



  onUpdateSymptom,



  onDeleteTemp,



  onDeleteMed,



  onDeleteSymptom,



  onUpsertCatalog,



  onExport,



  onNavigate



}: PersonViewProps) => {



  const accentStyle: CSSProperties = {
    '--member-accent': member.accentColor,
    '--member-tint': toMemberTint(member.accentColor),
    '--member-accent-ink': toMemberInk(member.accentColor)
  } as CSSProperties;

  const handleEpisodeDelete = (episodeId: string) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Delete this illness episode- Linked logs will remain but lose their association.')
    )
      return;
    onDeleteEpisode(episodeId);
  };



  const [section, setSection] = useState<MemberSection>(initialSection ?? 'medication');
  const reduceMotion = useReducedMotion();







  useEffect(() => {
    setSection(initialSection ?? 'medication');
  }, [member.id, initialSection]);







  const memberEpisodes = useMemo(
    () =>
      episodes
        .filter((episode) => episode.memberId === member.id && !episode.deletedAtISO)
        .sort((a, b) => new Date(b.startedAtISO).getTime() - new Date(a.startedAtISO).getTime()),
    [episodes, member.id]
  );

  const ongoingEpisode = useMemo(
    () => memberEpisodes.find((episode) => !episode.endedAtISO) ?? null,
    [memberEpisodes]
  );

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>('medication');

  const setSectionAndRoute = (next: MemberSection) => {
    setSection(next);
    onNavigate(`#person=${member.id}&section=${next}`);
  };

  const openComposer = (mode: ComposerMode) => {
    setComposerMode(mode);
    const nextSection: MemberSection =
      mode === 'medication' ? 'medication' : mode === 'temperature' ? 'temperature' : 'symptoms';
    setSectionAndRoute(nextSection);
    setComposerOpen(true);
  };

  const handleQuickAdd = (type: 'temp' | 'symptom' | 'med') => {
    if (type === 'temp') {
      openComposer('temperature');
      return;
    }
    if (type === 'symptom') {
      openComposer('symptoms');
      return;
    }
    openComposer('medication');
  };







  const memberTemps = useMemo(
    () => temps.filter((entry) => entry.memberId === member.id && !entry.deletedAtISO),
    [temps, member.id]
  );



  const memberMeds = useMemo(
    () => meds.filter((entry) => entry.memberId === member.id && !entry.deletedAtISO),
    [meds, member.id]
  );

  const quickMedicationChoices = useMemo(() => {
    const seen = new Set<string>();
    const choices: string[] = [];
    memberMeds
      .slice()
      .sort((a, b) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime())
      .forEach((entry) => {
        const name = entry.medName.trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        choices.push(name);
      });
    return choices.slice(0, 5);
  }, [memberMeds]);

  const memberCourses = useMemo(
    () =>
      medCourses
        .filter((course) => course.memberId === member.id && !course.deletedAtISO)
        .sort((a, b) => new Date(b.startAtISO).getTime() - new Date(a.startAtISO).getTime()),
    [medCourses, member.id]
  );



  const memberSymptoms = useMemo(
    () => symptoms.filter((entry) => entry.memberId === member.id && !entry.deletedAtISO),
    [symptoms, member.id]
  );

  const episodeInsights = useMemo(() => {
    return memberEpisodes.map((episode) => {
      const linkedTemps = memberTemps.filter((entry) => entry.episodeId === episode.id);
      const avgTemp = linkedTemps.length
        ? linkedTemps.reduce((sum, entry) => sum + entry.tempC, 0) / linkedTemps.length
        : null;
      const feverDays = new Set(
        linkedTemps
          .filter((entry) => entry.tempC >= FEVER_THRESHOLD)
          .map((entry) => toLocalDateKey(entry.atISO))
          .filter(Boolean)
      ).size;
      return {
        episode,
        avgTemp,
        feverDays,
        tempCount: linkedTemps.length
      };
    });
  }, [memberEpisodes, memberTemps]);

  const avgTempOverall = useMemo(() => {
    if (memberTemps.length === 0) return null;
    const sum = memberTemps.reduce((acc, entry) => acc + entry.tempC, 0);
    return sum / memberTemps.length;
  }, [memberTemps]);

  const feverDaysOverall = useMemo(() => {
    const days = new Set(
      memberTemps
        .filter((entry) => entry.tempC >= FEVER_THRESHOLD)
        .map((entry) => toLocalDateKey(entry.atISO))
        .filter(Boolean)
    );
    return days.size;
  }, [memberTemps]);

  const medFrequency = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const map = new Map<string, number>();
    memberMeds
      .filter((entry) => new Date(entry.atISO) >= cutoff)
      .forEach((entry) => {
        const key = entry.medName.trim() || 'Unknown';
        map.set(key, (map.get(key) ?? 0) + 1);
      });
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, value: count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [memberMeds]);

  const medCountLast30 = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return memberMeds.filter((entry) => new Date(entry.atISO) >= cutoff).length;
  }, [memberMeds]);

  const avgTempByEpisode = useMemo(
    () =>
      episodeInsights
        .filter((item) => item.avgTemp !== null)
        .slice(0, 6)
        .map((item) => ({
          label: item.episode.category,
          value: Number((item.avgTemp ?? 0).toFixed(1)),
          meta: formatDate(item.episode.startedAtISO)
        })),
    [episodeInsights]
  );

  const feverDaysByEpisode = useMemo(
    () =>
      episodeInsights
        .filter((item) => item.feverDays > 0)
        .slice(0, 6)
        .map((item) => ({
          label: item.episode.category,
          value: item.feverDays,
          meta: formatDate(item.episode.startedAtISO)
        })),
    [episodeInsights]
  );

  const downloadSvg = (id: string, filename: string) => {
    if (typeof document === 'undefined') return;
    const svg = document.getElementById(id) as SVGSVGElement | null;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadInsights = () => {
    const safeName = member.name.trim().replace(/[^a-zA-Z0-9-_]+/g, '-');
    const base = safeName || 'member';
    downloadSvg('insight-avg-temp', `our-health-${base}-avg-temp.svg`);
    downloadSvg('insight-fever-days', `our-health-${base}-fever-days.svg`);
    downloadSvg('insight-med-frequency', `our-health-${base}-med-frequency.svg`);
  };








  return (



    <section className={`panel person-panel member-section-${section}`} style={accentStyle}>



      <div className="panel-header">



        <div>



          <h2>{member.name}</h2>



          <p className="member-label">Member dashboard</p>
          {ongoingEpisode && (
            <button
              type="button"
              className="episode-pill"
              onClick={() => onNavigate(`#episode=${ongoingEpisode.id}`)}
            >
              Ongoing: {ongoingEpisode.category}
            </button>
          )}



        </div>



        <div className="panel-actions">



          <button type="button" className="ghost" onClick={() => onExport(member)}>



            Export Excel (combined + sheets)



          </button>



          <button type="button" className="ghost" onClick={() => onNavigate('#home')}>



            Back



          </button>



        </div>



      </div>







      <div className="quick-add">
        <button
          type="button"
          className="primary"
          onClick={() => openComposer('medication')}
        >
          + Medication
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => openComposer('temperature')}
        >
          + Temperature
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => openComposer('symptoms')}
        >
          + Symptoms
        </button>
        <span className="quick-add-hint">Fast logging opens in a compact bottom sheet.</span>
      </div>

      <WorkspaceSectionNav active={section} onChange={setSectionAndRoute} />

      <LogComposerSheet
        open={composerOpen}
        mode={composerMode}
        member={member}
        episodes={memberEpisodes}
        catalog={catalog}
        recentMedicationChoices={quickMedicationChoices}
        defaultEpisodeId={ongoingEpisode?.id ?? null}
        onOpenChange={setComposerOpen}
        onAddTemp={onAddTemp}
        onAddMed={onAddMed}
        onAddSymptom={onAddSymptom}
        onUpsertCatalog={onUpsertCatalog}
      />







      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`member-section-${section}`}
          className="workspace-section"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
        >
          {section === 'medication' && (
            <div className="log-columns single-column">
              <div className="log-block">
                <div className="section-header">
                  <h3>Medication</h3>
                  <p>Stored in your Drive catalog.</p>
                </div>
                <MedicationCourseSection
                  member={member}
                  catalog={catalog}
                  courses={memberCourses}
                  onUpsertCatalog={onUpsertCatalog}
                  onCreateCourse={onCreateMedCourse}
                  onDeleteCourse={onDeleteMedCourse}
                  onExportCourse={onExportMedCourse}
                />
                {memberMeds.length === 0 && (
                  <div className="empty-state">
                    <p className="empty">No medication entries yet.</p>
                    <button type="button" className="ghost" onClick={() => openComposer('medication')}>
                      Add first medication
                    </button>
                  </div>
                )}
                <MedLogList
                  entries={memberMeds}
                  episodes={memberEpisodes}
                  onUpdate={onUpdateMed}
                  onDelete={onDeleteMed}
                  onUpsertCatalog={onUpsertCatalog}
                />
              </div>
            </div>
          )}

          {section === 'temperature' && (
            <div className="log-columns single-column">
              <div className="log-block">
                <div className="section-header">
                  <h3>Temperatures</h3>
                  <p>Fever threshold: {FEVER_THRESHOLD.toFixed(1)} C</p>
                </div>
                <TemperatureChart entries={memberTemps} />
                {memberTemps.length === 0 && (
                  <div className="empty-state">
                    <p className="empty">No temperature entries yet.</p>
                    <button type="button" className="ghost" onClick={() => openComposer('temperature')}>
                      Add first temperature
                    </button>
                  </div>
                )}
                <TempLogList
                  entries={memberTemps}
                  episodes={memberEpisodes}
                  onUpdate={onUpdateTemp}
                  onDelete={onDeleteTemp}
                />
              </div>
            </div>
          )}

          {section === 'symptoms' && (
            <div className="log-columns single-column">
              <div className="log-block">
              <div className="section-header">
                <h3>Symptoms</h3>
                <p>Logged separately from illnesses. Use Edit to link or unlink any symptom entry.</p>
              </div>
                {memberSymptoms.length === 0 && (
                  <div className="empty-state">
                    <p className="empty">No symptom entries yet.</p>
                    <button type="button" className="ghost" onClick={() => openComposer('symptoms')}>
                      Add first symptoms
                    </button>
                  </div>
                )}
                <SymptomLogList
                  entries={memberSymptoms}
                  episodes={memberEpisodes}
                  onUpdate={onUpdateSymptom}
                  onDelete={onDeleteSymptom}
                />
              </div>
            </div>
          )}

          {section === 'calendar' && (
            <CalendarView member={member} temps={memberTemps} meds={memberMeds} onQuickAdd={handleQuickAdd} />
          )}

          {section === 'more' && (
            <div className="insights">
              <div className="insight-summary">
                <div className="insight-card">
                  <div className="insight-label">Average temp</div>
                  <div className="insight-value">
                    {avgTempOverall !== null ? `${avgTempOverall.toFixed(1)} C` : '-'}
                  </div>
                  <div className="insight-sub">{memberTemps.length} readings</div>
                </div>
                <div className="insight-card">
                  <div className="insight-label">Fever days</div>
                  <div className="insight-value">{feverDaysOverall}</div>
                  <div className="insight-sub">Temp {'>='} {FEVER_THRESHOLD.toFixed(1)} C</div>
                </div>
                <div className="insight-card">
                  <div className="insight-label">Meds (30 days)</div>
                  <div className="insight-value">{medCountLast30}</div>
                  <div className="insight-sub">Last 30 days</div>
                </div>
              </div>

              <div className="insight-actions">
                <button type="button" className="ghost" onClick={handleDownloadInsights}>
                  Download charts (SVG)
                </button>
                <span className="insight-note">Charts export as SVG for Excel or Keynote.</span>
              </div>

              <div className="insight-grid">
                <div className="insight-card">
                  <MiniBarChart
                    id="insight-avg-temp"
                    title="Avg temp by illness"
                    data={avgTempByEpisode}
                    valueSuffix=" C"
                    emptyLabel="No linked temperatures yet."
                  />
                </div>
                <div className="insight-card">
                  <MiniBarChart
                    id="insight-fever-days"
                    title="Fever days by illness"
                    data={feverDaysByEpisode}
                    emptyLabel="No fever days yet."
                  />
                </div>
                <div className="insight-card">
                  <MiniBarChart
                    id="insight-med-frequency"
                    title="Meds in last 30 days"
                    data={medFrequency}
                    emptyLabel="No meds in last 30 days."
                  />
                </div>
              </div>
            </div>
          )}

          {section === 'illness' && (
            <div className="episode-list">
              <div className="section-header">
                <h3>Illness episodes</h3>
                <button type="button" className="primary" onClick={() => onCreateEpisode(member)}>
                  Add illness
                </button>
              </div>

              {memberEpisodes.length === 0 && <p className="empty">No illness episodes yet.</p>}

              {memberEpisodes.map((episode) => (
                <div key={episode.id} className="episode-card">
                  <div>
                    <div className="episode-title">{episode.category}</div>
                    <div className="episode-sub">
                      <span className="episode-meta">Severity {episode.severity}</span>
                      <span className="episode-meta episode-status">
                        {episode.endedAtISO ? `Closed ${formatDate(episode.endedAtISO)}` : 'Ongoing'}
                      </span>
                    </div>
                  </div>

                  <div className="episode-actions">
                    <button type="button" className="ghost" onClick={() => onNavigate(`#episode=${episode.id}`)}>
                      Open
                    </button>
                    <button type="button" className="ghost" onClick={() => handleEpisodeDelete(episode.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>



    </section>



  );



};

const MemberWorkspace = PersonView;







type EpisodeViewProps = {



  episode: Episode;



  member: Member;



  episodesForMember: Episode[];



  temps: TempEntry[];



  meds: MedEntry[];



  symptoms: SymptomEntry[];



  catalog: MedCatalogItem[];





  onDeleteEpisode: (episodeId: string) => Promise<void>;
  onUpdateEpisode: (episodeId: string, updates: Partial<Episode>) => Promise<void>;



  onAddTemp: (memberId: string, tempC: number, atISO: string, note: string, episodeId: string | null) => Promise<void>;



  onAddMed: (



    memberId: string,



    catalogItem: MedCatalogItem,



    doseText: string,



    atISO: string,



    route: string,



    note: string,



    episodeId: string | null



  ) => Promise<void>;



  onAddSymptom: (



    memberId: string,



    symptoms: string[],



    atISO: string,



    note: string,



    episodeId: string | null



  ) => Promise<void>;



  onUpdateTemp: (entryId: string, updates: Partial<TempEntry>) => Promise<void>;



  onUpdateMed: (entryId: string, updates: Partial<MedEntry>) => Promise<void>;



  onUpdateSymptom: (entryId: string, updates: Partial<SymptomEntry>) => Promise<void>;



  onDeleteTemp: (entryId: string) => Promise<void>;



  onDeleteMed: (entryId: string) => Promise<void>;



  onDeleteSymptom: (entryId: string) => Promise<void>;



  onUpsertCatalog: (name: string) => Promise<MedCatalogItem | null>;



  onToggleFavorite: (itemId: string) => Promise<void>;



  onNavigate: (hash: string) => void;



};







const EpisodeView = ({



  episode,



  member,



  episodesForMember,



  temps,



  meds,



  symptoms,



  catalog,





  onDeleteEpisode,
  onUpdateEpisode,
  onAddTemp,



  onAddMed,



  onAddSymptom,



  onUpdateTemp,



  onUpdateMed,



  onUpdateSymptom,



  onDeleteTemp,



  onDeleteMed,



  onDeleteSymptom,



  onUpsertCatalog,



  onToggleFavorite,



  onNavigate



}: EpisodeViewProps) => {



  const [category, setCategory] = useState(episode.category);



  const [severity, setSeverity] = useState(String(episode.severity));



  const [notes, setNotes] = useState(episode.notes);



  const [startDate, setStartDate] = useState(toLocalDateInput(episode.startedAtISO));







  useEffect(() => {



    setCategory(episode.category);



    setSeverity(String(episode.severity));



    setNotes(episode.notes);



    setStartDate(toLocalDateInput(episode.startedAtISO));



  }, [episode.category, episode.severity, episode.notes, episode.startedAtISO]);







  const handleEpisodeSave = async () => {



    await onUpdateEpisode(episode.id, {



      category: category.trim() || 'Illness',



      severity: Math.min(5, Math.max(1, Number(severity) || 3)),



      notes,



      startedAtISO: toISOFromDate(startDate)



    });



  };







  const handleDelete = async () => {



    if (!window.confirm('Delete this illness episode- Entries that link to it will stay in the log.')) return;

    await onDeleteEpisode(episode.id);



    onNavigate(`#person=${episode.memberId}`);



  };







  const episodeTemps = temps.filter((entry) => entry.episodeId === episode.id && !entry.deletedAtISO);



  const episodeMeds = meds.filter((entry) => entry.episodeId === episode.id && !entry.deletedAtISO);



  const episodeSymptoms = symptoms.filter((entry) => entry.episodeId === episode.id && !entry.deletedAtISO);

  const episodeFieldPrefix = `${episode.memberId}-${episode.id}`;

  const focusEpisodeField = (type: 'temp' | 'symptom' | 'med') => {
    if (typeof document === 'undefined') return;
    const fieldId =
      type === 'temp'
        ? `temp-value-${episodeFieldPrefix}`
        : type === 'symptom'
        ? `symptom-text-${episodeFieldPrefix}`
        : `med-name-${episodeFieldPrefix}`;
    const scrollId =
      type === 'temp'
        ? `temp-form-${episodeFieldPrefix}`
        : type === 'symptom'
        ? `symptom-form-${episodeFieldPrefix}`
        : `med-form-${episodeFieldPrefix}`;
    const scrollTarget = document.getElementById(scrollId) ?? document.getElementById(fieldId);
    if (scrollTarget) {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (type === 'temp') return;
    const el = document.getElementById(fieldId) as HTMLInputElement | null;
    if (el) {
      el.focus();
      if (typeof el.select === 'function') {
        el.select();
      }
    }
  };







  return (
    <div className="episode-view">
      <section className="panel">



      <div className="panel-header">



        <div>



          <h2>{member?.name ?? 'Episode'}</h2>


          <p className="episode-info">

            <span>Started {formatDate(episode.startedAtISO)}</span>

            <span className="episode-status">

              {episode.endedAtISO ? `Closed ${formatDate(episode.endedAtISO)}` : 'Ongoing'}

            </span>

          </p>



        </div>



        <div className="panel-actions">



          <button type="button" className="ghost" onClick={() => onNavigate(`#person=${episode.memberId}`)}>



            Back



          </button>



          <button



            type="button"



            className="ghost"



            onClick={() =>



              onUpdateEpisode(episode.id, {



                endedAtISO: episode.endedAtISO ? null : nowISO()



              })



            }



          >



 {episode.endedAtISO ? 'Reopen' : 'Close'}



          </button>



          <button type="button" className="ghost" onClick={handleDelete}>



            Delete



          </button>



        </div>



      </div>







      <div className="section">



        <h3>Illness details</h3>



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



            Start date



            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />



          </label>



          <label className="full">



            Notes



            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />



          </label>



        </div>



        <button type="button" className="primary" onClick={handleEpisodeSave}>



          Save illness



        </button>



      </div>







      {member && (



        <div className="section">
          <div className="quick-add episode-quick-add">
            <button type="button" className="primary" onClick={() => focusEpisodeField('temp')}>
              + Temp
            </button>
            <button type="button" className="ghost" onClick={() => focusEpisodeField('symptom')}>
              + Symptoms
            </button>
            <button type="button" className="ghost" onClick={() => focusEpisodeField('med')}>
              + Medication
            </button>
            <span className="quick-add-hint">Quick add to this illness.</span>
          </div>

          <LogEntryForms



            heading="Add entries linked to this illness"



            member={member}



            episodes={episodesForMember}
            temps={temps.filter((entry) => entry.memberId === member.id)}
            symptoms={symptoms.filter((entry) => entry.memberId === member.id)}



            meds={meds.filter((entry) => entry.memberId === member.id)}



            catalog={catalog}



            onAddTemp={onAddTemp}



            onAddMed={onAddMed}



            onAddSymptom={onAddSymptom}



            onUpsertCatalog={onUpsertCatalog}



            onToggleFavorite={onToggleFavorite}



            lockEpisodeId={episode.id}
            idPrefix={episodeFieldPrefix}



          />



        </div>



      )}







      <div className="section">



        <div className="section-header">



          <h3>Linked temperature entries</h3>



          <p>{episodeTemps.length} entries</p>



        </div>



        <TempLogList entries={episodeTemps} episodes={episodesForMember} onUpdate={onUpdateTemp} onDelete={onDeleteTemp} />



      </div>







      <div className="section">



        <div className="section-header">



          <h3>Linked medications</h3>



          <p>{episodeMeds.length} entries</p>



        </div>



        <MedLogList



          entries={episodeMeds}



          episodes={episodesForMember}



          onUpdate={onUpdateMed}



          onDelete={onDeleteMed}



          onUpsertCatalog={onUpsertCatalog}



        />



      </div>







      <div className="section">



        <div className="section-header">



          <h3>Linked symptoms</h3>



          <p>{episodeSymptoms.length} entries</p>



        </div>



        <SymptomLogList



          entries={episodeSymptoms}



          episodes={episodesForMember}



          onUpdate={onUpdateSymptom}



          onDelete={onDeleteSymptom}



        />



      </div>



      </section>
      <div className="episode-sticky">
        <button type="button" className="primary" onClick={() => onNavigate(`#person=${episode.memberId}`)}>
          Back to {member?.name ?? 'member'}
        </button>
      </div>
    </div>



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



  onCreateInMyDrive: () => Promise<void>;



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



  onCreateInMyDrive,



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



          <button



            type="button"



            className="ghost"



            onClick={onCreateInMyDrive}



            disabled={!drive.connected || drive.busy}



          >



            Create files in My Drive (no folder selection)



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



                Set `VITE_GOOGLE_APP_ID` to your Google Cloud project number (Console {'>'} Project info) before creating shared files.



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
                  className="member-color-input"
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
  const [lastMemberId, setLastMemberId] = useState<string | null>(null);

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [saveToast, setSaveToast] = useState<string | null>(null);
  const saveToastTimer = useRef<number | null>(null);







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



  const folderPickerFallbackNotice =



    'Folder picker results may be limited to Shared drives; use the "Create files in My Drive" fallback and move the files into your shared folder later.';



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

  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
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







  const handleCreateInMyDrive = async () => {



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



      const householdTemplate = emptyHousehold();



      const logTemplate = emptyLog();



      const householdResult = await createDriveJsonFile(null, 'household.json', householdTemplate);



      const logResult = await createDriveJsonFile(null, 'our-health-log.json', logTemplate);



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



      setFolderNotice(



        'Created household.json and our-health-log.json in My Drive. Move them into your shared folder later and the file IDs will stay the same.'



      );



      setLastSyncISO(nowISO());



      await refreshDriveAccount();



    } catch (err) {



      setDriveMessage((err as Error).message);



      if (annotateDeveloperKeyError(err)) {



        return;



      }



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



      const text = (err as Error).message;



      if (text.includes('No folder selected') || text.includes('Picker closed')) {



        setFolderNotice(folderPickerFallbackNotice);



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



      const currentData = ensureLogData(logState.data);



      const next = ensureLogData(updater({ ...currentData, lastUpdatedAtISO: nowISO() }));



      setLogState((prev) => (prev ? { ...prev, data: next } : prev));



      const result = await saveLogToDrive(logState, next);



      setLogState(result.state);



      setLastSyncISO(nowISO());

      if (saveToastTimer.current) {
        window.clearTimeout(saveToastTimer.current);
      }
      setSaveToast('Saved');
      saveToastTimer.current = window.setTimeout(() => setSaveToast(null), 1500);

      if (saveToastTimer.current) {
        window.clearTimeout(saveToastTimer.current);
      }
      setSaveToast('Saved');
      saveToastTimer.current = window.setTimeout(() => setSaveToast(null), 1500);



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

  const medCourses = logState?.data.medCourses ?? emptyLog().medCourses;

  const symptoms = logState?.data.symptoms ?? emptyLog().symptoms;

  const catalog = logState?.data.medCatalog ?? emptyLog().medCatalog;



  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  useEffect(() => {
    if (route.page === 'person') {
      setLastMemberId(route.memberId);
      return;
    }
    if (route.page === 'episode') {
      const episode = episodes.find((item) => item.id === route.episodeId);
      if (episode) {
        setLastMemberId(episode.memberId);
      }
    }
  }, [route.page, route.memberId, route.episodeId, episodes]);

  const navMemberId = useMemo(() => {
    if (route.page === 'person') return route.memberId;
    if (route.page === 'episode') {
      return episodes.find((item) => item.id === route.episodeId)?.memberId ?? lastMemberId;
    }
    return lastMemberId;
  }, [route.page, route.memberId, route.episodeId, episodes, lastMemberId]);

  const primaryMemberId = members[0]?.id ?? null;

  const navMemberIdFixed = navMemberId ?? primaryMemberId;

  const activeMemberSection: MemberSection | null =
    route.page === 'person' ? route.section ?? 'medication' : null;







  const navigate = (hash: string) => {
    if (typeof window === 'undefined') return;
    const normalized = hash.startsWith('#') ? hash : `#${hash}`;
    const nextRoute = routeFromHashString(normalized);
    setRoute(nextRoute);
    if (window.location.hash !== normalized) {
      window.location.hash = normalized;
    }
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







  const addTempEntry = async (

    memberId: string,

    tempC: number,

    atISO: string,

    note: string,

    episodeId: string | null

  ) => {

    if (!logState) return;



    const now = nowISO();



    const entry: TempEntry = {

      id: createId(),

      memberId,

      episodeId: episodeId ?? null,

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



  const addMedEntry = async (

    memberId: string,

    catalogItem: MedCatalogItem,

    doseText: string,

    atISO: string,

    route: string,

    note: string,

    episodeId: string | null

  ) => {

    if (!logState) return;



    const now = nowISO();



    const entry: MedEntry = {

      id: createId(),

      memberId,

      episodeId: episodeId ?? null,

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



  const createMedCourse = async (input: {
    memberId: string;
    catalogItem: MedCatalogItem;
    doseText: string;
    startAtISO: string;
    intervalHours: number;
    durationDays: number;
    route: string;
    note: string;
  }): Promise<MedCourse | null> => {
    if (!logState) return null;
    const now = nowISO();
    const course: MedCourse = {
      id: createId(),
      memberId: input.memberId,
      medId: input.catalogItem.id,
      medName: input.catalogItem.name,
      doseText: input.doseText,
      route: input.route || undefined,
      startAtISO: input.startAtISO,
      intervalHours: Math.max(1, Math.round(input.intervalHours)),
      durationDays: Math.max(1, Math.round(input.durationDays)),
      note: input.note,
      createdAtISO: now,
      updatedAtISO: now
    };
    await updateLog((current) => ({
      ...current,
      medCourses: mergeById([course], current.medCourses)
    }));
    return course;
  };

  const deleteMedCourse = async (courseId: string) => {
    if (!logState) return;
    const now = nowISO();
    await updateLog((current) => ({
      ...current,
      medCourses: current.medCourses.map((course) =>
        course.id === courseId ? { ...course, deletedAtISO: now, updatedAtISO: now } : course
      )
    }));
  };

  const exportMedCourse = (course: MedCourse, member: Member) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const ics = buildCourseIcs(course, member.name);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeMember = sanitizeFilePart(member.name);
    const safeMed = sanitizeFilePart(course.medName);
    link.href = url;
    link.download = `our-health-${safeMember}-${safeMed}-course.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const addSymptomEntry = async (

    memberId: string,

    symptoms: string[],

    atISO: string,

    note: string,

    episodeId: string | null

  ) => {

    if (!logState) return;



    const now = nowISO();



    const entry: SymptomEntry = {

      id: createId(),

      memberId,

      episodeId: episodeId ?? null,

      symptoms,

      note,

      atISO,

      createdAtISO: now,

      updatedAtISO: now

    };

    await updateLog((current) => ({

      ...current,

      symptoms: mergeById([entry], current.symptoms)

    }));

  };



  const updateTempEntry = async (entryId: string, updates: Partial<TempEntry>) => {

    if (!logState) return;

    const now = nowISO();

    await updateLog((current) => ({

      ...current,

      temps: current.temps.map((entry) =>
        entry.id === entryId ? { ...entry, ...updates, updatedAtISO: now } : entry
      )

    }));

  };



  const updateMedEntry = async (entryId: string, updates: Partial<MedEntry>) => {

    if (!logState) return;

    const now = nowISO();

    await updateLog((current) => ({

      ...current,

      meds: current.meds.map((entry) =>
        entry.id === entryId ? { ...entry, ...updates, updatedAtISO: now } : entry
      )

    }));

  };



  const updateSymptomEntry = async (entryId: string, updates: Partial<SymptomEntry>) => {

    if (!logState) return;

    const now = nowISO();

    await updateLog((current) => ({

      ...current,

      symptoms: current.symptoms.map((entry) =>
        entry.id === entryId ? { ...entry, ...updates, updatedAtISO: now } : entry
      )

    }));

  };



  const deleteTempEntry = async (entryId: string) => {

    if (!logState) return;

    const now = nowISO();

    await updateLog((current) => ({

      ...current,

      temps: current.temps.map((entry) =>
        entry.id === entryId ? { ...entry, deletedAtISO: now, updatedAtISO: now } : entry
      )

    }));

  };



  const deleteMedEntry = async (entryId: string) => {

    if (!logState) return;

    const now = nowISO();

    await updateLog((current) => ({

      ...current,

      meds: current.meds.map((entry) =>
        entry.id === entryId ? { ...entry, deletedAtISO: now, updatedAtISO: now } : entry
      )

    }));

  };



  const deleteSymptomEntry = async (entryId: string) => {

    if (!logState) return;

    const now = nowISO();

    await updateLog((current) => ({

      ...current,

      symptoms: current.symptoms.map((entry) =>
        entry.id === entryId ? { ...entry, deletedAtISO: now, updatedAtISO: now } : entry
      )

    }));

  };



  const deleteEpisode = async (episodeId: string) => {

    if (!logState) return;

    const now = nowISO();

    await updateLog((current) => ({

      ...current,

      episodes: current.episodes.map((episode) =>
        episode.id === episodeId ? { ...episode, deletedAtISO: now, updatedAtISO: now } : episode
      ),

      temps: current.temps.map((entry) =>
        entry.episodeId === episodeId ? { ...entry, episodeId: null, updatedAtISO: now } : entry
      ),

      meds: current.meds.map((entry) =>
        entry.episodeId === episodeId ? { ...entry, episodeId: null, updatedAtISO: now } : entry
      ),

      symptoms: current.symptoms.map((entry) =>
        entry.episodeId === episodeId ? { ...entry, episodeId: null, updatedAtISO: now } : entry
      )

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







  const exportMemberToExcel = (member: Member) => {

    const memberEpisodes = episodes.filter((episode) => episode.memberId === member.id && !episode.deletedAtISO);

    const memberTemps = temps.filter((entry) => entry.memberId === member.id && !entry.deletedAtISO);

    const memberMeds = meds.filter((entry) => entry.memberId === member.id && !entry.deletedAtISO);

    const memberSymptoms = symptoms.filter((entry) => entry.memberId === member.id && !entry.deletedAtISO);



    const episodeMap = new Map(memberEpisodes.map((episode) => [episode.id, episode]));

    const episodeLabel = (episodeId: string | null | undefined) => {

      if (!episodeId) return '';

      const episode = episodeMap.get(episodeId);

      if (!episode) return '';

      return `${episode.category} (${formatDate(episode.startedAtISO)})`;

    };



    const toDate = (iso: string | null) => (iso ? toLocalDateKey(iso) : '');

    const toTime = (iso: string | null) => (iso ? toLocalTimeInput(iso) : '');



    const combinedRows = [] as Array<Record<string, string | number>>;

    memberEpisodes.forEach((episode) => {

      combinedRows.push({

        Type: 'Illness',

        Date: toDate(episode.startedAtISO),

        Time: '',

        Category: episode.category,

        TemperatureC: '',

        Medication: '',

        Dose: '',

        Route: '',

        Symptoms: '',

        Episode: '',

        Severity: episode.severity,

        EndDate: episode.endedAtISO ? toDate(episode.endedAtISO) : '',

        Notes: episode.notes

      });

    });

    memberTemps.forEach((entry) => {

      combinedRows.push({

        Type: 'Temperature',

        Date: toDate(entry.atISO),

        Time: toTime(entry.atISO),

        Category: '',

        TemperatureC: entry.tempC,

        Medication: '',

        Dose: '',

        Route: '',

        Symptoms: '',

        Episode: episodeLabel(entry.episodeId),

        Severity: '',

        EndDate: '',

        Notes: entry.note

      });

    });

    memberMeds.forEach((entry) => {

      combinedRows.push({

        Type: 'Medication',

        Date: toDate(entry.atISO),

        Time: toTime(entry.atISO),

        Category: '',

        TemperatureC: '',

        Medication: entry.medName,

        Dose: entry.doseText,

        Route: entry.route ?? '',

        Symptoms: '',

        Episode: episodeLabel(entry.episodeId),

        Severity: '',

        EndDate: '',

        Notes: entry.note

      });

    });

    memberSymptoms.forEach((entry) => {

      combinedRows.push({

        Type: 'Symptoms',

        Date: toDate(entry.atISO),

        Time: toTime(entry.atISO),

        Category: '',

        TemperatureC: '',

        Medication: '',

        Dose: '',

        Route: '',

        Symptoms: entry.symptoms.join(', '),

        Episode: episodeLabel(entry.episodeId),

        Severity: '',

        EndDate: '',

        Notes: entry.note

      });

    });



    combinedRows.sort((a, b) => {

      const aKey = new Date(`${a.Date}T${a.Time || '00:00'}`).getTime();

      const bKey = new Date(`${b.Date}T${b.Time || '00:00'}`).getTime();

      return aKey - bKey;

    });



    const temperatureRows = memberTemps.map((entry) => ({

      Date: toDate(entry.atISO),

      Time: toTime(entry.atISO),

      TempC: entry.tempC,

      Note: entry.note,

      Episode: episodeLabel(entry.episodeId)

    }));

    const medicationRows = memberMeds.map((entry) => ({

      Date: toDate(entry.atISO),

      Time: toTime(entry.atISO),

      Medication: entry.medName,

      Dose: entry.doseText,

      Route: entry.route ?? '',

      Note: entry.note,

      Episode: episodeLabel(entry.episodeId)

    }));

    const symptomRows = memberSymptoms.map((entry) => ({

      Date: toDate(entry.atISO),

      Time: toTime(entry.atISO),

      Symptoms: entry.symptoms.join(', '),

      Note: entry.note,

      Episode: episodeLabel(entry.episodeId)

    }));

    const episodeRows = memberEpisodes.map((episode) => ({

      Start: toDate(episode.startedAtISO),

      End: episode.endedAtISO ? toDate(episode.endedAtISO) : '',

      Category: episode.category,

      Severity: episode.severity,

      Notes: episode.notes

    }));



    const workbook = XLSX.utils.book_new();

    const combinedSheet = XLSX.utils.json_to_sheet(combinedRows, {

      header: [

        'Type',

        'Date',

        'Time',

        'Category',

        'TemperatureC',

        'Medication',

        'Dose',

        'Route',

        'Symptoms',

        'Episode',

        'Severity',

        'EndDate',

        'Notes'

      ]

    });

    XLSX.utils.book_append_sheet(workbook, combinedSheet, 'Combined');

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(temperatureRows), 'Temperatures');

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(medicationRows), 'Medications');

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(symptomRows), 'Symptoms');

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(episodeRows), 'Illnesses');



    const safeName = member.name.trim().replace(/[^a-zA-Z0-9-_]+/g, '-');

    const dateStamp = new Date().toISOString().slice(0, 10);

    XLSX.writeFile(workbook, `our-health-${safeName || 'member'}-${dateStamp}.xlsx`);

  };



  const householdReady = Boolean(householdState);



  const logReady = Boolean(logState);



  const hasFiles = householdReady && logReady;

  const getMemberLastActivityISO = (memberId: string): string | null => {
    const candidates: string[] = [];
    episodes
      .filter((episode) => episode.memberId === memberId && !episode.deletedAtISO)
      .forEach((episode) => {
        candidates.push(episode.startedAtISO);
        if (episode.endedAtISO) candidates.push(episode.endedAtISO);
      });
    temps
      .filter((entry) => entry.memberId === memberId && !entry.deletedAtISO)
      .forEach((entry) => candidates.push(entry.atISO));
    meds
      .filter((entry) => entry.memberId === memberId && !entry.deletedAtISO)
      .forEach((entry) => candidates.push(entry.atISO));
    symptoms
      .filter((entry) => entry.memberId === memberId && !entry.deletedAtISO)
      .forEach((entry) => candidates.push(entry.atISO));
    if (!candidates.length) return null;
    return candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  };







  const renderHome = () => (



    <section className="panel">



      <div className="panel-header">



        <div>



          <h2>People</h2>



          <p>Select a member to open their workspace.</p>



        </div>



        <button type="button" className="ghost" onClick={() => navigate('#settings')}>



          Settings



        </button>



      </div>



      <div className="people-grid">



        {members.map((member) => {
          const lastISO = getMemberLastActivityISO(member.id);
          const nowTs = Date.now();
          const cutoff = nowTs - 24 * 60 * 60 * 1000;
          const recentTemps = temps
            .filter(
              (entry) =>
                entry.memberId === member.id &&
                !entry.deletedAtISO &&
                new Date(entry.atISO).getTime() >= cutoff
            )
            .sort((a, b) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime());
          const recentMedMap = new Map<string, MedEntry>();
          meds.forEach((entry) => {
            if (entry.memberId !== member.id || entry.deletedAtISO) return;
            const at = new Date(entry.atISO).getTime();
            if (at < cutoff) return;
            const key = entry.medId || entry.medName.trim().toLowerCase();
            const previous = recentMedMap.get(key);
            if (!previous || new Date(previous.atISO).getTime() < at) {
              recentMedMap.set(key, entry);
            }
          });
          const recentMeds = Array.from(recentMedMap.values()).sort(
            (a, b) => new Date(b.atISO).getTime() - new Date(a.atISO).getTime()
          );
          return (



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



              <div className="person-chip-row">
                <span className="person-chip">
                  {episodes.filter((ep) => ep.memberId === member.id && !ep.deletedAtISO).length} illness
                </span>
                <span className="person-chip">
                  {recentMeds.length} meds (24h)
                </span>
                <span className="person-chip">
                  {recentTemps.length} temps (24h)
                </span>
              </div>
              <div className="person-sub">{lastISO ? `Last log ${formatPeopleCardDateTime(lastISO)}` : 'No logs yet'}</div>
              {recentMeds.length > 0 && (
                <div className="person-recent compact">
                  {recentMeds.slice(0, 2).map((entry) => (
                    <div key={entry.id} className="person-recent-item">
                      <span className="person-recent-label">{entry.medName}</span>
                      <span className="person-recent-time">
                        {formatRelativeTime(entry.atISO, new Date(nowTs))} ({formatTime(entry.atISO)})
                      </span>
                    </div>
                  ))}
                </div>
              )}



            </div>



          </button>



          );
        })}



      </div>



    </section>



  );







  const renderPerson = (memberId: string) => {

    const member = memberMap.get(memberId);

    if (!member) return <div className="panel">Person not found.</div>;

      return (

      <MemberWorkspace

        member={member}

        initialSection={route.section}

        episodes={episodes}

        temps={temps}

        meds={meds}

        medCourses={medCourses}

        symptoms={symptoms}

        catalog={catalog}

        onCreateEpisode={createEpisode}

        onDeleteEpisode={deleteEpisode}

        onAddTemp={addTempEntry}

        onAddMed={addMedEntry}

        onCreateMedCourse={createMedCourse}

        onDeleteMedCourse={deleteMedCourse}

        onExportMedCourse={exportMedCourse}

        onAddSymptom={addSymptomEntry}

        onUpdateTemp={updateTempEntry}

        onUpdateMed={updateMedEntry}

        onUpdateSymptom={updateSymptomEntry}

        onDeleteTemp={deleteTempEntry}

        onDeleteMed={deleteMedEntry}

        onDeleteSymptom={deleteSymptomEntry}

        onUpsertCatalog={upsertCatalogItem}

        onExport={exportMemberToExcel}

        onNavigate={navigate}

      />

    );

  };



  const renderEpisode = (episodeId: string) => {

    const episode = episodes.find((item) => item.id === episodeId && !item.deletedAtISO);

    if (!episode) return <div className="panel">Episode not found.</div>;

    const member = memberMap.get(episode.memberId);

    if (!member) return <div className="panel">Member not found.</div>;

    const episodesForMember = episodes.filter(
      (item) => item.memberId === episode.memberId && !item.deletedAtISO
    );

    return (

        <EpisodeView

        episode={episode}

          member={member}

        episodesForMember={episodesForMember}

        temps={temps}

        meds={meds}

          symptoms={symptoms}

          catalog={catalog}

          onDeleteEpisode={deleteEpisode}
          onUpdateEpisode={updateEpisode}

        onAddTemp={addTempEntry}

        onAddMed={addMedEntry}

        onAddSymptom={addSymptomEntry}

        onUpdateTemp={updateTempEntry}

        onUpdateMed={updateMedEntry}

        onUpdateSymptom={updateSymptomEntry}

        onDeleteTemp={deleteTempEntry}

        onDeleteMed={deleteMedEntry}

        onDeleteSymptom={deleteSymptomEntry}

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



        onCreateInMyDrive={handleCreateInMyDrive}



        onSaveMembers={handleSaveMembers}



        onNavigate={navigate}



        hasFiles={hasFiles}



    />



  );







  return (



    <div className="app-shell">



      <header className="topbar">



        <div className="topbar-head">



          <div>



            <div className="app-title">Our Health</div>



            <div className="topbar-status" aria-live="polite">



              <span className={`status-dot ${isOnline && drive.connected ? 'online' : 'offline'}`} />



              <div className="status-copy">



                <span className="status-label">



                  {isOnline ? (drive.connected ? 'Connected to Drive' : 'Drive not connected') : 'Offline'}



                </span>



                {driveAccountEmail && <span className="status-email">{driveAccountEmail}</span>}
                <span className="status-message">Autosave writes every change to Drive when online.</span>



                {!isOnline && <span className="status-message">Sync paused while offline.</span>}
                {drive.message && <span className="status-message">{drive.message}</span>}



              </div>



            </div>



          </div>



        </div>



        <div className="topbar-actions">
          <button
            type="button"
            className="ghost topbar-connect"
            onClick={handleConnect}
            disabled={drive.busy}
          >
            {drive.connected ? 'Reconnect' : 'Connect'}
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

      {saveToast && <div className="save-toast" role="status">{saveToast}</div>}

      <nav className="bottom-nav" aria-label="Primary">
        <button
          type="button"
          className={route.page === 'home' ? 'active' : ''}
          onClick={() => navigate('#home')}
        >
          People
        </button>
        <button
          type="button"
          className={route.page === 'person' ? 'active' : ''}
          onClick={() => navMemberIdFixed && navigate(`#person=${navMemberIdFixed}&section=${activeMemberSection ?? 'medication'}`)}
          disabled={!navMemberIdFixed}
        >
          Current Member
        </button>
        <button
          type="button"
          className={route.page === 'settings' ? 'active' : ''}
          onClick={() => navigate('#settings')}
        >
          Settings
        </button>
      </nav>

    </div>



  );



}
