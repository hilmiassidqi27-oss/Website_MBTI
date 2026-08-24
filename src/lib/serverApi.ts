import { AssessmentSubmission } from '../types';

export const fetchSubmissionsFromApi = async (): Promise<AssessmentSubmission[]> => {
  try {
    const res = await fetch('/api/submissions', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.warn('[ServerAPI] Failed to fetch submissions from /api/submissions:', err);
    return [];
  }
};

export const saveSubmissionToApi = async (submission: AssessmentSubmission): Promise<boolean> => {
  try {
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(submission),
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = await res.json();
    return json.success === true;
  } catch (err) {
    console.warn('[ServerAPI] Failed to post submission to /api/submissions:', err);
    return false;
  }
};

export const syncAllSubmissionsToApi = async (submissions: AssessmentSubmission[]): Promise<AssessmentSubmission[]> => {
  try {
    if (!submissions || submissions.length === 0) return [];
    const res = await fetch('/api/submissions/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ submissions }),
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.warn('[ServerAPI] Failed to bulk sync submissions to /api/submissions/sync:', err);
    return [];
  }
};

export const deleteSubmissionFromApi = async (id: string): Promise<boolean> => {
  try {
    const res = await fetch(`/api/submissions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = await res.json();
    return json.success === true;
  } catch (err) {
    console.warn('[ServerAPI] Failed to delete submission from /api/submissions:', err);
    return false;
  }
};

export const fetchSettingsFromApi = async (): Promise<any> => {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return {};
    const json = await res.json();
    return json.data || {};
  } catch (err) {
    return {};
  }
};

export const saveSettingsToApi = async (settings: any): Promise<boolean> => {
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return res.ok;
  } catch (err) {
    return false;
  }
};
