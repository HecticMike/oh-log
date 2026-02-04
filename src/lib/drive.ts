import { exportAllEventsAsJson, importEventsFromJson, type ExportedEvents } from './events';
import { setMeta, getMeta, setMetaNumber, getMetaNumber } from './db';
import { DRIVE_FILE_NAME, DRIVE_FOLDER_NAME, DRIVE_SCOPE, GOOGLE_CLIENT_ID } from '../config';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

let accessToken: string | null = null;

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

export type DriveStatus = {
  configured: boolean;
  connected: boolean;
  folderId?: string;
  fileId?: string;
  lastBackupAt?: number;
  lastRestoreAt?: number;
};

export function isDriveAvailable(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE');
}

function ensureClientId(): void {
  if (!isDriveAvailable()) {
    throw new Error('Google client ID is not configured. Paste it into src/config.ts.');
  }
}

function ensureGoogleScript(): void {
  if (!window?.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error('Google Identity Services is not loaded. Add https://accounts.google.com/gsi/client to index.html.');
  }
}

async function requestAccessToken(): Promise<string> {
  ensureClientId();
  ensureGoogleScript();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts!.oauth2!.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          if (response.error === 'access_denied') {
            reject(new Error('Access denied. Please allow PsA Logbook to use Google Drive.'));
            return;
          }
          reject(new Error(response.error_description ?? 'Google authorization failed.'));
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }
        accessToken = response.access_token;
        resolve(accessToken);
      }
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function ensureAccessToken(): Promise<string> {
  if (accessToken) {
    return accessToken;
  }
  return requestAccessToken();
}

async function fetchWithAuth(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await ensureAccessToken();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Offline. Check your network before using Google Drive.');
  }
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);

  try {
    const response = await fetch(input, { ...init, headers });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        body?.error?.message ||
        body?.error_description ||
        body?.error?.errors?.[0]?.message ||
        response.statusText;
      if (message?.includes('Access Not Configured') || message?.includes('Disabled')) {
        throw new Error('Google Drive API is not enabled. Enable it in the Cloud Console.');
      }
      throw new Error(message ?? `Google Drive request failed (${response.status}).`);
    }
    return response;
  } catch (err) {
    if (err instanceof Error && err.message.includes('Offline')) {
      throw err;
    }
    if (err instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      throw new Error('Offline. Check your network before using Google Drive.');
    }
    throw err;
  }
}

function createMultipartBody(metadata: Record<string, unknown>, content: string) {
  const boundary = `----psa-${Date.now()}`;
  const delimiter = `--${boundary}`;
  const closeDelimiter = `${delimiter}--`;
  const body =
    `${delimiter}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `${delimiter}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    `${content}\r\n` +
    `${closeDelimiter}\r\n`;
  return { boundary, body };
}

async function ensureFolder(): Promise<string> {
  const cached = await getMeta('driveFolderId');
  if (cached) {
    return cached;
  }
  const query = `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`;
  const list = await fetchDriveList(query);
  const folderId = list?.files?.[0]?.id;
  if (folderId) {
    await setMeta('driveFolderId', folderId);
    return folderId;
  }
  const response = await fetchWithAuth(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root']
    })
  });
  const data = await response.json();
  await setMeta('driveFolderId', data.id);
  return data.id;
}

async function ensureFile(folderId: string): Promise<string> {
  const cached = await getMeta('driveFileId');
  if (cached) {
    return cached;
  }
  const query = `name='${DRIVE_FILE_NAME}' and '${folderId}' in parents and trashed=false`;
  const list = await fetchDriveList(query);
  const fileId = list?.files?.[0]?.id;
  if (fileId) {
    await setMeta('driveFileId', fileId);
    return fileId;
  }
  const payload = await exportAllEventsAsJson();
  const { boundary, body } = createMultipartBody(
    {
      name: DRIVE_FILE_NAME,
      parents: [folderId],
      mimeType: 'application/json'
    },
    JSON.stringify(payload)
  );
  const response = await fetchWithAuth(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  const data = await response.json();
  await setMeta('driveFileId', data.id);
  return data.id;
}

async function fetchDriveList(query: string) {
  const encoded = encodeURIComponent(query);
  const url = `${DRIVE_API_BASE}/files?q=${encoded}&spaces=drive&fields=files(id,name)`;
  const response = await fetchWithAuth(url, { method: 'GET' });
  return response.json();
}

export async function connectDrive(): Promise<DriveStatus> {
  await requestAccessToken();
  return getDriveStatus();
}

export async function getDriveStatus(): Promise<DriveStatus> {
  const folderId = await getMeta('driveFolderId');
  const fileId = await getMeta('driveFileId');
  const lastBackupAt = await getMetaNumber('lastBackupAt');
  const lastRestoreAt = await getMetaNumber('lastRestoreAt');
  return {
    configured: isDriveAvailable(),
    connected: Boolean(accessToken),
    folderId: folderId ?? undefined,
    fileId: fileId ?? undefined,
    lastBackupAt: lastBackupAt ?? undefined,
    lastRestoreAt: lastRestoreAt ?? undefined
  };
}

export async function backupToDrive(): Promise<string> {
  const folderId = await ensureFolder();
  const fileId = await ensureFile(folderId);
  const payload = await exportAllEventsAsJson();
  const content = JSON.stringify(payload);
  const { boundary, body } = createMultipartBody(
    {
      name: DRIVE_FILE_NAME,
      parents: [folderId],
      mimeType: 'application/json'
    },
    content
  );
  await fetchWithAuth(`${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  await setMetaNumber('lastBackupAt', Date.now());
  return 'Backup complete';
}

export async function restoreFromDrive(): Promise<{ imported: number }> {
  const folderId = await ensureFolder();
  const fileId = await ensureFile(folderId);
  const response = await fetchWithAuth(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, { method: 'GET' });
  const json = (await response.json()) as ExportedEvents;
  const result = await importEventsFromJson(json);
  await setMetaNumber('lastRestoreAt', Date.now());
  return result;
}

export async function importJsonFile(contents: string): Promise<{ imported: number }> {
  const parsed = JSON.parse(contents) as ExportedEvents;
  return importEventsFromJson(parsed);
}

export async function exportJsonFile(): Promise<string> {
  const data = await exportAllEventsAsJson();
  return JSON.stringify(data, null, 2);
}
