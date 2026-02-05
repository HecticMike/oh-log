import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { DRIVE_FILE_NAME, DRIVE_FOLDER_NAME } from './config';
import {
  createEvent,
  deleteEvent,
  exportEventsAsJson,
  exportEventsAsXlsx,
  listEvents,
  updateEvent,
  type EventRecord,
  type EventFormValues
} from './lib/events';
import { getMeta, setMeta } from './lib/db';
import {
  ACTION_OPTIONS,
  drilldownsFor,
  hasOtherSelected,
  jointsForRegion,
  labelForKey,
  OTHER_KEY,
  REGION_OPTIONS,
  SYMPTOM_OPTIONS,
  TIMEFRAME_OPTIONS,
  TRIGGER_OPTIONS,
  sideModeForSelection
} from './lib/lookups';
import type { DrillLevel, TimeframeKey } from './lib/lookups';
import {
  backupToDrive,
  connectDrive,
  getDriveStatus,
  isDriveAvailable,
  restoreFromDrive,
  type DriveStatus
} from './lib/drive';
import './index.css';

type LogFormState = {
  startAt: string;
  endAt: string;
  pain: number;
  regionLabel: string;
  regionKey: string;
  jointKey: string;
  symptomKey: string;
  symptomCustom: string;
  triggerKey: string;
  triggerCustom: string;
  actionKey: string;
  actionCustom: string;
  sideLeft: boolean;
  sideRight: boolean;
  drill1Key: string;
  drill1Custom: string;
  drill2Key: string;
  drill2Custom: string;
  notes: string;
};

type EventFilters = {
  days: number;
  regionKey?: string;
  jointKey?: string;
  minPain: number;
};

const DEFAULT_FORM: LogFormState = {
  startAt: '',
  endAt: '',
  pain: 5,
  regionLabel: '',
  regionKey: '',
  jointKey: '',
  symptomKey: SYMPTOM_OPTIONS[0].key,
  symptomCustom: '',
  triggerKey: '',
  triggerCustom: '',
  actionKey: '',
  actionCustom: '',
  sideLeft: false,
  sideRight: false,
  drill1Key: '',
  drill1Custom: '',
  drill2Key: '',
  drill2Custom: '',
  notes: ''
};

const toLocalInput = (value?: number) => {
  if (!value) {
    return new Date().toISOString().slice(0, 16);
  }
  return new Date(value).toISOString().slice(0, 16);
};

const initialForm = (regionKey = '', regionLabel = ''): LogFormState => ({
  ...DEFAULT_FORM,
  startAt: toLocalInput(),
  regionKey,
  regionLabel: regionLabel || (regionKey ? labelForKey(REGION_OPTIONS, regionKey) : '')
});

const toTimestamp = (value: string) => (value ? new Date(value).getTime() : Date.now());

function useEvents(filters: EventFilters) {
  const [events, setEvents] = useState<EventRecord[]>([]);

  const load = useCallback(async () => {
    const data = await listEvents(filters);
    setEvents(data);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  return { events, reload: load };
}

const deriveSide = (left: boolean, right: boolean): '' | 'left' | 'right' | 'both' => {
  if (left && right) return 'both';
  if (left) return 'left';
  if (right) return 'right';
  return '';
};

const sideLabel = (side: '' | 'left' | 'right' | 'both'): string => {
  switch (side) {
    case 'left':
      return 'Left';
    case 'right':
      return 'Right';
    case 'both':
      return 'Left & Right';
  default:
    return 'None';
  }
};

const formatDate = (value?: number) => (value ? new Date(value).toLocaleString() : '—');

const downloadTextFile = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const formatFilenameDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const drillLabelForEvent = (event: EventRecord, level: DrillLevel): string | null => {
  const key = level.field === 'drill1' ? event.drill1Key : event.drill2Key;
  const custom = level.field === 'drill1' ? event.drill1Custom : event.drill2Custom;
  if (!key) return null;
  if (key === OTHER_KEY) {
    if (custom && custom.trim()) {
      return custom.trim();
    }
    const otherOption = level.options.find((option) => option.key === OTHER_KEY);
    return otherOption?.label ?? 'Other';
  }
  const option = level.options.find((entry) => entry.key === key);
  return option ? option.label : key;
};

const jointHelperText = (regionKey: string, jointKey: string): string | null => {
  if (regionKey === 'hands' && jointKey === 'fingers') {
    return 'MCP = knuckle at the base · PIP = middle joint · DIP = joint closest to the fingertip · IP = thumb joint · CMC = thumb base near the wrist';
  }
  if (regionKey === 'feet' && jointKey === 'toes') {
    return 'MCP = knuckle at the base · PIP = middle joint · DIP = joint closest to the toe tip · IP = big toe joint · MTP = toe knuckle at the base';
  }
  return null;
};

export default function App() {
  const [rememberedRegionKey, setRememberedRegionKey] = useState('');
  const [form, setForm] = useState<LogFormState>(initialForm());
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EventFilters>({ days: 7, regionKey: undefined, jointKey: undefined, minPain: 0 });
  const { events, reload } = useEvents(filters);
  const [driveStatus, setDriveStatus] = useState<DriveStatus>({
    configured: isDriveAvailable(),
    connected: false
  });
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [isDriveBusy, setDriveBusy] = useState(false);
  const [backupTimeframe, setBackupTimeframe] = useState<TimeframeKey>('all');

  useEffect(() => {
    getMeta('lastUsedRegionKey').then((saved) => {
      if (saved) {
        setRememberedRegionKey(saved);
        setForm(initialForm(saved, labelForKey(REGION_OPTIONS, saved)));
      }
    });
  }, []);

  const jointOptions = useMemo(() => jointsForRegion(form.regionKey) ?? [], [form.regionKey]);
  const filterJointOptions = useMemo(
    () => jointsForRegion(filters.regionKey ?? '') ?? [],
    [filters.regionKey]
  );
  const drillLevels = useMemo(
    () => drilldownsFor(form.regionKey, form.jointKey),
    [form.regionKey, form.jointKey]
  );
  const sideMode = sideModeForSelection(form.regionKey, form.jointKey);
  const jointHelper = jointHelperText(form.regionKey, form.jointKey);
  const getDrillKey = (field: 'drill1' | 'drill2') =>
    field === 'drill1' ? form.drill1Key : form.drill2Key;
  const getDrillCustom = (field: 'drill1' | 'drill2') =>
    field === 'drill1' ? form.drill1Custom : form.drill2Custom;

  const handleFormChange = <K extends keyof LogFormState>(field: K, value: LogFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegionChange = (regionKey: string) => {
    setForm((prev) => ({
      ...prev,
      regionKey,
      regionLabel: regionKey ? labelForKey(REGION_OPTIONS, regionKey) : '',
      jointKey: '',
      sideLeft: prev.sideLeft,
      sideRight: prev.sideRight,
      drill1Key: '',
      drill1Custom: '',
      drill2Key: '',
      drill2Custom: ''
    }));
  };

  const handleJointChange = (jointKey: string) => {
    setForm((prev) => ({
      ...prev,
      jointKey,
      drill1Key: '',
      drill1Custom: '',
      drill2Key: '',
      drill2Custom: ''
    }));
  };

  const handleDrillChange = (field: 'drill1' | 'drill2', value: string) => {
    setForm((prev) => {
      const next = { ...prev };
      if (field === 'drill1') {
        next.drill1Key = value;
        next.drill1Custom = '';
        next.drill2Key = '';
        next.drill2Custom = '';
      } else {
        next.drill2Key = value;
        next.drill2Custom = '';
      }
      return next;
    });
  };

  const handleDrillCustomChange = (field: 'drill1' | 'drill2', value: string) => {
    setForm((prev) => {
      if (field === 'drill1') {
        return { ...prev, drill1Custom: value };
      }
      return { ...prev, drill2Custom: value };
    });
  };

  const rememberedRegionLabel = rememberedRegionKey ? labelForKey(REGION_OPTIONS, rememberedRegionKey) : '';

  useEffect(() => {
    if (sideMode === 'hide') {
      setForm((prev) => {
        if (!prev.sideLeft && !prev.sideRight) {
          return prev;
        }
        return { ...prev, sideLeft: false, sideRight: false };
      });
    }
  }, [sideMode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage(null);
    const payload: EventFormValues = {
      startAt: toTimestamp(form.startAt),
      endAt: form.endAt ? toTimestamp(form.endAt) : null,
      pain: form.pain,
      region: form.regionLabel || 'Unspecified region',
      regionKey: form.regionKey || undefined,
      jointKey: form.jointKey || undefined,
      symptomKey: form.symptomKey,
      symptomCustom: form.symptomCustom,
      triggerKey: form.triggerKey,
      triggerCustom: form.triggerCustom,
      actionKey: form.actionKey,
      actionCustom: form.actionCustom,
      side: sideMode === 'show' ? deriveSide(form.sideLeft, form.sideRight) : '',
      drill1Key: form.drill1Key || undefined,
      drill1Custom: form.drill1Custom,
      drill2Key: form.drill2Key || undefined,
      drill2Custom: form.drill2Custom,
      notes: form.notes
    };

    try {
      if (editingId) {
        await updateEvent(editingId, payload);
        setFormMessage('Event updated.');
        setEditingId(null);
      } else {
        await createEvent(payload);
        setFormMessage('Event saved.');
      }
      if (payload.regionKey) {
        await setMeta('lastUsedRegionKey', payload.regionKey);
        setRememberedRegionKey(payload.regionKey);
      }
      setForm(initialForm(payload.regionKey ?? '', payload.region));
      await reload();
    } catch (err) {
      setFormMessage((err as Error).message);
    }
  };

  const handleEdit = async (eventRecord: EventRecord) => {
    setEditingId(eventRecord.id);
    setForm({
      startAt: toLocalInput(eventRecord.startAt),
      endAt: eventRecord.endAt ? toLocalInput(eventRecord.endAt) : '',
      pain: eventRecord.pain,
      regionLabel: eventRecord.region,
      regionKey: eventRecord.regionKey ?? '',
      jointKey: eventRecord.jointKey ?? '',
      symptomKey: eventRecord.symptomKey ?? SYMPTOM_OPTIONS[0].key,
      symptomCustom: eventRecord.symptomCustom ?? '',
      triggerKey: eventRecord.triggerKey ?? TRIGGER_OPTIONS[0].key,
      triggerCustom: eventRecord.triggerCustom ?? '',
      actionKey: eventRecord.actionKey ?? ACTION_OPTIONS[0].key,
      actionCustom: eventRecord.actionCustom ?? '',
      sideLeft: eventRecord.side === 'left' || eventRecord.side === 'both',
      sideRight: eventRecord.side === 'right' || eventRecord.side === 'both',
      drill1Key: eventRecord.drill1Key ?? '',
      drill1Custom: eventRecord.drill1Custom ?? '',
      drill2Key: eventRecord.drill2Key ?? '',
      drill2Custom: eventRecord.drill2Custom ?? '',
      notes: eventRecord.notes
    });
    setFormMessage('Editing event. Submit to save.');
  };

  const handleDelete = async (eventRecord: EventRecord) => {
    if (!window.confirm('Delete this entry?')) {
      return;
    }
    await deleteEvent(eventRecord.id);
    await reload();
  };

  const handleFiltersChange = (updates: Partial<EventFilters>) => {
    setFilters((prev) => {
      const merged = { ...prev, ...updates };
      if (updates.regionKey) {
        merged.jointKey = undefined;
      }
      return merged;
    });
  };

  const baseTimeframeLabel = useMemo(() => {
    if (filters.days === 7) return 'Last 7 days';
    if (filters.days === 30) return 'Last 30 days';
    return 'All time';
  }, [filters.days]);

  const handleExportJson = async () => {
    const options = {
      timeframe: backupTimeframe,
      regionKey: filters.regionKey,
      jointKey: filters.jointKey
    };
    const payload = await exportEventsAsJson(options);
    downloadTextFile('psa-logbook-events.json', payload, 'application/json');
  };

  const handleExportExcel = async () => {
    const options = {
      timeframe: backupTimeframe,
      regionKey: filters.regionKey,
      jointKey: filters.jointKey
    };
    const blob = await exportEventsAsXlsx(options);
    const filename = `psa-logbook-${backupTimeframe}-${formatFilenameDate()}.xlsx`;
    downloadBlob(filename, blob);
  };

  const refreshDriveState = useCallback(async () => {
    try {
      const status = await getDriveStatus();
      setDriveStatus(status);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    refreshDriveState();
  }, [refreshDriveState]);

  const handleDriveAction = async (action: 'connect' | 'backup' | 'restore') => {
    setDriveBusy(true);
    setDriveMessage(null);
    try {
      if (action === 'connect') {
        await connectDrive();
        setDriveMessage('Connected to Google Drive.');
      } else if (action === 'backup') {
        await backupToDrive();
        setDriveMessage(`Backup saved at ${formatDate(Date.now())}.`);
      } else {
        const result = await restoreFromDrive();
        setDriveMessage(`Restored ${result.imported} records at ${formatDate(Date.now())}.`);
      }
    } catch (err) {
      setDriveMessage((err as Error).message);
    } finally {
      setDriveBusy(false);
      await refreshDriveState();
      await reload();
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="wordmark">PsA</div>
          <div className="subtitle">Logbook</div>
        </div>
        <div className="topbar-status">
          <span className={`badge ${driveStatus.connected ? 'badge-success' : 'badge-muted'}`}>
            {driveStatus.connected ? 'Drive connected' : 'Offline ready'}
          </span>
        </div>
      </header>
      <nav className="tabs">
        <a className="tab active" href="#log">
          Log
        </a>
        <a className="tab" href="#recent">
          Recent
        </a>
        <a className="tab" href="#backup">
          Backup
        </a>
      </nav>

      <section className="card" id="log">
        <div className="card-title">
          <div>
            <h2>Log</h2>
            <p>Quick entry. Defaults to now, pain 5, last used region.</p>
          </div>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Start
            <input
              type="datetime-local"
              required
              value={form.startAt}
              onChange={(event) => handleFormChange('startAt', event.target.value)}
            />
          </label>
          <label>
            End (optional)
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(event) => handleFormChange('endAt', event.target.value)}
            />
          </label>
          <label>
            Pain
            <input
              type="range"
              min={0}
              max={10}
              value={form.pain}
              onChange={(event) => handleFormChange('pain', Number(event.target.value))}
            />
            <span>{form.pain}/10</span>
          </label>
          <label>
            Region
            <select value={form.regionKey} onChange={(event) => handleRegionChange(event.target.value)}>
              <option value="">Select region</option>
              {REGION_OPTIONS.map((region) => (
                <option key={region.key} value={region.key}>
                  {region.label}
                </option>
              ))}
            </select>
          </label>
          {jointOptions.length > 0 && (
            <label>
              Joint
              <select value={form.jointKey} onChange={(event) => handleJointChange(event.target.value)}>
                <option value="">Select joint</option>
                {jointOptions.map((joint) => (
                  <option key={joint.key} value={joint.key}>
                    {joint.label}
                  </option>
                ))}
              </select>
              {jointHelper && <p className="helper-text">{jointHelper}</p>}
            </label>
          )}
          {drillLevels.map((level) => {
            const value = getDrillKey(level.field);
            const customValue = getDrillCustom(level.field);
            return (
              <label key={level.field}>
                {level.label}
                <select
                  value={value}
                  onChange={(event) => handleDrillChange(level.field, event.target.value)}
                >
                  <option value="">—</option>
                  {level.options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {value === OTHER_KEY && (
                  <input
                    type="text"
                    value={customValue}
                    placeholder="Describe other"
                    onChange={(event) => handleDrillCustomChange(level.field, event.target.value)}
                  />
                )}
              </label>
            );
          })}
          <label>
            Symptom type
            <select
              value={form.symptomKey}
              onChange={(event) => handleFormChange('symptomKey', event.target.value)}
            >
              {SYMPTOM_OPTIONS.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {hasOtherSelected(form.symptomKey) && (
            <label>
              Describe symptom
              <input
                type="text"
                value={form.symptomCustom}
                onChange={(event) => handleFormChange('symptomCustom', event.target.value)}
              />
            </label>
          )}
          <label>
            Trigger
            <select
              value={form.triggerKey}
              onChange={(event) => handleFormChange('triggerKey', event.target.value)}
            >
              <option value="">—</option>
              {TRIGGER_OPTIONS.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {hasOtherSelected(form.triggerKey) && (
            <label>
              Describe trigger
              <input
                type="text"
                value={form.triggerCustom}
                onChange={(event) => handleFormChange('triggerCustom', event.target.value)}
              />
            </label>
          )}
          <label>
            Action taken
            <select
              value={form.actionKey}
              onChange={(event) => handleFormChange('actionKey', event.target.value)}
            >
              <option value="">—</option>
              {ACTION_OPTIONS.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {hasOtherSelected(form.actionKey) && (
            <label>
              Describe action
              <input
                type="text"
                value={form.actionCustom}
                onChange={(event) => handleFormChange('actionCustom', event.target.value)}
              />
            </label>
          )}
          {sideMode === 'show' && (
            <div className="side-group">
              <p>Side</p>
              <label className="side-row">
                <input
                  type="checkbox"
                  checked={form.sideLeft}
                  onChange={(event) => handleFormChange('sideLeft', event.target.checked)}
                />
                Left
              </label>
              <label className="side-row">
                <input
                  type="checkbox"
                  checked={form.sideRight}
                  onChange={(event) => handleFormChange('sideRight', event.target.checked)}
                />
                Right
              </label>
            </div>
          )}
          <label className="full-width">
            Notes
            <textarea
              rows={4}
              value={form.notes}
              placeholder="Symptom details, treatments, mood..."
              onChange={(event) => handleFormChange('notes', event.target.value)}
            />
          </label>
          <div className="form-actions full-width">
            <button type="submit" className="primary">
              {editingId ? 'Update entry' : 'Save entry'}
            </button>
            {editingId && (
              <button
                type="button"
                className="ghost"
                onClick={() => setForm(initialForm(rememberedRegionKey, rememberedRegionLabel))}
              >
                Cancel
              </button>
            )}
          </div>
          {formMessage && <p className="message">{formMessage}</p>}
        </form>
      </section>

      <div className="card-grid">
        <section className="card" id="recent">
          <div className="card-title">
            <div>
              <h2>Recent</h2>
              <p>
                {baseTimeframeLabel} · {events.length} record{events.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="filters">
            <div>
              <label>
                Timeframe
                <select
                  value={filters.days}
                  onChange={(event) => handleFiltersChange({ days: Number(event.target.value) })}
                >
                  <option value={0}>All</option>
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Region
                <select
                  value={filters.regionKey ?? ''}
                  onChange={(event) =>
                    handleFiltersChange({ regionKey: event.target.value || undefined })
                  }
                >
                  <option value="">All regions</option>
                  {REGION_OPTIONS.map((region) => (
                    <option key={region.key} value={region.key}>
                      {region.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {filterJointOptions.length > 0 && (
              <div>
                <label>
                  Joint
                  <select
                    value={filters.jointKey ?? ''}
                    onChange={(event) =>
                      handleFiltersChange({ jointKey: event.target.value || undefined })
                    }
                  >
                    <option value="">All joints</option>
                    {filterJointOptions.map((joint) => (
                      <option key={joint.key} value={joint.key}>
                        {joint.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div>
              <label>
                Pain ≥ {filters.minPain}
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={filters.minPain}
                  onChange={(event) => handleFiltersChange({ minPain: Number(event.target.value) })}
                />
              </label>
            </div>
          </div>
          <div className="event-list">
            {events.length === 0 && <p className="empty-state">No entries yet.</p>}
            {events.map((eventRecord) => {
              const regionLabel = eventRecord.regionKey
                ? labelForKey(REGION_OPTIONS, eventRecord.regionKey)
                : eventRecord.region;
              const jointOptions = jointsForRegion(eventRecord.regionKey ?? '');
              const jointLabel = eventRecord.jointKey
                ? labelForKey(jointOptions ?? [], eventRecord.jointKey)
                : 'Unspecified joint';
              const drillLevelsForEvent = drilldownsFor(
                eventRecord.regionKey ?? '',
                eventRecord.jointKey ?? ''
              );
              const drillLabels = drillLevelsForEvent
                .map((level) => drillLabelForEvent(eventRecord, level))
                .filter((label): label is string => Boolean(label));
              return (
                <article className="event-card" key={eventRecord.id}>
                  <div>
                    <p className="event-date">{new Date(eventRecord.startAt).toLocaleString()}</p>
                    <p className="event-meta">
                      Pain {eventRecord.pain}/10 · {regionLabel || 'Unspecified region'} · {jointLabel}
                    </p>
                    {drillLabels.length > 0 && (
                      <p className="event-meta">Drilldown: {drillLabels.join(' · ')}</p>
                    )}
                    <p className="event-meta">
                      Symptom: {labelForKey(SYMPTOM_OPTIONS, eventRecord.symptomKey)}{' '}
                      {eventRecord.symptomCustom && `(${eventRecord.symptomCustom})`}
                    </p>
                    <p className="event-meta">
                      Trigger: {labelForKey(TRIGGER_OPTIONS, eventRecord.triggerKey)}{' '}
                      {eventRecord.triggerCustom && `(${eventRecord.triggerCustom})`}
                    </p>
                    <p className="event-meta">
                      Action: {labelForKey(ACTION_OPTIONS, eventRecord.actionKey)}{' '}
                      {eventRecord.actionCustom && `(${eventRecord.actionCustom})`}
                    </p>
                    <p className="event-meta">Side: {sideLabel(eventRecord.side ?? '')}</p>
                    {eventRecord.notes && <p className="event-notes">{eventRecord.notes}</p>}
                  </div>
                  <div className="event-actions">
                    <button type="button" onClick={() => handleEdit(eventRecord)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(eventRecord)}>
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card" id="backup">
          <div className="card-title">
            <div>
              <h2>Backup</h2>
              <p>Drive backup & restore + JSON/Excel export.</p>
            </div>
          </div>
          <div className="backup-grid">
          <div>
            <label>
              Export timeframe
              <select
                value={backupTimeframe}
                onChange={(event) => setBackupTimeframe(event.target.value as TimeframeKey)}
              >
                {TIMEFRAME_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p>Filters apply to JSON/CSV export.</p>
            <p>
              Status:{' '}
              <strong>
                {driveStatus.configured
                  ? driveStatus.connected
                    ? 'Connected'
                    : 'Configured (connect)'
                  : 'Not configured'}
              </strong>
            </p>
            <p>Last backup: {formatDate(driveStatus.lastBackupAt)}</p>
            <p>Last restore: {formatDate(driveStatus.lastRestoreAt)}</p>
          </div>
          <div className="backup-actions">
            <button type="button" onClick={handleExportJson} className="btn btn-secondary">
              Export JSON
            </button>
            <button type="button" onClick={handleExportExcel} className="btn btn-primary">
              Export Excel
            </button>
            <button
              type="button"
              disabled={!driveStatus.configured || driveStatus.connected || isDriveBusy}
              onClick={() => handleDriveAction('connect')}
            >
              Connect Google Drive
            </button>
            <button
              type="button"
              disabled={!driveStatus.connected || isDriveBusy}
              onClick={() => handleDriveAction('backup')}
            >
              Backup now
            </button>
            <button
              type="button"
              disabled={!driveStatus.connected || isDriveBusy}
              onClick={() => handleDriveAction('restore')}
            >
              Restore from Drive
            </button>
          </div>
          <div className="backup-note">
            <p>
              Google tokens stay in memory only. Folder <strong>{DRIVE_FOLDER_NAME}</strong> and file{' '}
              <strong>{DRIVE_FILE_NAME}</strong> are visible in your Drive.
            </p>
            <p>Drive is optional — the app works fully locally. Use backup buttons when ready.</p>
          </div>
        </div>
        {driveMessage && <p className="message">{driveMessage}</p>}
      </section>
    </div>
  </div>
  );
}
