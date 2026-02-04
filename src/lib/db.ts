import Dexie, { type Table } from 'dexie';

export type EventRecord = {
  id: string;
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
  createdAt: number;
  updatedAt: number;
};

export type MetaKey =
  | 'driveFolderId'
  | 'driveFileId'
  | 'lastBackupAt'
  | 'lastRestoreAt'
  | 'lastUsedRegion'
  | 'lastUsedRegionKey';

type MetaRecord = {
  key: MetaKey;
  value: string;
};

class PsALogbookDB extends Dexie {
  events!: Table<EventRecord, string>;
  meta!: Table<MetaRecord, MetaKey>;

  constructor() {
    super('psa-logbook-db');
    this.version(1).stores({
      events: 'id, startAt, region, pain, updatedAt',
      meta: 'key'
    });
    this.version(2).stores({
      events: 'id, startAt, region, pain, updatedAt',
      meta: 'key'
    });
  }
}

export const db = new PsALogbookDB();

export async function getMeta(key: MetaKey): Promise<string | null> {
  const record = await db.meta.get(key);
  return record?.value ?? null;
}

export async function setMeta(key: MetaKey, value: string | null): Promise<void> {
  if (value === null) {
    await db.meta.delete(key);
    return;
  }
  await db.meta.put({ key, value });
}

export async function getMetaNumber(key: MetaKey): Promise<number | null> {
  const value = await getMeta(key);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function setMetaNumber(key: MetaKey, value: number | null): Promise<void> {
  await setMeta(key, value === null ? null : value.toString());
}
