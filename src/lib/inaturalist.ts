// ============================================================
// RayWatch — iNaturalist Fetch Library (via /api/inat proxy)
// ============================================================

import type { Sighting } from '@/types';

interface INatObservation {
  id: number;
  observed_on: string;
  quality_grade: string;
  uri: string;
  place_guess: string | null;
  location: string | null;
  description: string | null;
  photos: Array<{ url: string }>;
}

interface INatResponse {
  results: INatObservation[];
  total_results: number;
}

export async function fetchINatSightings(
  swLat: number,
  swLng: number,
  neLat: number,
  neLng: number,
): Promise<Sighting[]> {
  const params = new URLSearchParams({
    swlat: String(swLat),
    swlng: String(swLng),
    nelat: String(neLat),
    nelng: String(neLng),
  });

  const res = await fetch(`/api/inat?${params.toString()}`);
  if (!res.ok) throw new Error(`iNat proxy error: ${res.status}`);

  const json: INatResponse = await res.json();

  return json.results
    .map((obs): Sighting | null => {
      if (!obs.location) return null;
      const [latStr, lngStr] = obs.location.split(',');
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const submittedAt = obs.observed_on
        ? new Date(obs.observed_on).toISOString()
        : new Date().toISOString();

      const cellSize = 0.15;
      const cell_lat = Math.floor(lat / cellSize) * cellSize + cellSize / 2;
      const cell_lng = Math.floor(lng / cellSize) * cellSize + cellSize / 2;

      return {
        id: `inat-${obs.id}`,
        submitted_at: submittedAt,
        status: 'approved',
        lat,
        lng,
        accuracy_m: 100,
        count: 1,
        behavior: 'unknown',
        depth_m: null,
        water_temp_c: null,
        submitter_name: null,
        submitter_email: null,
        submitter_type: 'public',
        photo_urls: obs.photos.map((p) => p.url.replace('square', 'medium')),
        notes: obs.description?.slice(0, 200) ?? null,
        reviewed_by: null,
        reviewed_at: null,
        reject_reason: null,
        cell_lat: +cell_lat.toFixed(5),
        cell_lng: +cell_lng.toFixed(5),
        cell_size_deg: cellSize,
        source: 'inat',
        quality_grade: obs.quality_grade,
        inat_url: obs.uri,
        place_guess: obs.place_guess ?? undefined,
      };
    })
    .filter((s): s is Sighting => s !== null);
}
