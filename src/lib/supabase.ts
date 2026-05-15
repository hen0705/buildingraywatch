import { createClient } from '@supabase/supabase-js';
import type { Sighting, SightingSubmitPayload } from '@/types';
import { GeneralizationEngine, uuid } from './core';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Sightings ─────────────────────────────────────────────────

export async function getApprovedSightings(): Promise<Sighting[]> {
  const { data, error } = await supabase
    .from('sightings')
    .select('*')
    .eq('status', 'approved');
  if (error) throw error;
  return normalizeSightings(data ?? []);
}

export async function getAllSightings(): Promise<Sighting[]> {
  const { data, error } = await supabase
    .from('sightings')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return normalizeSightings(data ?? []);
}

export async function getPendingSightings(): Promise<Sighting[]> {
  const { data, error } = await supabase
    .from('sightings')
    .select('*')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return normalizeSightings(data ?? []);
}

export async function getSightingsInBounds(
  minLat: number, maxLat: number,
  minLng: number, maxLng: number
): Promise<Sighting[]> {
  const { data, error } = await supabase.rpc('get_sightings_in_bounds', {
    min_lat: minLat, max_lat: maxLat,
    min_lng: minLng, max_lng: maxLng,
  });
  if (error) {
    // Fallback: fetch all approved (for environments without the RPC)
    return getApprovedSightings();
  }
  return normalizeSightings(data ?? []);
}

export async function submitSighting(
  payload: SightingSubmitPayload
): Promise<{ id: string }> {
  const id = uuid();
  const grid = GeneralizationEngine.snapToGrid(payload.lat, payload.lng);
  const record = {
    id,
    submitted_at: new Date().toISOString(),
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    reject_reason: null,
    ...payload,
    ...grid,
  };
  const { error } = await supabase.from('sightings').insert([record]);
  if (error) throw error;
  return { id };
}

export async function updateSightingPhotos(
  id: string,
  photoUrls: string[]
): Promise<void> {
  const { error } = await supabase
    .from('sightings')
    .update({ photo_urls: photoUrls.length ? photoUrls : null })
    .eq('id', id);
  if (error) throw error;
}

export async function reviewSighting(
  id: string,
  action: 'approve' | 'reject',
  reason?: string
): Promise<void> {
  const { error } = await supabase
    .from('sightings')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: 'admin@raywatch.org',
      reviewed_at: new Date().toISOString(),
      reject_reason: reason ?? null,
    })
    .eq('id', id);
  if (error) throw error;
}

// ── Photos ────────────────────────────────────────────────────

export async function uploadPhoto(
  file: File,
  sightingId: string
): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `sightings/${sightingId}/${uuid()}.${ext}`;
  const { error } = await supabase.storage
    .from('photos')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

// ── Auth ──────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}

// ── Normalizer ────────────────────────────────────────────────

function normalizeSightings(raw: Record<string, unknown>[]): Sighting[] {
  return raw
    .map((d) => {
      const lat = parseFloat(d.lat as string);
      const lng = parseFloat(d.lng as string);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        ...d,
        lat,
        lng,
        count: parseInt(d.count as string, 10) || 1,
        submitted_at: (d.submitted_at as string) || new Date().toISOString(),
        photo_urls: Array.isArray(d.photo_urls) ? d.photo_urls : null,
        cell_lat: (d.cell_lat as number) ?? lat,
        cell_lng: (d.cell_lng as number) ?? lng,
        cell_size_deg: (d.cell_size_deg as number) ?? 0.15,
      } as Sighting;
    })
    .filter((s): s is Sighting => s !== null);
}