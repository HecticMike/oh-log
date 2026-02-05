export const APP_NAME = 'Our Health';
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
export const GOOGLE_API_KEY: string = import.meta.env.VITE_GOOGLE_API_KEY ?? '';
export const GOOGLE_APP_ID: string = import.meta.env.VITE_GOOGLE_APP_ID ?? '';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const GOOGLE_CLIENT_ID_DEFINED = Boolean(GOOGLE_CLIENT_ID);
export const GOOGLE_API_KEY_DEFINED = Boolean(GOOGLE_API_KEY);
export const GOOGLE_API_KEY_MASKED = GOOGLE_API_KEY ? `****${GOOGLE_API_KEY.slice(-4)}` : 'not set';
