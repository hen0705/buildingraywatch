'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, reviewSighting } from '@/lib/supabase';
import { GeneralizationEngine, MONTHS_SHORT, SEASON_COLORS } from '@/lib/core';
import type { Sighting, RiskZone, Season } from '@/types';
import styles from './admin.module.css';

type Section = 'review' | 'all' | 'trends' | 'risk' | 'telemetry';
type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

export default function AdminPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [section, setSection] = useState<Section>('review');
  const [filterTab, setFilterTab] = useState<FilterTab>('pending');
  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push('/login'); return; }
      setAuthed(true);
    });
  }, [router]);

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from('sightings')
      .select('*')
      .order('submitted_at', { ascending: false });
    if (data) {
      const rows = data as Record<string, unknown>[];
      setSightings(rows.map((d) => ({
        ...d,
        lat: parseFloat(d.lat as string),
        lng: parseFloat(d.lng as string),
        count: parseInt(d.count as string, 10) || 1,
        submitted_at: (d.submitted_at as string) || new Date().toISOString(),
        photo_urls: Array.isArray(d.photo_urls) ? d.photo_urls : null,
        cell_lat: (d.cell_lat as number) ?? parseFloat(d.lat as string),
        cell_lng: (d.cell_lng as number) ?? parseFloat(d.lng as string),
        cell_size_deg: (d.cell_size_deg as number) ?? 0.15,
      })) as Sighting[]);
    }
  }, []);

  useEffect(() => { if (authed) loadData(); }, [authed, loadData]);

  const stats = {
    total: sightings.length,
    pending: sightings.filter((s) => s.status === 'pending').length,
    approved: sightings.filter((s) => s.status === 'approved').length,
    rejected: sightings.filter((s) => s.status === 'rejected').length,
    total_rays: sightings
      .filter((s) => s.status === 'approved')
      .reduce((n, s) => n + (s.count || 1), 0),
  };

  const years = [
    ...new Set(sightings.map((s) => GeneralizationEngine.getYear(s.submitted_at))),
  ].sort((a, b) => b - a);

  function getFiltered(): Sighting[] {
    let list = sightings;
    if (section === 'review') list = list.filter((s) => s.status === 'pending');
    else if (filterTab !== 'all') list = list.filter((s) => s.status === filterTab);
    if (selectedYear !== 'all')
      list = list.filter((s) => GeneralizationEngine.getYear(s.submitted_at) === selectedYear);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          s.submitter_name?.toLowerCase().includes(q) ||
          s.notes?.toLowerCase().includes(q) ||
          s.behavior?.toLowerCase().includes(q)
      );
    }
    return list;
  }

  async function approve(id: string) {
    await reviewSighting(id, 'approve');
    await loadData();
    if (selectedId === id) setSelectedId(null);
  }

  async function reject(id: string) {
    await reviewSighting(id, 'reject', rejectReason || undefined);
    setRejectReason('');
    setShowRejectInput(false);
    await loadData();
    if (selectedId === id) setSelectedId(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const selected = sightings.find((s) => s.id === selectedId) ?? null;
  const filtered = getFiltered();
  const approved = sightings.filter((s) => s.status === 'approved');
  const trends = GeneralizationEngine.getTrends(sightings);
  const monthly12 = trends.monthly.slice(-12);
  const maxM = Math.max(...monthly12.map((m) => m.count), 1);
  const maxY = Math.max(...trends.yearly.map((y) => y.sighting_count), 1);

  const riskZones: RiskZone[] = approved.length
    ? GeneralizationEngine.process(
        approved,
        (_lat: number, lng: number) =>
          Math.min(1, 0.2 + Math.max(0, 1 - Math.abs(lng + 75.9) * 3) * 0.8)
      )
    : [];

  if (!authed) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Checking auth…
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandDot}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0a1628" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 4C6 4 2 10 2 14c0 4 4 6 10 6s10-2 10-6c0-4-4-10-10-10Z" />
              <path d="M12 20l-4 3M12 20l4 3" />
            </svg>
          </div>
          <div>
            <div className={styles.brandName}>RayWatch</div>
            <div className={styles.brandSub}>Admin Panel</div>
          </div>
        </div>

        <NavItem icon="⏳" label="Review queue" badge={stats.pending || undefined} active={section === 'review'} onClick={() => setSection('review')} />
        <NavItem icon="📋" label="All sightings" active={section === 'all'} onClick={() => setSection('all')} />
        <NavItem icon="📈" label="Trends" active={section === 'trends'} onClick={() => setSection('trends')} />
        <NavItem icon="⚠️" label="Risk zones" active={section === 'risk'} onClick={() => setSection('risk')} />
        <NavItem icon="📡" label="Telemetry" active={section === 'telemetry'} onClick={() => setSection('telemetry')} />

        <div className={styles.sidebarFooter}>
          <div className={styles.adminPill}>
            <div className={styles.adminAvatar}>AD</div>
            <div>
              <div className={styles.adminName}>admin</div>
              <div className={styles.adminRole}>Administrator</div>
            </div>
            <button className={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.statsRow}>
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Pending" value={stats.pending} color="orange" />
          <StatCard label="Approved" value={stats.approved} color="green" />
          <StatCard label="Rejected" value={stats.rejected} color="red" />
        </div>

        {(section === 'review' || section === 'all') && (
          <>
            <div className={styles.pageTitle}>{section === 'review' ? 'Review Queue' : 'All Sightings'}</div>
            <p className={styles.pageSub}>
              {section === 'review'
                ? `${stats.pending} sightings awaiting review`
                : `${stats.total} total sightings`}
            </p>

            <div className={styles.toolbar}>
              {section === 'all' && (
                <div className={styles.filterTabs}>
                  {(['all', 'pending', 'approved', 'rejected'] as FilterTab[]).map((t) => (
                    <button
                      key={t}
                      className={`${styles.filterTab} ${filterTab === t ? styles.filterTabActive : ''}`}
                      onClick={() => setFilterTab(t)}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              )}
              <input
                className={styles.searchInput}
                placeholder="Search by ID, name, notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className={styles.yearFilterRow}>
              <span className={styles.yearFilterLabel}>Year:</span>
              <button className={`${styles.yrChip} ${selectedYear === 'all' ? styles.yrChipActive : ''}`} onClick={() => setSelectedYear('all')}>All</button>
              {years.map((y) => (
                <button key={y} className={`${styles.yrChip} ${selectedYear === y ? styles.yrChipActive : ''}`} onClick={() => setSelectedYear(y)}>{y}</button>
              ))}
            </div>

            <div className={styles.queueWrap}>
              <div className={styles.queueHead}>
                <span>Sighting</span><span>Date</span><span>Status</span><span>Rays</span><span>Submitter</span><span>Actions</span>
              </div>
              {filtered.length === 0 && <div className={styles.emptyState}>No sightings found</div>}
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className={`${styles.queueRow} ${selectedId === s.id ? styles.queueRowSelected : ''}`}
                  onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                >
                  <div>
                    <div className={styles.sightingLoc}>
                      {s.lat.toFixed(3)}°N, {Math.abs(s.lng).toFixed(3)}°W
                      {s.photo_urls?.length ? <span className={styles.photoIndicator}> 📷{s.photo_urls.length}</span> : null}
                    </div>
                    <div className={styles.sightingId}>{s.id.slice(0, 8)}</div>
                  </div>
                  <span style={{ fontSize: '.82rem' }}>
                    {new Date(s.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span><span className={`rw-badge ${s.status}`}>{s.status}</span></span>
                  <span className={styles.countChip}>{s.count}</span>
                  <span className={styles.submitterType}>{s.submitter_type}</span>
                  <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                    {s.status !== 'approved' && (
                      <button className={styles.btnApprove} onClick={() => approve(s.id)}>✓ Approve</button>
                    )}
                    {s.status !== 'rejected' && (
                      <button className={styles.btnReject} onClick={() => { setSelectedId(s.id); setShowRejectInput(true); }}>✗ Reject</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {section === 'trends' && (
          <>
            <div className={styles.pageTitle}>Trend Analytics</div>
            <p className={styles.pageSub}>Monthly and yearly sighting patterns across all data</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div className={styles.chartCard}>
                <div className={styles.chartTitle}>Monthly sightings (last 12 months)</div>
                <div className={styles.barChartH}>
                  {monthly12.map((m, i) => {
                    const h = Math.max(6, (m.count / maxM) * 80);
                    const season = GeneralizationEngine.getSeason(new Date(m.year, m.month, 15).toISOString());
                    return (
                      <div
                        key={i}
                        className={styles.barH}
                        style={{ height: h, background: SEASON_COLORS[season as Season], opacity: 0.75 }}
                        title={`${MONTHS_SHORT[m.month]} ${m.year}: ${m.count}`}
                      />
                    );
                  })}
                </div>
                <div className={styles.barChartLabels}>
                  {monthly12.map((m, i) => (
                    <span key={i} className={styles.barHLbl}>{MONTHS_SHORT[m.month]}</span>
                  ))}
                </div>
              </div>
              <div className={styles.chartCard}>
                <div className={styles.chartTitle}>By season (all years)</div>
                <div style={{ marginTop: '.5rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(['Spring', 'Summer', 'Fall', 'Winter'] as Season[]).map((s) => {
                    const count = approved.filter((x) => GeneralizationEngine.getSeason(x.submitted_at) === s).length;
                    return (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: SEASON_COLORS[s], flexShrink: 0 }} />
                        <span style={{ fontSize: '.82rem', width: 56, color: 'var(--muted)' }}>{s}</span>
                        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${(count / (approved.length || 1)) * 100}%`, height: '100%', background: SEASON_COLORS[s] }} />
                        </div>
                        <span style={{ fontSize: '.82rem', minWidth: 28, textAlign: 'right' }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={styles.queueWrap}>
              <div className={styles.queueHead} style={{ gridTemplateColumns: '80px 1fr 1fr 1fr 1fr' }}>
                <span>Year</span><span>Sightings</span><span>Total rays</span><span>Avg/sighting</span><span>Top season</span>
              </div>
              {[...trends.yearly].reverse().map((y) => {
                const topSeason = Object.entries(y.by_season).sort((a, b) => b[1] - a[1])[0];
                return (
                  <div key={y.year} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <strong style={{ fontFamily: 'Syne, sans-serif' }}>{y.year}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(y.sighting_count / maxY) * 100}%`, height: '100%', background: 'var(--ray)' }} />
                      </div>
                      <span style={{ fontSize: '.82rem', minWidth: 28 }}>{y.sighting_count}</span>
                    </div>
                    <span style={{ fontSize: '.82rem' }}>{y.total_rays.toLocaleString()}</span>
                    <span style={{ fontSize: '.82rem' }}>{y.avg_count}</span>
                    <span style={{ fontSize: '.75rem', padding: '2px 8px', borderRadius: 4, background: SEASON_COLORS[topSeason[0] as Season] + '33', color: SEASON_COLORS[topSeason[0] as Season] }}>
                      {topSeason[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {section === 'risk' && (
          <>
            <div className={styles.pageTitle}>Risk Zones</div>
            <p className={styles.pageSub}>Bycatch risk computed from approved sighting density and fishing pressure</p>
            <div className={styles.queueWrap}>
              <div className={styles.queueHead} style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr' }}>
                <span>Location</span><span>KDE intensity</span><span>Fishing pressure</span><span>Risk tier</span><span>Sightings</span>
              </div>
              {riskZones.slice(0, 30).map((z, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: '.82rem' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '.78rem' }}>{z.cell_lat.toFixed(3)}, {z.cell_lng.toFixed(3)}</span>
                  <span>{(z.kde_intensity * 100).toFixed(0)}%</span>
                  <span>{(z.fishing_weight * 100).toFixed(0)}%</span>
                  <span>
                    <span className={`rw-badge ${z.risk_tier === 'high' ? 'rejected' : z.risk_tier === 'medium' ? 'pending' : 'approved'}`}>
                      {z.risk_tier}
                    </span>
                  </span>
                  <span>{z.count}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {section === 'telemetry' && (
          <>
            <div className={styles.pageTitle}>Telemetry Upload</div>
            <p className={styles.pageSub}>Upload researcher tag data (.csv, .json, .gpx)</p>
            <div className={styles.telemWrap}>
              <TelemetryUpload />
            </div>
          </>
        )}
      </main>

      {/* Detail panel */}
      {selected && (
        <div className={`${styles.detailWrap} ${styles.detailOpen}`}>
          <div className={styles.detailHeader}>
            <h3>Sighting {selected.id.slice(0, 8).toUpperCase()}</h3>
            <span className={`rw-badge ${selected.status}`}>{selected.status}</span>
            <button className={styles.btnClose} onClick={() => { setSelectedId(null); setShowRejectInput(false); }}>×</button>
          </div>
          <div className={styles.detailBody}>
            {selected.photo_urls?.length ? (
              <div className={styles.detailPhotos}>
                {selected.photo_urls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <div key={i} className={styles.detailPhoto}>
                    <img src={url} alt={`Photo ${i + 1}`} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                ))}
              </div>
            ) : null}

            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>Location</div>
              <div className={styles.detailGrid}>
                <DetailField label="Latitude" value={selected.lat.toFixed(5)} />
                <DetailField label="Longitude" value={selected.lng.toFixed(5)} />
                <DetailField label="Accuracy" value={`${selected.accuracy_m}m`} />
                <DetailField label="Date" value={new Date(selected.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>Observation</div>
              <div className={styles.detailGrid}>
                <DetailField label="Ray count" value={selected.count} />
                <DetailField label="Behavior" value={selected.behavior} />
                <DetailField label="Depth (m)" value={selected.depth_m ?? '—'} />
                <DetailField label="Water temp" value={selected.water_temp_c ? `${selected.water_temp_c}°C` : '—'} />
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>Submitter</div>
              <div className={styles.detailGrid}>
                <DetailField label="Name" value={selected.submitter_name ?? 'Anonymous'} />
                <DetailField label="Type" value={selected.submitter_type} />
                <DetailField label="Email" value={selected.submitter_email ?? '—'} />
              </div>
            </div>

            {selected.notes && (
              <div className={styles.detailSection}>
                <div className={styles.detailSectionTitle}>Notes</div>
                <div className={styles.detailNotes}>{selected.notes}</div>
              </div>
            )}
            {selected.reject_reason && (
              <div className={styles.detailSection}>
                <div className={styles.detailSectionTitle}>Reject reason</div>
                <div className={styles.detailNotes}>{selected.reject_reason}</div>
              </div>
            )}
          </div>

          <div className={styles.detailActions}>
            {selected.status !== 'approved' && (
              <button className={styles.btnFullApprove} onClick={() => approve(selected.id)}>✓ Approve sighting</button>
            )}
            {selected.status !== 'rejected' && (
              <>
                <button className={styles.btnFullReject} onClick={() => setShowRejectInput((x) => !x)}>
                  {showRejectInput ? 'Cancel' : '✗ Reject sighting'}
                </button>
                {showRejectInput && (
                  <>
                    <textarea
                      className={styles.rejectReason}
                      rows={3}
                      placeholder="Reason for rejection (optional)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <button
                      className={styles.btnFullReject}
                      style={{ background: 'rgba(224,84,84,0.15)' }}
                      onClick={() => reject(selected.id)}
                    >
                      Confirm reject
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function NavItem({ icon, label, badge, active, onClick }: {
  icon: string;
  label: string;
  badge?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`${styles.navItem} ${active ? styles.navItemActive : ''}`} onClick={onClick}>
      <span>{icon}</span> {label}
      {badge ? <span className={styles.navBadge}>{badge}</span> : null}
    </button>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: 'orange' | 'green' | 'red' }) {
  const colorClass = color === 'orange' ? styles.orange : color === 'green' ? styles.green : color === 'red' ? styles.red : '';
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={`${styles.statVal} ${colorClass}`}>{value}</div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.detailField}>
      <label>{label}</label>
      <span>{String(value)}</span>
    </div>
  );
}

function TelemetryUpload() {
  const [log, setLog] = useState<Array<{ ts: string; researcher: string; season: string; tags: number; status: string }>>([]);
  const [researcher, setResearcher] = useState('');
  const [season, setSeason] = useState('');
  const [tags, setTags] = useState('');
  const [fileName, setFileName] = useState('');

  function simulate() {
    const entry = { ts: new Date().toLocaleTimeString(), researcher: researcher || 'Unknown', season: season || '—', tags: +tags || 0, status: 'Processing…' };
    setLog((l) => [entry, ...l]);
    setTimeout(() => { setLog((l) => l.map((e, i) => i === 0 ? { ...e, status: 'ok' } : e)); }, 900);
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Researcher</label>
          <input className={styles.searchInput} style={{ width: '100%' }} placeholder="Name" value={researcher} onChange={(e) => setResearcher(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Season</label>
          <input className={styles.searchInput} style={{ width: '100%' }} placeholder="e.g. Spring 2025" value={season} onChange={(e) => setSeason(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Tags</label>
          <input className={styles.searchInput} style={{ width: '100%' }} type="number" placeholder="0" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
      </div>
      <label className={styles.telemDropzone}>
        <input type="file" accept=".csv,.json,.gpx" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
        <div style={{ fontSize: '.7rem', opacity: 0.5, marginBottom: 4 }}>↑</div>
        {fileName
          ? <strong style={{ color: 'var(--ray)' }}>✓ {fileName}</strong>
          : <div>Drop file or <strong style={{ color: 'var(--ray)' }}>browse</strong></div>
        }
      </label>
      <button className={styles.btnFullApprove} style={{ marginTop: 10 }} onClick={simulate}>Simulate upload</button>
      <div style={{ marginTop: 12 }}>
        {log.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.8rem', color: 'var(--muted)' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '.75rem', flexShrink: 0 }}>{e.ts}</span>
            <span>{e.researcher} · {e.season} · {e.tags} tags</span>
            <span style={{ marginLeft: 'auto', color: e.status === 'ok' ? 'var(--ray)' : 'var(--warn)' }}>{e.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}