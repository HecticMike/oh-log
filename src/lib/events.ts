import { v4 as uuid } from 'uuid';
import { db, type EventRecord } from './db';
import type { TimeframeKey } from './lookups';

export type { EventRecord };

export type EventFormValues = {
  startAt: number;
  endAt?: number | null;
  pain: number;
  region: string;
  regionKey?: string;
  jointKey?: string;
  symptomKey?: string;
  symptomCustom?: string;
  triggerKey?: string;
  triggerCustom?: string;
  actionKey?: string;
  actionCustom?: string;
  side?: '' | 'left' | 'right' | 'both';
  notes: string;
};

export type EventFilter = {
  days?: number;
  regionKey?: string;
  jointKey?: string;
  minPain?: number;
};

export type ExportOptions = {
  timeframe: TimeframeKey;
  regionKey?: string;
  jointKey?: string;
};

export type ExportedEvents = {
  schemaVersion: 1;
  exportedAt: number;
  options: ExportOptions;
  events: EventRecord[];
};

export async function createEvent(values: EventFormValues): Promise<EventRecord> {
  const now = Date.now();
  const event: EventRecord = {
    id: uuid(),
    ...values,
    side: values.side ?? '',
    createdAt: now,
    updatedAt: now
  };
  await db.events.add(event);
  return event;
}

export async function updateEvent(id: string, values: Partial<EventFormValues>): Promise<EventRecord> {
  const current = await db.events.get(id);
  if (!current) {
    throw new Error('Event not found');
  }
  const updatedAt = Date.now();
  const updated: EventRecord = {
    ...current,
    ...values,
    side: values.side ?? current.side ?? '',
    updatedAt
  };
  await db.events.put(updated);
  return updated;
}

export async function deleteEvent(id: string): Promise<void> {
  await db.events.delete(id);
}

export async function getEventById(id: string): Promise<EventRecord | undefined> {
  return db.events.get(id);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getTimeframeRange(timeframe: TimeframeKey): [number | null, number] {
  if (timeframe === 'all') {
    return [null, Date.now()];
  }
  const now = Date.now();
  let days = 0;
  switch (timeframe) {
    case 'year':
      days = 365;
      break;
    case 'm6':
      days = 183;
      break;
    case 'month':
      days = 30;
      break;
    case 'week':
      days = 7;
      break;
  }
  const start = now - days * DAY_MS;
  return [start, now];
}

function matchesFilter(event: EventRecord, filters: EventFilter): boolean {
  const { minPain = 0, days, regionKey, jointKey } = filters;
  if (event.pain < minPain) {
    return false;
  }
  if (typeof days === 'number' && days > 0) {
    const threshold = Date.now() - days * DAY_MS;
    if (event.startAt < threshold) {
      return false;
    }
  }
  if (regionKey && event.regionKey !== regionKey) {
    return false;
  }
  if (jointKey && event.jointKey !== jointKey) {
    return false;
  }
  return true;
}

export async function listEvents(filters: EventFilter = {}): Promise<EventRecord[]> {
  const allEvents = await db.events.toArray();
  const filtered = allEvents.filter((event) => matchesFilter(event, filters));
  return filtered.sort((a, b) => b.startAt - a.startAt);
}

export async function exportEventsAsJson(options: ExportOptions): Promise<string> {
  const events = await filterByExportOptions(options);
  const payload: ExportedEvents = {
    schemaVersion: 1,
    exportedAt: Date.now(),
    options,
    events
  };
  return JSON.stringify(payload, null, 2);
}

export async function exportEventsAsCsv(options: ExportOptions): Promise<string> {
  const events = await filterByExportOptions(options);
  const headers = [
    'id',
    'startAt',
    'endAt',
    'pain',
    'region',
    'regionKey',
    'jointKey',
    'symptomKey',
    'symptomCustom',
    'triggerKey',
    'triggerCustom',
    'actionKey',
    'actionCustom',
    'side',
    'notes'
  ];
  const rows = events.map((event) => {
    const start = new Date(event.startAt).toISOString();
    const end = event.endAt ? new Date(event.endAt).toISOString() : '';
    return [
      event.id,
      start,
      end,
      event.pain.toString(),
      event.region,
      event.regionKey ?? '',
      event.jointKey ?? '',
      event.symptomKey ?? '',
      event.symptomCustom ?? '',
      event.triggerKey ?? '',
      event.triggerCustom ?? '',
      event.actionKey ?? '',
      event.actionCustom ?? '',
      event.side ?? '',
      event.notes.replace(/\r?\n/g, '\\n')
    ]
      .map((value) => `"${value.replace(/"/g, '""')}"`)
      .join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

async function filterByExportOptions(options: ExportOptions): Promise<EventRecord[]> {
  const raw = await db.events.toArray();
  const [start, end] = getTimeframeRange(options.timeframe);
  const filtered = raw.filter((event) => {
    if (start !== null && event.startAt < start) {
      return false;
    }
    if (event.startAt > end) {
      return false;
    }
    if (options.regionKey && event.regionKey !== options.regionKey) {
      return false;
    }
    if (options.jointKey && event.jointKey !== options.jointKey) {
      return false;
    }
    return true;
  });
  return filtered.sort((a, b) => a.startAt - b.startAt);
}

export async function exportAllEventsAsJson(): Promise<ExportedEvents> {
  const payload: ExportedEvents = {
    schemaVersion: 1,
    exportedAt: Date.now(),
    options: { timeframe: 'all' },
    events: await db.events.toArray()
  };
  return payload;
}

export async function importEventsFromJson(payload: ExportedEvents): Promise<{ imported: number }> {
  if (!payload || !Array.isArray(payload.events)) {
    throw new Error('Invalid import payload');
  }
  let imported = 0;
  await db.transaction('rw', db.events, async () => {
    for (const incoming of payload.events) {
      if (!incoming.id) continue;
      const existing = await db.events.get(incoming.id);
      if (!existing) {
        await db.events.add(incoming);
        imported += 1;
        continue;
      }
      if ((incoming.updatedAt ?? incoming.createdAt ?? 0) > existing.updatedAt) {
        await db.events.put({
          ...existing,
          ...incoming,
          updatedAt: incoming.updatedAt ?? Date.now()
        });
        imported += 1;
      }
    }
  });
  return { imported };
}
