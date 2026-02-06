import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

import * as XLSX from 'xlsx';

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







const formatDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '');
const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '');
const formatTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

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

const toMemberTint = (hex: string, alpha = 0.12) => {
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



      {episodes.map((episode) => (



        <option key={episode.id} value={episode.id}>



          {episode.category} Â· {formatDate(episode.startedAtISO)}



        </option>



      ))}



    </select>



  </label>



);







type LogEntryFormsProps = {



  member: Member;



  episodes: Episode[];



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



};







const LogEntryForms = ({



  member,



  episodes,



  meds,



  catalog,



  onAddTemp,



  onAddMed,



  onAddSymptom,



  onUpsertCatalog,



  onToggleFavorite,



  lockEpisodeId,



  heading



}: LogEntryFormsProps) => {



  const locked = typeof lockEpisodeId === 'string';



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



    setTempEpisodeId(null);



    setSymptomEpisodeId(null);



    setMedEpisodeId(null);



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



    setSelectedMedId(null);



  };







  return (



    <div className="log-quick">



      <div className="log-quick-header">



        <h3>{heading ?? 'Quick log'}</h3>



        <p>Log symptoms, temperature, and medication without linking to an illness.</p>



      </div>



      <div className="log-quick-grid">



        <div className="log-form">



          <h4>Temperature</h4>



          <div className="form-grid">



            <label>



              Temp (C)



              <input



                type="number"



                step="0.1"



                value={tempValue}



                onChange={(event) => setTempValue(event.target.value)}



                placeholder="37.6"



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



            {!locked && (



              <EpisodeLinkSelect episodes={episodes} value={tempEpisodeId} onChange={setTempEpisodeId} />



            )}



            <button type="button" className="primary" onClick={handleTempSubmit}>



              Add temperature



            </button>



          </div>



        </div>







        <div className="log-form">



          <h4>Symptoms</h4>



          <div className="form-grid">



            <label>



              Symptoms



              <input



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



          </div>



        </div>







        <div className="log-form">



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



  const [editingId, setEditingId] = useState<string | null>(null);



  const [editTemp, setEditTemp] = useState('');



  const [editDate, setEditDate] = useState('');



  const [editTime, setEditTime] = useState('');



  const [editNote, setEditNote] = useState('');



  const [editEpisodeId, setEditEpisodeId] = useState<string | null>(null);







  const startEdit = (entry: TempEntry) => {



    setEditingId(entry.id);



    setEditTemp(String(entry.tempC));



    setEditDate(toLocalDateInput(entry.atISO));



    setEditTime(toLocalTimeInput(entry.atISO));



    setEditNote(entry.note);



    setEditEpisodeId(entry.episodeId ?? null);



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







  if (sorted.length === 0) {



    return <p className="empty">No temperature entries yet.</p>;



  }







  return (



    <div className="log-list">



      {sorted.map((entry) => {



        const isEditing = editingId === entry.id;



        return (



          <div key={entry.id} className="log-row">



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



                  <span>



                    {formatDate(entry.atISO)} Â· {formatTime(entry.atISO)}



                  </span>



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



  const [editingId, setEditingId] = useState<string | null>(null);



  const [editName, setEditName] = useState('');



  const [editDose, setEditDose] = useState('');



  const [editRoute, setEditRoute] = useState('');



  const [editNote, setEditNote] = useState('');



  const [editDate, setEditDate] = useState('');



  const [editTime, setEditTime] = useState('');



  const [editEpisodeId, setEditEpisodeId] = useState<string | null>(null);







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







  if (sorted.length === 0) {



    return <p className="empty">No medication entries yet.</p>;



  }







  return (



    <div className="log-list">



      {sorted.map((entry) => {



        const isEditing = editingId === entry.id;



        return (



          <div key={entry.id} className="log-row">



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



                  <span>



                    {formatDate(entry.atISO)} Â· {formatTime(entry.atISO)}



                  </span>



                  <span>



                    {entry.doseText && `${entry.doseText} `}



                    {entry.route && `Â· ${entry.route}`}



                  </span>



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



  const [editingId, setEditingId] = useState<string | null>(null);



  const [editSymptoms, setEditSymptoms] = useState('');



  const [editNote, setEditNote] = useState('');



  const [editDate, setEditDate] = useState('');



  const [editTime, setEditTime] = useState('');



  const [editEpisodeId, setEditEpisodeId] = useState<string | null>(null);







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







  if (sorted.length === 0) {



    return <p className="empty">No symptom entries yet.</p>;



  }







  return (



    <div className="log-list">



      {sorted.map((entry) => {



        const isEditing = editingId === entry.id;



        return (



          <div key={entry.id} className="log-row">



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



                  <span>



                    {formatDate(entry.atISO)} Â· {formatTime(entry.atISO)}



                  </span>



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



  );



};







type CalendarViewProps = {



  member: Member;



  temps: TempEntry[];



  meds: MedEntry[];



};







const CalendarView = ({ member, temps, meds }: CalendarViewProps) => {



  const [month, setMonth] = useState(() => new Date());







  useEffect(() => {



    setMonth(new Date());



  }, [member.id]);







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



      <div className="calendar-grid">



        {weekDays.map((day) => (



          <div key={day} className="calendar-weekday">



            {day}



          </div>



        ))}



        {days.map((day, index) => {



          if (!day) {



            return <div key={`empty-${index}`} className="calendar-cell empty" />;



          }



          const key = toLocalDateKey(day.toISOString());
          const mark = key ? marks.get(key) ?? { fever: false, med: false } : { fever: false, med: false };



          const isToday = toLocalDateKey(new Date().toISOString()) === key;



          return (



 <div key={key} className={`calendar-cell ${isToday ? 'today' : ''}`}>



              <div className="calendar-date">{day.getDate()}</div>



              <div className="calendar-marks">



                {mark.fever && <span className="calendar-dot fever" />}



                {mark.med && <span className="calendar-dot med" />}



              </div>



            </div>



          );



        })}



      </div>



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



  symptoms: SymptomEntry[];



  catalog: MedCatalogItem[];



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



  onExport: (member: Member) => void;



  onNavigate: (hash: string) => void;



};







const PersonView = ({



  member,



  episodes,



  temps,



  meds,



  symptoms,



  catalog,



  onCreateEpisode,





  onDeleteEpisode,
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
      !window.confirm('Delete this illness episode? Linked logs will remain but lose their association.')
    )
      return;
    onDeleteEpisode(episodeId);
  };



  const [tab, setTab] = useState<'logs' | 'calendar' | 'illness'>('logs');







  useEffect(() => {



    setTab('logs');



  }, [member.id]);







  const memberEpisodes = useMemo(
    () =>
      episodes
        .filter((episode) => episode.memberId === member.id && !episode.deletedAtISO)
        .sort((a, b) => new Date(b.startedAtISO).getTime() - new Date(a.startedAtISO).getTime()),
    [episodes, member.id]
  );







  const memberTemps = useMemo(
    () => temps.filter((entry) => entry.memberId === member.id && !entry.deletedAtISO),
    [temps, member.id]
  );



  const memberMeds = useMemo(
    () => meds.filter((entry) => entry.memberId === member.id && !entry.deletedAtISO),
    [meds, member.id]
  );



  const memberSymptoms = useMemo(
    () => symptoms.filter((entry) => entry.memberId === member.id && !entry.deletedAtISO),
    [symptoms, member.id]
  );







  return (



    <section className="panel person-panel" style={accentStyle}>



      <div className="panel-header">



        <div>



          <h2>{member.name}</h2>



          <p className="member-label">Member dashboard</p>



        </div>



        <div className="panel-actions">



          <button type="button" className="ghost" onClick={() => onExport(member)}>



            Export Excel



          </button>



          <button type="button" className="ghost" onClick={() => onNavigate('#home')}>



            Back



          </button>



        </div>



      </div>







      <LogEntryForms



        member={member}



        episodes={memberEpisodes}



        meds={memberMeds}



        catalog={catalog}



        onAddTemp={onAddTemp}



        onAddMed={onAddMed}



        onAddSymptom={onAddSymptom}



        onUpsertCatalog={onUpsertCatalog}



        onToggleFavorite={onToggleFavorite}



      />







      <div className="tab-bar">



 <button type="button" className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>



          Logs



        </button>



 <button type="button" className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>



          Calendar



        </button>



 <button type="button" className={tab === 'illness' ? 'active' : ''} onClick={() => setTab('illness')}>



          Illnesses



        </button>



      </div>







      {tab === 'logs' && (



        <div className="log-columns">



          <div className="log-block">



            <div className="section-header">



              <h3>Temperatures</h3>



              <p>Fever threshold: {FEVER_THRESHOLD.toFixed(1)} C</p>



            </div>



            <TemperatureChart entries={memberTemps} />



            <TempLogList entries={memberTemps} episodes={memberEpisodes} onUpdate={onUpdateTemp} onDelete={onDeleteTemp} />



          </div>



          <div className="log-block">



            <div className="section-header">



              <h3>Medication</h3>



              <p>Stored in your Drive catalog.</p>



            </div>



            <MedLogList



              entries={memberMeds}



              episodes={memberEpisodes}



              onUpdate={onUpdateMed}



              onDelete={onDeleteMed}



              onUpsertCatalog={onUpsertCatalog}



            />



          </div>



          <div className="log-block">



            <div className="section-header">



              <h3>Symptoms</h3>



              <p>Logged separately from illnesses.</p>



            </div>



            <SymptomLogList



              entries={memberSymptoms}



              episodes={memberEpisodes}



              onUpdate={onUpdateSymptom}



              onDelete={onDeleteSymptom}



            />



          </div>



        </div>



      )}







      {tab === 'calendar' && <CalendarView member={member} temps={memberTemps} meds={memberMeds} />}







      {tab === 'illness' && (



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



    </section>



  );



};







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



    if (!window.confirm('Delete this illness episode? Entries that link to it will stay in the log.')) return;

    await onDeleteEpisode(episode.id);



    onNavigate(`#person=${episode.memberId}`);



  };







  const episodeTemps = temps.filter((entry) => entry.episodeId === episode.id && !entry.deletedAtISO);



  const episodeMeds = meds.filter((entry) => entry.episodeId === episode.id && !entry.deletedAtISO);



  const episodeSymptoms = symptoms.filter((entry) => entry.episodeId === episode.id && !entry.deletedAtISO);







  return (



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



          <LogEntryForms



            heading="Add entries linked to this illness"



            member={member}



            episodes={episodesForMember}



            meds={meds.filter((entry) => entry.memberId === member.id)}



            catalog={catalog}



            onAddTemp={onAddTemp}



            onAddMed={onAddMed}



            onAddSymptom={onAddSymptom}



            onUpsertCatalog={onUpsertCatalog}



            onToggleFavorite={onToggleFavorite}



            lockEpisodeId={episode.id}



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

  const symptoms = logState?.data.symptoms ?? emptyLog().symptoms;

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

    return (

      <PersonView

        member={member}

        episodes={episodes}

        temps={temps}

        meds={meds}

        symptoms={symptoms}

        catalog={catalog}

        onCreateEpisode={createEpisode}

        onDeleteEpisode={deleteEpisode}

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



              <span className={`status-dot ${drive.connected ? 'online' : 'offline'}`} />



              <div className="status-copy">



                <span className="status-label">



                  {drive.connected ? 'Connected to Drive' : 'Drive not connected'}



                </span>



                {driveAccountEmail && <span className="status-email">{driveAccountEmail}</span>}



                {drive.message && <span className="status-message">{drive.message}</span>}



              </div>



            </div>



          </div>



        </div>



        <div className="topbar-actions">



          <button type="button" className="ghost" onClick={() => navigate('#home')}>



            Home



          </button>



          <button type="button" className="ghost" onClick={() => navigate('#settings')}>



            Settings



          </button>



          <button

            type="button"

            className="ghost topbar-connect"

            onClick={handleConnect}

            disabled={drive.busy}

          >

            Reconnect

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
