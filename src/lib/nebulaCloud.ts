/**
 * Nebulla cloud layer: Render PostgreSQL via same-origin Express API (cookie session).
 */

import { readResponseJson } from './apiFetch';

export type NebulaSessionUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role?: 'user' | 'admin';
};

export async function fetchSessionUser(): Promise<NebulaSessionUser | null> {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    const data = await readResponseJson<{ user?: NebulaSessionUser | null }>(res);
    if (!res.ok || !data.user) return null;
    return { ...data.user, role: 'user' };
  } catch {
    return null;
  }
}

export async function logoutNebula(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export type CloudProjectRow = {
  name: string;
  pages: unknown;
  edges: unknown;
  updated_at: string;
};

export async function listCloudProjects(): Promise<CloudProjectRow[]> {
  const res = await fetch('/api/projects', { credentials: 'include' });
  if (res.status === 401) return [];
  if (!res.ok) return [];
  const data = await readResponseJson<{ projects: CloudProjectRow[] }>(res);
  return data.projects || [];
}

export async function getCloudProject(name: string): Promise<CloudProjectRow | null> {
  const res = await fetch(`/api/projects?name=${encodeURIComponent(name)}`, { credentials: 'include' });
  if (!res.ok) return null;
  const data = await readResponseJson<{ project: CloudProjectRow | null }>(res);
  return data.project ?? null;
}

export async function upsertCloudProject(payload: {
  name: string;
  pages: unknown;
  edges: unknown;
}): Promise<boolean> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function deleteCloudProject(name: string): Promise<boolean> {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return res.ok;
}
