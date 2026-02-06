import { v4 as uuidv4 } from 'uuid';

export const SCHEMA_VERSION = 1;
export const MEMBER_SLOTS = 4;

export type Member = {
  id: string;
  name: string;
  accentColor: string;
  createdAtISO: string;
  updatedAtISO: string;
};

export type Household = {
  schemaVersion: number;
  lastUpdatedAtISO: string;
  members: Member[];
};

export type Episode = {
  id: string;
  memberId: string;
  category: string;
  symptoms: string[];
  severity: number;
  notes: string;
  startedAtISO: string;
  endedAtISO?: string | null;
  createdAtISO: string;
  updatedAtISO: string;
};

export type TempEntry = {
  id: string;
  memberId: string;
  episodeId?: string | null;
  atISO: string;
  tempC: number;
  note: string;
  createdAtISO: string;
  updatedAtISO: string;
};

export type MedCatalogItem = {
  id: string;
  name: string;
  isFavorite: boolean;
  createdAtISO: string;
  updatedAtISO: string;
};

export type MedEntry = {
  id: string;
  memberId: string;
  episodeId?: string | null;
  medId: string;
  medName: string;
  doseText: string;
  route?: string;
  note: string;
  atISO: string;
  createdAtISO: string;
  updatedAtISO: string;
};

export type SymptomEntry = {
  id: string;
  memberId: string;
  episodeId?: string | null;
  symptoms: string[];
  note: string;
  atISO: string;
  createdAtISO: string;
  updatedAtISO: string;
};

export type LogData = {
  schemaVersion: number;
  lastUpdatedAtISO: string;
  episodes: Episode[];
  temps: TempEntry[];
  meds: MedEntry[];
  symptoms: SymptomEntry[];
  medCatalog: MedCatalogItem[];
};

export const nowISO = () => new Date().toISOString();

export const createId = () => uuidv4();

export const emptyHousehold = (): Household => {
  const now = nowISO();
  return {
    schemaVersion: SCHEMA_VERSION,
    lastUpdatedAtISO: now,
    members: Array.from({ length: MEMBER_SLOTS }, (_, index) => ({
      id: `member-${index + 1}`,
      name: `Member ${index + 1}`,
      accentColor: defaultAccent(index),
      createdAtISO: now,
      updatedAtISO: now
    }))
  };
};

export const emptyLog = (): LogData => ({
  schemaVersion: SCHEMA_VERSION,
  lastUpdatedAtISO: nowISO(),
  episodes: [],
  temps: [],
  meds: [],
  symptoms: [],
  medCatalog: []
});

export const defaultAccent = (index: number) => {
  const palette = ['#2F6B5F', '#D6724B', '#C6A24A', '#4B6EA8'];
  return palette[index % palette.length];
};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const normalizeMember = (value: Partial<Member>, index: number): Member => {
  const now = nowISO();
  const id = asString(value.id, `member-${index + 1}`);
  const name = asString(value.name, `Member ${index + 1}`);
  const accentColor = asString(value.accentColor, defaultAccent(index));
  const createdAtISO = asString(value.createdAtISO, now);
  const updatedAtISO = asString(value.updatedAtISO, createdAtISO);
  return { id, name, accentColor, createdAtISO, updatedAtISO };
};

const normalizeEpisode = (value: Partial<Episode>): Episode => {
  const now = nowISO();
  const endedAtISO = typeof value.endedAtISO === 'string' ? value.endedAtISO : value.endedAtISO === null ? null : null;
  return {
    id: asString(value.id, createId()),
    memberId: asString(value.memberId),
    category: asString(value.category, 'Illness'),
    symptoms: asArray<string>(value.symptoms).map((item) => asString(item)).filter(Boolean),
    severity: Math.min(5, Math.max(1, Math.round(asNumber(value.severity, 3)))),
    notes: asString(value.notes),
    startedAtISO: asString(value.startedAtISO, now),
    endedAtISO,
    createdAtISO: asString(value.createdAtISO, now),
    updatedAtISO: asString(value.updatedAtISO, now)
  };
};

const normalizeTemp = (value: Partial<TempEntry>, episodeMap: Map<string, string>): TempEntry => {
  const now = nowISO();
  const episodeId = typeof value.episodeId === 'string' ? value.episodeId : null;
  const memberFallback = episodeId ? episodeMap.get(episodeId) : undefined;
  return {
    id: asString(value.id, createId()),
    memberId: asString(value.memberId, memberFallback ?? 'member-1'),
    episodeId,
    atISO: asString(value.atISO, now),
    tempC: asNumber(value.tempC, 37),
    note: asString(value.note),
    createdAtISO: asString(value.createdAtISO, now),
    updatedAtISO: asString(value.updatedAtISO, now)
  };
};

const normalizeMedCatalogItem = (value: Partial<MedCatalogItem>): MedCatalogItem => {
  const now = nowISO();
  return {
    id: asString(value.id, createId()),
    name: asString(value.name, 'Medication'),
    isFavorite: asBoolean(value.isFavorite, false),
    createdAtISO: asString(value.createdAtISO, now),
    updatedAtISO: asString(value.updatedAtISO, now)
  };
};

const normalizeMedEntry = (value: Partial<MedEntry>, episodeMap: Map<string, string>): MedEntry => {
  const now = nowISO();
  const episodeId = typeof value.episodeId === 'string' ? value.episodeId : null;
  const memberFallback = episodeId ? episodeMap.get(episodeId) : undefined;
  return {
    id: asString(value.id, createId()),
    memberId: asString(value.memberId, memberFallback ?? 'member-1'),
    episodeId,
    medId: asString(value.medId),
    medName: asString(value.medName, 'Medication'),
    doseText: asString(value.doseText),
    route: asString(value.route),
    note: asString(value.note),
    atISO: asString(value.atISO, now),
    createdAtISO: asString(value.createdAtISO, now),
    updatedAtISO: asString(value.updatedAtISO, now)
  };
};

const normalizeSymptomEntry = (value: Partial<SymptomEntry>, episodeMap: Map<string, string>): SymptomEntry => {
  const now = nowISO();
  const episodeId = typeof value.episodeId === 'string' ? value.episodeId : null;
  const memberFallback = episodeId ? episodeMap.get(episodeId) : undefined;
  return {
    id: asString(value.id, createId()),
    memberId: asString(value.memberId, memberFallback ?? 'member-1'),
    episodeId,
    symptoms: asArray<string>(value.symptoms).map((item) => asString(item)).filter(Boolean),
    note: asString(value.note),
    atISO: asString(value.atISO, now),
    createdAtISO: asString(value.createdAtISO, now),
    updatedAtISO: asString(value.updatedAtISO, now)
  };
};

export const ensureHousehold = (value: unknown): Household => {
  const fallback = emptyHousehold();
  if (!value || typeof value !== 'object') return fallback;
  const data = value as Partial<Household>;
  const membersRaw = asArray<Partial<Member>>(data.members);
  const members = Array.from({ length: MEMBER_SLOTS }, (_, index) =>
    normalizeMember(membersRaw[index] ?? {}, index)
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    lastUpdatedAtISO: asString(data.lastUpdatedAtISO, nowISO()),
    members
  };
};

export const ensureLogData = (value: unknown): LogData => {
  if (!value || typeof value !== 'object') return emptyLog();
  const data = value as Partial<LogData>;
  const episodes = asArray<Partial<Episode>>(data.episodes).map(normalizeEpisode);
  const episodeMap = new Map<string, string>(episodes.map((episode) => [episode.id, episode.memberId]));
  return {
    schemaVersion: SCHEMA_VERSION,
    lastUpdatedAtISO: asString(data.lastUpdatedAtISO, nowISO()),
    episodes,
    temps: asArray<Partial<TempEntry>>(data.temps).map((entry) => normalizeTemp(entry, episodeMap)),
    meds: asArray<Partial<MedEntry>>(data.meds).map((entry) => normalizeMedEntry(entry, episodeMap)),
    symptoms: asArray<Partial<SymptomEntry>>(data.symptoms).map((entry) => normalizeSymptomEntry(entry, episodeMap)),
    medCatalog: asArray<Partial<MedCatalogItem>>(data.medCatalog).map(normalizeMedCatalogItem)
  };
};

const updatedAtValue = (value?: string) => (value ? new Date(value).getTime() : 0);

export const mergeById = <T extends { id: string; updatedAtISO?: string }>(
  left: T[],
  right: T[]
): T[] => {
  const map = new Map<string, T>();
  right.forEach((item) => map.set(item.id, item));
  left.forEach((item) => {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      return;
    }
    const leftUpdated = updatedAtValue(item.updatedAtISO);
    const rightUpdated = updatedAtValue(existing.updatedAtISO);
    map.set(item.id, leftUpdated >= rightUpdated ? item : existing);
  });
  return Array.from(map.values());
};

export const mergeHousehold = (local: Household, remote: Household): Household => {
  const mergedMembers = mergeById(local.members, remote.members);
  const members = Array.from({ length: MEMBER_SLOTS }, (_, index) =>
    normalizeMember(mergedMembers[index] ?? mergedMembers[0] ?? {}, index)
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    lastUpdatedAtISO: nowISO(),
    members
  };
};

export const mergeLogData = (local: LogData, remote: LogData): LogData => ({
  schemaVersion: SCHEMA_VERSION,
  lastUpdatedAtISO: nowISO(),
  episodes: mergeById(local.episodes, remote.episodes),
  temps: mergeById(local.temps, remote.temps),
  meds: mergeById(local.meds, remote.meds),
  symptoms: mergeById(local.symptoms, remote.symptoms),
  medCatalog: mergeById(local.medCatalog, remote.medCatalog)
});
