import { readDriveJson, writeDriveJson, type DriveFileMeta } from './drive';
import { ensureHousehold, ensureLogData, mergeHousehold, mergeLogData, type Household, type LogData } from './models';

const HOUSEHOLD_FILE_KEY = 'our-health-household-file-id';
const LOG_FILE_KEY = 'our-health-log-file-id';

export type DriveFileState<T> = {
  fileId: string;
  name: string;
  etag: string;
  modifiedTime?: string;
  data: T;
};

export const getStoredHouseholdFileId = () => localStorage.getItem(HOUSEHOLD_FILE_KEY);
export const getStoredLogFileId = () => localStorage.getItem(LOG_FILE_KEY);

export const setStoredHouseholdFileId = (fileId: string | null) => {
  if (fileId) localStorage.setItem(HOUSEHOLD_FILE_KEY, fileId);
  else localStorage.removeItem(HOUSEHOLD_FILE_KEY);
};

export const setStoredLogFileId = (fileId: string | null) => {
  if (fileId) localStorage.setItem(LOG_FILE_KEY, fileId);
  else localStorage.removeItem(LOG_FILE_KEY);
};

const toState = <T>(meta: DriveFileMeta, data: T): DriveFileState<T> => ({
  fileId: meta.id,
  name: meta.name,
  etag: meta.etag,
  modifiedTime: meta.modifiedTime,
  data
});

export async function loadHouseholdFromDrive(fileId: string): Promise<DriveFileState<Household>> {
  const { data, meta } = await readDriveJson<Household>(fileId);
  return toState(meta, ensureHousehold(data));
}

export async function loadLogFromDrive(fileId: string): Promise<DriveFileState<LogData>> {
  const { data, meta } = await readDriveJson<LogData>(fileId);
  return toState(meta, ensureLogData(data));
}

export async function saveHouseholdToDrive(
  state: DriveFileState<Household>,
  next: Household
): Promise<{ state: DriveFileState<Household>; merged: boolean }> {
  const latest = await readDriveJson<Household>(state.fileId);
  const mergedData = mergeHousehold(ensureHousehold(next), ensureHousehold(latest.data));
  const result = await writeDriveJson<Household>(state.fileId, latest.meta.etag, mergedData, mergeHousehold);
  const hadRemoteChanges = latest.meta.etag !== state.etag;
  return { state: toState(result.meta, ensureHousehold(result.data)), merged: result.merged || hadRemoteChanges };
}

export async function saveLogToDrive(
  state: DriveFileState<LogData>,
  next: LogData
): Promise<{ state: DriveFileState<LogData>; merged: boolean }> {
  const latest = await readDriveJson<LogData>(state.fileId);
  const mergedData = mergeLogData(ensureLogData(next), ensureLogData(latest.data));
  const result = await writeDriveJson<LogData>(state.fileId, latest.meta.etag, mergedData, mergeLogData);
  const hadRemoteChanges = latest.meta.etag !== state.etag;
  return { state: toState(result.meta, ensureLogData(result.data)), merged: result.merged || hadRemoteChanges };
}
