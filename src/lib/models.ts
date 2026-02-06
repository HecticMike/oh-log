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
  deletedAtISO?: string | null;
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
  deletedAtISO?: string | null;
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
  deletedAtISO?: string | null;
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
  deletedAtISO?: string | null;
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
  const palette = ['#f9c5d1', '#fee3c7', '#fff6a5', '#d5e8d4', '#b2ebf2', '#c5d7ff', '#e2c9ff'];
  return palette[index % palette.length];
};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const normalizeMember = (value: Partial<Member>, index: number, fallbackISO: string): Member => {
  const now = fallbackISO || nowISO();
  const id = asString(value.id, `member-${index + 1}`);
  const name = asString(value.name, `Member ${index + 1}`);
  const accentColor = asString(value.accentColor, defaultAccent(index));
  const createdAtISO = asString(value.createdAtISO, asString(value.updatedAtISO, now));
  const updatedAtISO = asString(value.updatedAtISO, createdAtISO);
  return { id, name, accentColor, createdAtISO, updatedAtISO };
};

const normalizeEpisode = (value: Partial<Episode>, fallbackISO: string): Episode => {
  const now = fallbackISO || nowISO();
  const endedAtISO = typeof value.endedAtISO === 'string' ? value.endedAtISO : value.endedAtISO === null ? null : null;
  const createdAtISO = asString(value.createdAtISO, asString(value.updatedAtISO, now));
  const updatedAtISO = asString(value.updatedAtISO, createdAtISO);
  const deletedAtISO = typeof value.deletedAtISO === 'string' ? value.deletedAtISO : value.deletedAtISO === null ? null : null;
  return {
    id: asString(value.id, createId()),
    memberId: asString(value.memberId),
    category: asString(value.category, 'Illness'),
    symptoms: asArray<string>(value.symptoms).map((item) => asString(item)).filter(Boolean),
    severity: Math.min(5, Math.max(1, Math.round(asNumber(value.severity, 3)))),
    notes: asString(value.notes),
    startedAtISO: asString(value.startedAtISO, now),
    endedAtISO,
    createdAtISO,
    updatedAtISO,
    deletedAtISO
  };
};

const normalizeTemp = (value: Partial<TempEntry>, episodeMap: Map<string, string>, fallbackISO: string): TempEntry => {
  const now = fallbackISO || nowISO();
  const episodeId = typeof value.episodeId === 'string' ? value.episodeId : null;
  const memberFallback = episodeId ? episodeMap.get(episodeId) : undefined;
  const createdAtISO = asString(value.createdAtISO, asString(value.updatedAtISO, now));
  const updatedAtISO = asString(value.updatedAtISO, createdAtISO);
  const deletedAtISO = typeof value.deletedAtISO === 'string' ? value.deletedAtISO : value.deletedAtISO === null ? null : null;
  return {
    id: asString(value.id, createId()),
    memberId: asString(value.memberId, memberFallback ?? 'member-1'),
    episodeId,
    atISO: asString(value.atISO, now),
    tempC: asNumber(value.tempC, 37),
    note: asString(value.note),
    createdAtISO,
    updatedAtISO,
    deletedAtISO
  };
};

const normalizeMedCatalogItem = (value: Partial<MedCatalogItem>, fallbackISO: string): MedCatalogItem => {
  const now = fallbackISO || nowISO();
  const createdAtISO = asString(value.createdAtISO, asString(value.updatedAtISO, now));
  const updatedAtISO = asString(value.updatedAtISO, createdAtISO);
  return {
    id: asString(value.id, createId()),
    name: asString(value.name, 'Medication'),
    isFavorite: asBoolean(value.isFavorite, false),
    createdAtISO,
    updatedAtISO
  };
};

const normalizeMedEntry = (value: Partial<MedEntry>, episodeMap: Map<string, string>, fallbackISO: string): MedEntry => {
  const now = fallbackISO || nowISO();
  const episodeId = typeof value.episodeId === 'string' ? value.episodeId : null;
  const memberFallback = episodeId ? episodeMap.get(episodeId) : undefined;
  const createdAtISO = asString(value.createdAtISO, asString(value.updatedAtISO, now));
  const updatedAtISO = asString(value.updatedAtISO, createdAtISO);
  const deletedAtISO = typeof value.deletedAtISO === 'string' ? value.deletedAtISO : value.deletedAtISO === null ? null : null;
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
    createdAtISO,
    updatedAtISO,
    deletedAtISO
  };
};

const normalizeSymptomEntry = (
  value: Partial<SymptomEntry>,
  episodeMap: Map<string, string>,
  fallbackISO: string
): SymptomEntry => {
  const now = fallbackISO || nowISO();
  const episodeId = typeof value.episodeId === 'string' ? value.episodeId : null;
  const memberFallback = episodeId ? episodeMap.get(episodeId) : undefined;
  const createdAtISO = asString(value.createdAtISO, asString(value.updatedAtISO, now));
  const updatedAtISO = asString(value.updatedAtISO, createdAtISO);
  const deletedAtISO = typeof value.deletedAtISO === 'string' ? value.deletedAtISO : value.deletedAtISO === null ? null : null;
  return {
    id: asString(value.id, createId()),
    memberId: asString(value.memberId, memberFallback ?? 'member-1'),
    episodeId,
    symptoms: asArray<string>(value.symptoms).map((item) => asString(item)).filter(Boolean),
    note: asString(value.note),
    atISO: asString(value.atISO, now),
    createdAtISO,
    updatedAtISO,
    deletedAtISO
  };
};

export const ensureHousehold = (value: unknown): Household => {
  const fallback = emptyHousehold();
  if (!value || typeof value !== 'object') return fallback;
  const data = value as Partial<Household>;
  const householdUpdatedAtISO = asString(data.lastUpdatedAtISO, nowISO());
  const membersRaw = asArray<Partial<Member>>(data.members);
  const members = Array.from({ length: MEMBER_SLOTS }, (_, index) =>
    normalizeMember(membersRaw[index] ?? {}, index, householdUpdatedAtISO)
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    lastUpdatedAtISO: householdUpdatedAtISO,
    members
  };
};

export const ensureLogData = (value: unknown): LogData => {
  if (!value || typeof value !== 'object') return emptyLog();
  const data = value as Partial<LogData>;
  const logUpdatedAtISO = asString(data.lastUpdatedAtISO, nowISO());
  const episodes = asArray<Partial<Episode>>(data.episodes).map((episode) =>
    normalizeEpisode(episode, logUpdatedAtISO)
  );
  const episodeMap = new Map<string, string>(episodes.map((episode) => [episode.id, episode.memberId]));
  return {
    schemaVersion: SCHEMA_VERSION,
    lastUpdatedAtISO: logUpdatedAtISO,
    episodes,
    temps: asArray<Partial<TempEntry>>(data.temps).map((entry) =>
      normalizeTemp(entry, episodeMap, logUpdatedAtISO)
    ),
    meds: asArray<Partial<MedEntry>>(data.meds).map((entry) =>
      normalizeMedEntry(entry, episodeMap, logUpdatedAtISO)
    ),
    symptoms: asArray<Partial<SymptomEntry>>(data.symptoms).map((entry) =>
      normalizeSymptomEntry(entry, episodeMap, logUpdatedAtISO)
    ),
    medCatalog: asArray<Partial<MedCatalogItem>>(data.medCatalog).map((item) =>
      normalizeMedCatalogItem(item, logUpdatedAtISO)
    )
  };
};

const updatedAtValue = (value?: string | null) => (value ? new Date(value).getTime() : 0);
const deletedAtValue = (value?: string | null) => (value ? new Date(value).getTime() : 0);

export const mergeById = <T extends { id: string; updatedAtISO?: string | null; deletedAtISO?: string | null }>(
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
    const leftDeleted = deletedAtValue(item.deletedAtISO);
    const rightDeleted = deletedAtValue(existing.deletedAtISO);

    if (leftDeleted || rightDeleted) {
      if (leftDeleted && rightDeleted) {
        map.set(item.id, leftDeleted >= rightDeleted ? item : existing);
        return;
      }
      if (leftDeleted && leftDeleted >= rightUpdated) {
        map.set(item.id, item);
        return;
      }
      if (rightDeleted && rightDeleted >= leftUpdated) {
        map.set(item.id, existing);
        return;
      }
    }

    map.set(item.id, leftUpdated >= rightUpdated ? item : existing);
  });
  return Array.from(map.values());
};

export const mergeHousehold = (local: Household, remote: Household): Household => {
  const mergedMembers = mergeById(local.members, remote.members);
  const mergedUpdatedAtISO = nowISO();
  const members = Array.from({ length: MEMBER_SLOTS }, (_, index) =>
    normalizeMember(mergedMembers[index] ?? mergedMembers[0] ?? {}, index, mergedUpdatedAtISO)
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    lastUpdatedAtISO: mergedUpdatedAtISO,
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
