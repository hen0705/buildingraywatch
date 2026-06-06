'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { fetchINatSightings } from '@/lib/inaturalist';
import { GeneralizationEngine, getDefaultFishingWeight } from '@/lib/core';
import type { Sighting, RiskZone, Season } from '@/types';
import styles from './map.module.css';

const SEASONS: Array<Season | 'all'> = ['all', 'Spring', 'Summer', 'Fall', 'Winter'];
const RISK_COLORS: Record<string, string> = { high: '#e05454', medium: '#e8834a', low: '#4fb8a0' };

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<L.Map | null>(null);
  const layerRefs = useRef<{
    hotspot: L.LayerGroup | null;
    risk: L.LayerGroup | null;
    dots: L.LayerGroup | null;
    inat: L.LayerGroup | null;
  }>({ hotspot: null, risk: null, dots: null, inat: null });

  const [allSightings, setAllSightings] = useState<Sighting[]>([]);
  const [inatSightings, setInatSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [inatLoading, setInatLoading] = useState(false);
  const [season, setSeason] = useState<Season | 'all'>('all');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [years, setYears] = useState<number[]>([]);
  const [layers, setLayers] = useState({ hotspot: true, risk: true, dots: true, photos: false, inat: true });
  const [stats, setStats] = useState({ sightings: 0, rays: 0, zones: 0, high: 0 });

  // Init Leaflet (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined' || leafRef.current) return;
    import('leaflet').then((L) => {
      // @ts-expect-error Leaflet icon hack
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, {
        center: [36.9, -75.9],
        zoom: 8,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        maxZoom: 19,
      }).addTo(map);

      layerRefs.current.hotspot = L.layerGroup().addTo(map);
      layerRefs.current.risk = L.layerGroup().addTo(map);
      layerRefs.current.dots = L.layerGroup().addTo(map);
      layerRefs.current.inat = L.layerGroup().addTo(map);
      leafRef.current = map;

      loadData(map);
      loadINat(map);
      map.on('moveend', () => { loadData(map); loadINat(map); });
    });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet/dist/leaflet.css';
    document.head.appendChild(link);
  }, []);

  const loadData = useCallback(async (map?: L.Map) => {
    const m = map || leafRef.current;
    if (!m) return;
    try {
      const bounds = m.getBounds();
      let rows: Record<string, unknown>[] | null = null;

      try {
        const { data } = await supabase.rpc('get_sightings_in_bounds', {
          min_lat: bounds.getSouth(), max_lat: bounds.getNorth(),
          min_lng: bounds.getWest(), max_lng: bounds.getEast(),
        });
        rows = data;
      } catch {
        // RPC not available, fall through to fallback
      }

      if (!rows) {
        const res = await supabase.from('sightings').select('*').eq('status', 'approved');
        rows = res.data ?? [];
      }

      const normalized: Sighting[] = (rows as Record<string, unknown>[])
        .map((d) => {
          const lat = parseFloat(d.lat as string);
          const lng = parseFloat(d.lng as string);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            ...d, lat, lng,
            count: parseInt(d.count as string, 10) || 1,
            submitted_at: (d.submitted_at as string) || new Date().toISOString(),
            photo_urls: Array.isArray(d.photo_urls) ? d.photo_urls : null,
            source: 'raywatch' as const,
          } as Sighting;
        })
        .filter((s): s is Sighting => s !== null);

      setAllSightings(normalized);
      const ys = [...new Set(normalized.map((s) => GeneralizationEngine.getYear(s.submitted_at)))].sort((a, b) => b - a);
      setYears(ys);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadINat = useCallback(async (map?: L.Map) => {
    const m = map || leafRef.current;
    if (!m) return;
    setInatLoading(true);
    try {
      const bounds = m.getBounds();
      const sightings = await fetchINatSightings(
        bounds.getSouth(), bounds.getWest(),
        bounds.getNorth(), bounds.getEast()
      );
      setInatSightings(sightings);
    } catch (e) {
      console.error('iNaturalist fetch failed:', e);
    } finally {
      setInatLoading(false);
    }
  }, []);

  // Redraw whenever filter state or data changes
  useEffect(() => {
    if (!leafRef.current) return;
    import('leaflet').then((L) => redraw(L));
  }, [allSightings, inatSightings, season, selectedYear, layers]);

  function getFiltered(): Sighting[] {
    let s = allSightings;
    if (season !== 'all') s = s.filter((x) => GeneralizationEngine.getSeason(x.submitted_at) === season);
    if (selectedYear !== 'all') s = s.filter((x) => GeneralizationEngine.getYear(x.submitted_at) === selectedYear);
    return s;
  }

  function redraw(L: typeof import('leaflet')) {
    const refs = layerRefs.current;
    refs.hotspot?.clearLayers();
    refs.risk?.clearLayers();
    refs.dots?.clearLayers();
    refs.inat?.clearLayers();

    const filtered = getFiltered();
    const zones: RiskZone[] = filtered.length
      ? GeneralizationEngine.process(filtered, getDefaultFishingWeight)
      : [];

    const CELL_DEG = 0.15;

    // Hotspot / risk rectangles
    if (layers.hotspot || layers.risk) {
      zones.forEach((z) => {
        const half = CELL_DEG / 2;
        const bounds: L.LatLngBoundsExpression = [
          [z.cell_lat - half, z.cell_lng - half],
          [z.cell_lat + half, z.cell_lng + half],
        ];
        if (layers.hotspot) {
          L.rectangle(bounds, {
            color: '#4fb8a0', fillColor: '#4fb8a0',
            fillOpacity: 0.08 + z.kde_intensity * 0.35, weight: 0,
          }).addTo(refs.hotspot!);
        }
        if (layers.risk) {
          const color = RISK_COLORS[z.risk_tier];
          L.rectangle(bounds, {
            color, fillColor: color, fillOpacity: 0.18, weight: 1, opacity: 0.4,
          }).addTo(refs.risk!);
        }
      });
    }

    // RayWatch sighting dots (teal)
    if (layers.dots) {
      const dotSightings = layers.photos ? filtered.filter((s) => s.photo_urls?.length) : filtered;
      dotSightings.forEach((s) => {
        const size = Math.max(6, Math.min(24, 6 + Math.sqrt(s.count) * 1.5));
        const circle = L.circleMarker([s.lat, s.lng], {
          radius: size / 2,
          fillColor: '#4fb8a0',
          color: 'rgba(255,255,255,0.3)',
          weight: 1,
          fillOpacity: 0.7,
        });
        const date = new Date(s.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        circle.bindPopup(`
          <div style="font-family:'DM Sans',sans-serif;color:#e8f4f0;min-width:200px">
            <strong style="font-family:'Syne',sans-serif">${s.count} ray${s.count !== 1 ? 's' : ''}</strong>
            ${s.behavior ? ` · ${s.behavior}` : ''}<hr style="border-color:rgba(79,184,160,0.2);margin:6px 0"/>
            <div style="font-size:.8rem;color:rgba(232,244,240,.6)">Date: <span style="color:#e8f4f0">${date}</span></div>
            <div style="font-size:.8rem;color:rgba(232,244,240,.6)">Source: <span style="color:#e8f4f0">${s.submitter_type || 'public'}</span></div>
            ${s.depth_m ? `<div style="font-size:.8rem;color:rgba(232,244,240,.6)">Depth: <span style="color:#e8f4f0">${s.depth_m}m</span></div>` : ''}
            ${s.notes ? `<div style="font-size:.75rem;color:rgba(232,244,240,.5);margin-top:6px;font-style:italic">${s.notes.slice(0, 120)}</div>` : ''}
          </div>
        `);
        circle.addTo(refs.dots!);
      });
    }

    // iNaturalist dots (amber)
    if (layers.inat) {
      inatSightings.forEach((s) => {
        const circle = L.circleMarker([s.lat, s.lng], {
          radius: 5,
          fillColor: '#f0b429',
          color: 'rgba(255,255,255,0.3)',
          weight: 1,
          fillOpacity: 0.8,
        });
        const date = new Date(s.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        circle.bindPopup(`
          <div style="font-family:'DM Sans',sans-serif;color:#e8f4f0;min-width:200px">
            <div style="font-size:.7rem;background:rgba(240,180,41,0.15);border:1px solid rgba(240,180,41,0.3);border-radius:4px;padding:2px 8px;display:inline-block;margin-bottom:6px;color:#f0b429">iNaturalist</div>
            <strong style="font-family:'Syne',sans-serif;display:block">Cownose Ray</strong>
            <hr style="border-color:rgba(79,184,160,0.2);margin:6px 0"/>
            <div style="font-size:.8rem;color:rgba(232,244,240,.6)">Date: <span style="color:#e8f4f0">${date}</span></div>
            ${s.place_guess ? `<div style="font-size:.8rem;color:rgba(232,244,240,.6)">Location: <span style="color:#e8f4f0">${s.place_guess}</span></div>` : ''}
            <div style="font-size:.8rem;color:rgba(232,244,240,.6)">Quality: <span style="color:#e8f4f0">${s.quality_grade ?? 'unknown'}</span></div>
            ${s.inat_url ? `<a href="${s.inat_url}" target="_blank" rel="noopener" style="font-size:.75rem;color:#f0b429;display:block;margin-top:6px">View on iNaturalist →</a>` : ''}
          </div>
        `);
        circle.addTo(refs.inat!);
      });
    }

    // Update stats
    const totalRays = filtered.reduce((n, s) => n + (s.count || 1), 0);
    setStats({
      sightings: filtered.length + (layers.inat ? inatSightings.length : 0),
      rays: totalRays,
      zones: zones.length,
      high: zones.filter((z) => z.risk_tier === 'high').length,
    });
  }

  function toggleLayer(name: keyof typeof layers) {
    setLayers((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function zoomIn() { leafRef.current?.zoomIn(); }
  function zoomOut() { leafRef.current?.zoomOut(); }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.logoSm}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#0a1628" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 4C6 4 2 10 2 14c0 4 4 6 10 6s10-2 10-6c0-4-4-10-10-10Z" />
            <path d="M12 20l-4 3M12 20l4 3" />
          </svg>
        </div>
        <span className={styles.siteName}>RayWatch</span>
        <span className={styles.headerSep} />
        <span className={styles.headerTag}>Cownose Ray Migration · Chesapeake / Mid-Atlantic</span>
        <div className={styles.headerRight}>
          <div className={styles.liveDot} title="Live data" />
          <Link href="/" className={styles.navBtn}>Home</Link>
          <Link href="/submit" className={styles.navBtn}>Report sighting</Link>
        </div>
      </header>

      <div className={styles.mapContainer}>
        <div ref={mapRef} className={styles.map} />

        {loading && (
          <div className={styles.mapLoading}>
            <div className={styles.spinner} />
            <span>Loading migration data…</span>
          </div>
        )}

        {/* Controls */}
        <div className={styles.controls}>
          <div className={styles.ctrlHeader}>Map layers</div>
          <div className={styles.ctrlBody}>
            {(['hotspot', 'risk', 'dots'] as const).map((name) => (
              <div key={name} className={styles.layerRow}>
                <span className={styles.layerName}>
                  {name === 'hotspot' ? 'Hotspot zones' : name === 'risk' ? 'Bycatch risk' : 'Sighting dots'}
                </span>
                <button
                  className={`${styles.toggle} ${layers[name] ? styles.toggleOn : ''}`}
                  onClick={() => toggleLayer(name)}
                />
              </div>
            ))}
            <div className={styles.layerRow}>
              <span className={styles.layerName}>Photos only</span>
              <button
                className={`${styles.toggle} ${layers.photos ? styles.toggleOn : ''}`}
                onClick={() => toggleLayer('photos')}
              />
            </div>
            <div className={styles.layerRow}>
              <span className={styles.layerName} style={{ color: '#f0b429' }}>
                iNaturalist {inatLoading ? '…' : `(${inatSightings.length})`}
              </span>
              <button
                className={`${styles.toggle} ${layers.inat ? styles.toggleOn : ''}`}
                onClick={() => toggleLayer('inat')}
              />
            </div>
            <span className={`${styles.ctrlLabel} ${styles.ctrlLabelMt}`}>Season</span>
            <select
              className={styles.mapSelect}
              value={season}
              onChange={(e) => setSeason(e.target.value as Season | 'all')}
            >
              {SEASONS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All seasons' : s}</option>)}
            </select>
          </div>
        </div>

        {/* Year strip */}
        <div className={styles.yearStrip}>
          <button className={`${styles.yrBtn} ${selectedYear === 'all' ? styles.yrBtnActive : ''}`} onClick={() => setSelectedYear('all')}>All</button>
          {years.map((y) => (
            <button key={y} className={`${styles.yrBtn} ${selectedYear === y ? styles.yrBtnActive : ''}`} onClick={() => setSelectedYear(y)}>{y}</button>
          ))}
        </div>

        {/* Stats */}
        <div className={styles.statsBar}>
          <StatChip label="Sightings" value={stats.sightings} />
          <StatChip label="Rays" value={stats.rays.toLocaleString()} />
          <StatChip label="Risk zones" value={stats.zones} />
          <StatChip label="High risk" value={stats.high} />
        </div>

        {/* Legend */}
        <div className={styles.legend}>
          <div className={styles.legendTitle}>Bycatch risk</div>
          {(['high', 'medium', 'low'] as const).map((tier) => (
            <div key={tier} className={styles.legendRow}>
              <div className={styles.legendSwatch} style={{ background: RISK_COLORS[tier] }} />
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </div>
          ))}
          <div className={styles.legendTitle} style={{ marginTop: 10 }}>Sources</div>
          <div className={styles.legendRow}>
            <div className={styles.legendSwatch} style={{ background: '#4fb8a0' }} />
            RayWatch
          </div>
          <div className={styles.legendRow}>
            <div className={styles.legendSwatch} style={{ background: '#f0b429' }} />
            iNaturalist
          </div>
        </div>

        {/* Zoom */}
        <div className={styles.zoomCtrls}>
          <button className={styles.zoomBtn} onClick={zoomIn}>+</button>
          <button className={styles.zoomBtn} onClick={zoomOut}>−</button>
        </div>

        {/* FAB */}
        <Link href="/submit" className={styles.fab}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Report sighting
        </Link>
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.statChip}>
      <div className={styles.statChipLabel}>{label}</div>
      <div className={styles.statChipVal}>{value}</div>
    </div>
  );
}
