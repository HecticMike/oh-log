import { GOOGLE_API_KEY, GOOGLE_APP_ID, GOOGLE_CLIENT_ID, DRIVE_SCOPE } from '../config';

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

export type PickedDriveFile = {
  id: string;
  name: string;
};

export type DriveFileMeta = {
  id: string;
  name: string;
  etag: string;
  modifiedTime?: string;
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
      picker?: {
        ViewId: { DOCS: string; FOLDERS: string };
        DocsView: new (viewId: string) => {
          setMimeTypes: (types: string) => unknown;
          setIncludeFolders: (value: boolean) => unknown;
          setSelectFolderEnabled: (value: boolean) => unknown;
          setEnableDrives: (value: boolean) => unknown;
        };
        PickerBuilder: new () => {
          setAppId: (appId: string) => unknown;
          setDeveloperKey: (key: string) => unknown;
          setOAuthToken: (token: string) => unknown;
          setTitle: (title: string) => unknown;
          addView: (view: unknown) => unknown;
          setCallback: (callback: (data: PickerResponse) => void) => unknown;
          build: () => { setVisible: (value: boolean) => void };
        };
        Action: { PICKED: string; CANCEL: string };
        Response: { DOCUMENTS: string };
        Document: { ID: string; NAME: string };
      };
    };
    gapi?: {
      load: (api: string, options: { callback: () => void; onerror: () => void }) => void;
    };
  }
}

type PickerResponse = {
  action: string;
  docs?: Array<Record<string, string>>;
};

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

let accessToken: string | null = null;
let tokenClient: TokenClient | null = null;
let pickerLoaded = false;

export const isDriveConfigured = (): boolean =>
  Boolean(GOOGLE_CLIENT_ID && GOOGLE_API_KEY);

function ensureClientId(): void {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google client ID is not configured. Set VITE_GOOGLE_CLIENT_ID in .env.local.');
  }
}

function ensureApiKey(): void {
  if (!GOOGLE_API_KEY) {
    throw new Error('Google API key is not configured. Set VITE_GOOGLE_API_KEY in .env.local.');
  }
}

function ensureGoogleScript(): void {
  if (!window?.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error('Google Identity Services is not loaded. Add https://accounts.google.com/gsi/client to index.html.');
  }
}

function ensurePickerScript(): void {
  if (!window?.gapi?.load) {
    throw new Error('Google Picker API is not loaded. Add https://apis.google.com/js/api.js to index.html.');
  }
}

async function requestAccessToken(): Promise<string> {
  ensureClientId();
  ensureGoogleScript();

  return new Promise<string>((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error) {
            if (response.error === 'access_denied') {
              reject(new Error('Access denied. Please allow Our Health to use Google Drive.'));
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
    }
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function ensureAccessToken(): Promise<string> {
  if (accessToken) return accessToken;
  return requestAccessToken();
}

async function ensurePickerLoaded(): Promise<void> {
  if (pickerLoaded) return;
  ensureApiKey();
  ensurePickerScript();
  await new Promise<void>((resolve, reject) => {
    window.gapi!.load('picker', {
      callback: () => {
        pickerLoaded = true;
        resolve();
      },
      onerror: () => reject(new Error('Failed to load Google Picker.'))
    });
  });
}

async function fetchWithAuth(
  input: string,
  init: RequestInit = {},
  allowStatus: number[] = []
): Promise<Response> {
  const token = await ensureAccessToken();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Offline. Check your network before using Google Drive.');
  }
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);

  try {
    const response = await fetch(input, { ...init, headers });
    if (!response.ok && !allowStatus.includes(response.status)) {
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
  const boundary = `----our-health-${Date.now()}`;
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

export async function connectDrive(): Promise<void> {
  await requestAccessToken();
  await ensurePickerLoaded();
}

export async function pickDriveFile(title: string): Promise<PickedDriveFile> {
  ensureApiKey();
  await ensureAccessToken();
  await ensurePickerLoaded();

  return new Promise<PickedDriveFile>((resolve, reject) => {
    const pickerApi = (window as any).google.picker as any;
    const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setEnableDrives(true)
      .setMimeTypes('application/json');

    const builder = new pickerApi.PickerBuilder()
      .setDeveloperKey(GOOGLE_API_KEY)
      .setOAuthToken(accessToken!)
      .setTitle(title)
      .addView(view)
      .setCallback((data: PickerResponse) => {
        const action = data.action;
        if (action === pickerApi.Action.CANCEL) {
          reject(new Error('Picker closed.'));
          return;
        }
        if (action === pickerApi.Action.PICKED) {
          const doc = data.docs?.[0];
          if (!doc) {
            reject(new Error('No file selected.'));
            return;
          }
          const id = doc.id ?? doc['id'];
          const name = doc.name ?? doc['name'];
          resolve({ id, name });
        }
      });

    if (GOOGLE_APP_ID) {
      builder.setAppId(GOOGLE_APP_ID);
    }

    builder.build().setVisible(true);
  });
}

export async function pickDriveFolder(title: string): Promise<PickedDriveFile> {
  ensureApiKey();
  await ensureAccessToken();
  await ensurePickerLoaded();

  return new Promise<PickedDriveFile>((resolve, reject) => {
    const pickerApi = (window as any).google.picker as any;
    const view = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setEnableDrives(true);

    const builder = new pickerApi.PickerBuilder()
      .setDeveloperKey(GOOGLE_API_KEY)
      .setOAuthToken(accessToken!)
      .setTitle(title)
      .addView(view)
      .setCallback((data: PickerResponse) => {
        const action = data.action;
        if (action === pickerApi.Action.CANCEL) {
          reject(new Error('Picker closed.'));
          return;
        }
        if (action === pickerApi.Action.PICKED) {
          const doc = data.docs?.[0];
          if (!doc) {
            reject(new Error('No folder selected.'));
            return;
          }
          const id = doc.id ?? doc['id'];
          const name = doc.name ?? doc['name'];
          resolve({ id, name });
        }
      });

    if (GOOGLE_APP_ID) {
      builder.setAppId(GOOGLE_APP_ID);
    }

    builder.build().setVisible(true);
  });
}

export async function createDriveJsonFile(
  folderId: string,
  filename: string,
  data: unknown
): Promise<{ data: unknown; meta: DriveFileMeta }> {
  const { boundary, body } = createMultipartBody(
    {
      name: filename,
      parents: [folderId],
      mimeType: 'application/json'
    },
    JSON.stringify(data)
  );
  const response = await fetchWithAuth(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,etag,modifiedTime`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  const meta = (await response.json()) as DriveFileMeta;
  return { data, meta };
}

export async function readDriveJson<T>(fileId: string): Promise<{ data: T; meta: DriveFileMeta }> {
  const metaResponse = await fetchWithAuth(
    `${DRIVE_API_BASE}/files/${fileId}?fields=id,name,etag,modifiedTime`,
    { method: 'GET' }
  );
  const meta = (await metaResponse.json()) as DriveFileMeta;
  const response = await fetchWithAuth(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, { method: 'GET' });
  const data = (await response.json()) as T;
  return { data, meta };
}

export async function writeDriveJson<T>(
  fileId: string,
  etag: string | null,
  nextData: T,
  merge: (local: T, remote: T) => T
): Promise<{ data: T; meta: DriveFileMeta; merged: boolean }> {
  const attempt = await fetchWithAuth(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media&fields=id,name,etag,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(etag ? { 'If-Match': etag } : {})
      },
      body: JSON.stringify(nextData)
    },
    [412]
  );

  if (attempt.status !== 412) {
    const meta = (await attempt.json()) as DriveFileMeta;
    return { data: nextData, meta, merged: false };
  }

  const latest = await readDriveJson<T>(fileId);
  const mergedData = merge(nextData, latest.data);
  const retry = await fetchWithAuth(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media&fields=id,name,etag,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': latest.meta.etag
      },
      body: JSON.stringify(mergedData)
    }
  );
  const meta = (await retry.json()) as DriveFileMeta;
  return { data: mergedData, meta, merged: true };
}
