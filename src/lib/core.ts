// ============================================================
// RayWatch Platform — Core Engine (TypeScript)
// ============================================================

import type {
  Sighting,
  GridCell,
  RiskZone,
  MonthlyTrend,
  YearlyStat,
  TrendData,
  Season,
} from '@/types';

const CELL_SIZE = 0.15;
const MIN_K = 1;
const KDE_BANDWIDTH = 2;

export const GeneralizationEngine = {
  CELL_SIZE,
  MIN_K,
  KDE_BANDWIDTH,

  snapToGrid(
    lat: number,
    lng: number,
    cellSize: number = CELL_SIZE
  ): { cell_lat: number; cell_lng: number; cell_size_deg: number } {
    const cellLat = Math.floor(lat / cellSize) * cellSize + cellSize / 2;
    const cellLng = Math.floor(lng / cellSize) * cellSize + cellSize / 2;
    return {
      cell_lat: +cellLat.toFixed(5),
      cell_lng: +cellLng.toFixed(5),
      cell_size_deg: cellSize,
    };
  },

  aggregateCells(sightings: Sighting[], cellSize: number = CELL_SIZE): GridCell[] {
    const cells: Record<string, GridCell> = {};
    sightings.forEach((s) => {
      const snapped = GeneralizationEngine.snapToGrid(s.lat, s.lng, cellSize);
      const key = `${snapped.cell_lat},${snapped.cell_lng}`;
      if (!cells[key]) {
        cells[key] = {
          ...snapped,
          count: 0,
          ray_count: 0,
          season_counts: { Spring: 0, Summer: 0, Fall: 0, Winter: 0 },
        };
      }
      cells[key].count++;
      cells[key].ray_count += s.count || 1;
      const season = GeneralizationEngine.getSeason(s.submitted_at);
      cells[key].season_counts[season] = (cells[key].season_counts[season] || 0) + 1;
    });
    return Object.values(cells).filter((c) => c.count >= MIN_K);
  },

  computeKDE(
    cells: GridCell[],
    bandwidth: number = KDE_BANDWIDTH,
    cellSize: number = CELL_SIZE
  ): (GridCell & { kde_intensity: number })[] {
    const result: Record<string, number> = {};
    cells.forEach((source) => {
      cells.forEach((target) => {
        const dLat = (source.cell_lat - target.cell_lat) / cellSize;
        const dLng = (source.cell_lng - target.cell_lng) / cellSize;
        const d2 = dLat * dLat + dLng * dLng;
        if (d2 > bandwidth * bandwidth * 4) return;
        const weight = source.count * Math.exp(-0.5 * d2 / (bandwidth * bandwidth));
        const key = `${target.cell_lat},${target.cell_lng}`;
        result[key] = (result[key] || 0) + weight;
      });
    });
    const maxVal = Math.max(...Object.values(result), 1);
    return cells.map((c) => ({
      ...c,
      kde_intensity: +((result[`${c.cell_lat},${c.cell_lng}`] || 0) / maxVal).toFixed(3),
    }));
  },

  scoreRisk(
    kdeCells: (GridCell & { kde_intensity: number })[],
    getFishingWeight?: (lat: number, lng: number) => number
  ): RiskZone[] {
    return kdeCells.map((c) => {
      const fw = getFishingWeight ? getFishingWeight(c.cell_lat, c.cell_lng) : 0.5;
      const score = c.kde_intensity * fw;
      return {
        ...c,
        fishing_weight: +fw.toFixed(3),
        risk_score: +score.toFixed(3),
        risk_tier: (score > 0.35 ? 'high' : score > 0.12 ? 'medium' : 'low') as RiskZone['risk_tier'],
      };
    });
  },

  getSeason(ts: string): Season {
    const m = new Date(ts).getMonth();
    if (m >= 2 && m <= 4) return 'Spring';
    if (m >= 5 && m <= 7) return 'Summer';
    if (m >= 8 && m <= 10) return 'Fall';
    return 'Winter';
  },

  getYear(ts: string): number {
    return new Date(ts).getFullYear();
  },

  process(
    sightings: Sighting[],
    getFishingWeight?: (lat: number, lng: number) => number,
    cellSize: number = CELL_SIZE
  ): RiskZone[] {
    const cells = GeneralizationEngine.aggregateCells(sightings, cellSize);
    const kde = GeneralizationEngine.computeKDE(cells, KDE_BANDWIDTH, cellSize);
    return GeneralizationEngine.scoreRisk(kde, getFishingWeight);
  },

  groupByYear(sightings: Sighting[]): Record<number, Sighting[]> {
    return sightings.reduce<Record<number, Sighting[]>>((acc, s) => {
      const y = GeneralizationEngine.getYear(s.submitted_at);
      if (!acc[y]) acc[y] = [];
      acc[y].push(s);
      return acc;
    }, {});
  },

  monthlyTrend(sightings: Sighting[]): MonthlyTrend[] {
    const buckets: Record<
      string,
      { year: number; month: number; count: number; ray_count: number; depths: number[]; temps: number[] }
    > = {};
    sightings.forEach((s) => {
      const d = new Date(s.submitted_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!buckets[key]) {
        buckets[key] = { year: d.getFullYear(), month: d.getMonth(), count: 0, ray_count: 0, depths: [], temps: [] };
      }
      buckets[key].count++;
      buckets[key].ray_count += s.count || 1;
      if (s.depth_m != null) buckets[key].depths.push(s.depth_m);
      if (s.water_temp_c != null) buckets[key].temps.push(s.water_temp_c);
    });
    return Object.values(buckets)
      .map((b) => ({
        year: b.year,
        month: b.month,
        count: b.count,
        ray_count: b.ray_count,
        avg_depth: b.depths.length ? +(b.depths.reduce((a, v) => a + v, 0) / b.depths.length).toFixed(1) : null,
        avg_temp: b.temps.length ? +(b.temps.reduce((a, v) => a + v, 0) / b.temps.length).toFixed(1) : null,
      }))
      .sort((a, b) => a.year - b.year || a.month - b.month);
  },

  yearlyStats(sightings: Sighting[]): YearlyStat[] {
    const byYear = GeneralizationEngine.groupByYear(sightings);
    return Object.entries(byYear)
      .map(([year, list]) => ({
        year: +year,
        sighting_count: list.length,
        total_rays: list.reduce((n, s) => n + (s.count || 1), 0),
        avg_count: +(list.reduce((n, s) => n + (s.count || 1), 0) / list.length).toFixed(1),
        by_season: {
          Spring: list.filter((s) => GeneralizationEngine.getSeason(s.submitted_at) === 'Spring').length,
          Summer: list.filter((s) => GeneralizationEngine.getSeason(s.submitted_at) === 'Summer').length,
          Fall:   list.filter((s) => GeneralizationEngine.getSeason(s.submitted_at) === 'Fall').length,
          Winter: list.filter((s) => GeneralizationEngine.getSeason(s.submitted_at) === 'Winter').length,
        },
        by_type: {
          public:     list.filter((s) => s.submitter_type === 'public').length,
          fisherman:  list.filter((s) => s.submitter_type === 'fisherman').length,
          researcher: list.filter((s) => s.submitter_type === 'researcher').length,
        },
      }))
      .sort((a, b) => a.year - b.year);
  },

  getTrends(sightings: Sighting[]): TrendData {
    const approved = sightings.filter((s) => s.status === 'approved');
    return {
      monthly: GeneralizationEngine.monthlyTrend(approved),
      yearly:  GeneralizationEngine.yearlyStats(approved),
      availableYears: [...new Set(approved.map((s) => GeneralizationEngine.getYear(s.submitted_at)))].sort(),
    };
  },
};

export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getDefaultFishingWeight(_lat: number, lng: number): number {
  const coastalProx = Math.max(0, 1 - Math.abs(lng + 75.9) * 3);
  return Math.min(1, 0.2 + coastalProx * 0.8);
}

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
export const MONTHS_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D'] as const;
export const SEASON_COLORS: Record<Season, string> = {
  Spring: '#7ecfa4',
  Summer: '#f0c060',
  Fall:   '#e8834a',
  Winter: '#7ab0e0',
};