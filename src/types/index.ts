// ============================================================
// RayWatch — Shared TypeScript Types
// ============================================================

export type SightingStatus = 'pending' | 'approved' | 'rejected';
export type BehaviorType = 'feeding' | 'transiting' | 'resting' | 'unknown';
export type SubmitterType = 'public' | 'researcher' | 'fisherman';
export type RiskTier = 'low' | 'medium' | 'high';
export type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter';

export interface Sighting {
  id: string;
  submitted_at: string;
  status: SightingStatus;
  lat: number;
  lng: number;
  accuracy_m: number;
  count: number;
  behavior: BehaviorType;
  depth_m: number | null;
  water_temp_c: number | null;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_type: SubmitterType;
  photo_urls: string[] | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  cell_lat: number;
  cell_lng: number;
  cell_size_deg: number;
  // iNaturalist enrichment (map only)
  source?: 'inat' | 'raywatch';
  quality_grade?: string;
  inat_url?: string;
  place_guess?: string;
  telemetry_data?: TelemetryAttachment | null;
}

export interface TelemetryAttachment {
  file_name: string;
  file_size: number;
  tag_id: string | null;
  deploy_date: string | null;
  notes: string | null;
}

export interface TelemetrySummary {
  id: string;
  uploaded_at: string;
  researcher: string;
  season: string;
  region: string;
  tag_count: number;
  track_count: number;
  cells: Array<{ cell_lat: number; cell_lng: number; density: number }>;
  notes: string | null;
}

export interface GridCell {
  cell_lat: number;
  cell_lng: number;
  cell_size_deg: number;
  count: number;
  ray_count: number;
  season_counts: Record<Season, number>;
}

export interface RiskZone extends GridCell {
  kde_intensity: number;
  fishing_weight: number;
  risk_score: number;
  risk_tier: RiskTier;
}

export interface MonthlyTrend {
  year: number;
  month: number;
  count: number;
  ray_count: number;
  avg_depth: number | null;
  avg_temp: number | null;
}

export interface YearlyStat {
  year: number;
  sighting_count: number;
  total_rays: number;
  avg_count: number;
  by_season: Record<Season, number>;
  by_type: Record<SubmitterType, number>;
}

export interface TrendData {
  monthly: MonthlyTrend[];
  yearly: YearlyStat[];
  availableYears: number[];
}

export interface SightingSubmitPayload {
  lat: number;
  lng: number;
  accuracy_m: number;
  count: number;
  behavior: BehaviorType;
  depth_m: number | null;
  water_temp_c: number | null;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_type: SubmitterType;
  notes: string | null;
  photo_urls: string[] | null;
  telemetry_data: TelemetryAttachment | null;
}