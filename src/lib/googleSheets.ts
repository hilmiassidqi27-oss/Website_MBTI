import { AssessmentSubmission } from '../types';
import { questions } from '../data/questions';
import { mbtiDetails } from '../data/mbtiData';
import defaultConfig from '../../firebase-applet-config.json';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: (err: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const STORAGE_KEY_TOKEN = 'dpp_mbti_gsheet_token';
const STORAGE_KEY_TOKEN_EXP = 'dpp_mbti_gsheet_token_exp';
const STORAGE_KEY_SPREADSHEET_ID = 'dpp_mbti_gsheet_id';

let tokenClient: any = null;

export const loadGisScript = (): Promise<void> => {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.getElementById('google-gis-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.body.appendChild(script);
  });
};

export const getStoredAccessToken = (): string | null => {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  const exp = localStorage.getItem(STORAGE_KEY_TOKEN_EXP);
  if (token && exp && Date.now() < parseInt(exp, 10)) {
    return token;
  }
  return null;
};

export const getStoredSpreadsheetId = (): string | null => {
  return localStorage.getItem(STORAGE_KEY_SPREADSHEET_ID);
};

export const setStoredSpreadsheetId = (id: string): void => {
  localStorage.setItem(STORAGE_KEY_SPREADSHEET_ID, id);
};

export const clearGoogleAuth = (): void => {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_TOKEN_EXP);
};

export const requestGoogleAccessToken = async (): Promise<string> => {
  const cached = getStoredAccessToken();
  if (cached) return cached;

  await loadGisScript();

  return new Promise((resolve, reject) => {
    const rawConf = defaultConfig as Record<string, any>;
    const clientId =
      import.meta.env.VITE_GOOGLE_CLIENT_ID ||
      rawConf.oAuthClientId ||
      '606124757278-h0bv82piidqfsv4b9iln03d4rei6dhg4.apps.googleusercontent.com';

    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services SDK not loaded'));
      return;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          reject(new Error(tokenResponse.error));
          return;
        }
        if (tokenResponse.access_token) {
          const expiresAt = Date.now() + 3500 * 1000;
          localStorage.setItem(STORAGE_KEY_TOKEN, tokenResponse.access_token);
          localStorage.setItem(STORAGE_KEY_TOKEN_EXP, expiresAt.toString());
          resolve(tokenResponse.access_token);
        } else {
          reject(new Error('No access token received'));
        }
      },
      error_callback: (err) => {
        reject(err);
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

const getReportUrl = (subId: string) => {
  let origin = window.location.origin;
  if (origin.includes('ais-dev-')) {
    origin = origin.replace('ais-dev-', 'ais-pre-');
  }
  const pathname = window.location.pathname.replace(/\/+$/, '');
  return `${origin}${pathname}?report=${encodeURIComponent(subId)}`;
};

export const createGoogleSpreadsheet = async (
  token: string,
  existingSubmissions: AssessmentSubmission[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> => {
  const title = `Assessment MBTI DPP - Live Sync (${new Date().toLocaleDateString('id-ID')})`;

  // 1. Create Spreadsheet with 2 Sheets
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: 'Rekapitulasi MBTI', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Detail Jawaban', gridProperties: { frozenRowCount: 1 } } },
      ],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || 'Gagal membuat Google Spreadsheet');
  }

  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;
  const spreadsheetUrl = sheetData.spreadsheetUrl;
  setStoredSpreadsheetId(spreadsheetId);

  // 2. Populate Header & Existing Data for Sheet 1
  const headerSummary = [
    'No',
    'ID Registrasi',
    'Nama Kandidat',
    'NIK / ID',
    'Jabatan',
    'Departemen / Area',
    'Email',
    'No. WhatsApp',
    'Tanggal & Waktu Tes',
    'E (%)',
    'I (%)',
    'S (%)',
    'N (%)',
    'T (%)',
    'F (%)',
    'J (%)',
    'P (%)',
    'Hasil MBTI',
    'Sebutan / Tipe Karakter',
    'Deskripsi Profil Karakteristik',
    'Link Unduhan Hasil MBTI (PDF / Web)',
  ];

  const summaryRows = existingSubmissions.map((s, idx) => {
    const detail = mbtiDetails[s.mbti] || { title: s.mbti, desc: 'Profil Karakteristik' };
    return [
      idx + 1,
      s.id,
      s.name,
      s.nik,
      s.position,
      s.area,
      s.email,
      s.whatsapp || '-',
      s.formattedDate,
      `${s.percentages.E}%`,
      `${s.percentages.I}%`,
      `${s.percentages.S}%`,
      `${s.percentages.N}%`,
      `${s.percentages.T}%`,
      `${s.percentages.F}%`,
      `${s.percentages.J}%`,
      `${s.percentages.P}%`,
      s.mbti,
      detail.title,
      detail.desc,
      getReportUrl(s.id),
    ];
  });

  const headerDetailed = [
    'No',
    'Nama Kandidat',
    'NIK / ID',
    'Jabatan',
    'Departemen',
    ...questions.map((q) => `Soal ${q.id} [${q.type}]`),
    'Hasil MBTI',
    'Link Unduhan Hasil MBTI (PDF / Web)',
  ];

  const detailedRows = existingSubmissions.map((s, idx) => {
    const ans = s.answers || {};
    const questionCols = questions.map((q) => {
      const v = ans[q.id];
      if (v === 2) return '+2 (Sangat Setuju)';
      if (v === 1) return '+1 (Setuju)';
      if (v === 0) return '0 (Netral)';
      if (v === -1) return '-1 (Tidak Setuju)';
      if (v === -2) return '-2 (Sangat Tidak Setuju)';
      return '0';
    });

    return [
      idx + 1,
      s.name,
      s.nik,
      s.position,
      s.area,
      ...questionCols,
      s.mbti,
      getReportUrl(s.id),
    ];
  });

  // Batch update values
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: "'Rekapitulasi MBTI'!A1",
            values: [headerSummary, ...summaryRows],
          },
          {
            range: "'Detail Jawaban'!A1",
            values: [headerDetailed, ...detailedRows],
          },
        ],
      }),
    }
  );

  return { spreadsheetId, spreadsheetUrl };
};

export const appendSubmissionToGoogleSheet = async (
  token: string,
  spreadsheetId: string,
  sub: AssessmentSubmission,
  rowIndex: number
): Promise<void> => {
  const detail = mbtiDetails[sub.mbti] || { title: sub.mbti, desc: 'Profil Karakteristik' };

  const summaryRow = [
    rowIndex,
    sub.id,
    sub.name,
    sub.nik,
    sub.position,
    sub.area,
    sub.email,
    sub.whatsapp || '-',
    sub.formattedDate,
    `${sub.percentages.E}%`,
    `${sub.percentages.I}%`,
    `${sub.percentages.S}%`,
    `${sub.percentages.N}%`,
    `${sub.percentages.T}%`,
    `${sub.percentages.F}%`,
    `${sub.percentages.J}%`,
    `${sub.percentages.P}%`,
    sub.mbti,
    detail.title,
    detail.desc,
    getReportUrl(sub.id),
  ];

  const ans = sub.answers || {};
  const questionCols = questions.map((q) => {
    const v = ans[q.id];
    if (v === 2) return '+2 (Sangat Setuju)';
    if (v === 1) return '+1 (Setuju)';
    if (v === 0) return '0 (Netral)';
    if (v === -1) return '-1 (Tidak Setuju)';
    if (v === -2) return '-2 (Sangat Tidak Setuju)';
    return '0';
  });

  const detailedRow = [
    rowIndex,
    sub.name,
    sub.nik,
    sub.position,
    sub.area,
    ...questionCols,
    sub.mbti,
    getReportUrl(sub.id),
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Rekapitulasi MBTI'!A:U:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [summaryRow],
      }),
    }
  );

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Detail Jawaban'!A:AK:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [detailedRow],
      }),
    }
  );
};
