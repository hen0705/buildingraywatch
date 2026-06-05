'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { supabase } from '@/lib/supabase';
import { GeneralizationEngine, MONTHS } from '@/lib/core';
import type { Sighting } from '@/types';
import styles from './page.module.css';

export default function HomePage() {
  const [allSightings, setAllSightings] = useState<Sighting[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [years, setYears] = useState<number[]>([]);

  const filtered =
    selectedYear === 'all'
      ? allSightings
      : allSightings.filter(
          (s) => GeneralizationEngine.getYear(s.submitted_at) === selectedYear
        );

  const approved = filtered.filter((s) => s.status === 'approved');
  const zones = approved.length ? GeneralizationEngine.aggregateCells(approved) : [];
  const totalRays = approved.reduce((n, s) => n + (s.count || 1), 0);
  const monthly = GeneralizationEngine.monthlyTrend(approved);
  const slice = monthly.slice(-12);
  const maxCount = Math.max(...slice.map((m) => m.count), 1);

  useEffect(() => {
    async function init() {
      try {
        const { data, error } = await supabase.from('sightings').select('*').eq('status', 'approved');
        if (error) throw error;
        const normalized: Sighting[] = (data ?? [])
          .map((d: Record<string, unknown>) => ({
            ...d,
            lat: parseFloat(d.lat as string),
            lng: parseFloat(d.lng as string),
            count: parseInt(d.count as string, 10) || 1,
            submitted_at: (d.submitted_at as string) || new Date().toISOString(),
            photo_urls: Array.isArray(d.photo_urls) ? d.photo_urls : [],
            cell_lat: (d.cell_lat as number) ?? parseFloat(d.lat as string),
            cell_lng: (d.cell_lng as number) ?? parseFloat(d.lng as string),
            cell_size_deg: (d.cell_size_deg as number) ?? 0.15,
          }))
          .filter((d) => d.submitted_at) as Sighting[];
        setAllSightings(normalized);
        const ys = [...new Set(normalized.map((s) => GeneralizationEngine.getYear(s.submitted_at)))].sort((a, b) => b - a);
        setYears(ys);
      } catch (e) {
        console.error('Init failed:', e);
      }
    }
    init();
  }, []);

  return (
    <>
      <Nav />
      <div className={styles.bgGradient} aria-hidden />

      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>
          <span className={styles.liveDot} />
          Live citizen science platform
        </div>
        <h1 className={styles.heroH1}>
          Track <em>cownose ray</em><br />migration in real time
        </h1>
        <p className={styles.heroSub}>
          Crowd-sourced sightings, researcher telemetry, and bycatch risk analytics across the Chesapeake Bay and Mid-Atlantic coast.
        </p>
        <div className={styles.heroActions}>
          <Link href="/map" className={`${styles.btn} ${styles.btnPrimary}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z"/><circle cx="12" cy="9" r="2.5"/></svg>
            View Migration Map
          </Link>
          <Link href="/submit" className={`${styles.btn} ${styles.btnOutline}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Report a Sighting
          </Link>
        </div>
        <svg className={styles.heroRay} viewBox="0 0 300 160" aria-hidden>
          <path d="M20,80 Q150,20 280,80 Q150,140 20,80 Z" fill="#4fb8a0" />
          <path d="M150,140 L130,170 M150,140 L170,170" stroke="#4fb8a0" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="120" cy="75" r="4" fill="rgba(10,22,40,0.3)" />
        </svg>
      </section>

      <div className={styles.yearBar}>
        <span className={styles.yearLabel}>Filter by year:</span>
        <button className={`${styles.yearChip} ${selectedYear === 'all' ? styles.yearChipActive : ''}`} onClick={() => setSelectedYear('all')}>All years</button>
        {years.map((y) => (
          <button key={y} className={`${styles.yearChip} ${selectedYear === y ? styles.yearChipActive : ''}`} onClick={() => setSelectedYear(y)}>{y}</button>
        ))}
      </div>

      <div className={styles.statsSection}>
        {[
          { value: approved.length, label: 'Approved sightings' },
          { value: totalRays.toLocaleString(), label: 'Rays recorded' },
          { value: zones.length, label: 'Active risk zones' },
          { value: approved.length, label: selectedYear === 'all' ? 'Total sightings' : `Sightings in ${selectedYear}` },
        ].map((s) => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.2rem 1rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.9rem', fontWeight: 700, color: 'var(--ray)' }}>{s.value}</div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.trendSection}>
        <div className={styles.sectionLabel}>Monthly sightings trend</div>
        <div className={styles.trendChartWrap}>
          <div className={styles.barChart}>
            {slice.length === 0 && <span style={{ color: 'var(--subtle)', fontSize: '.8rem' }}>No data</span>}
            {slice.map((m, i) => (
              <div key={i} className={styles.bar} style={{ height: Math.max(8, (m.count / maxCount) * 72) }} title={`${MONTHS[m.month]} ${m.year}: ${m.count} sightings`} />
            ))}
          </div>
          <div className={styles.barLabels}>
            {slice.map((m, i) => (
              <span key={i} className={styles.barLabel}>{MONTHS[m.month]}<br /><span style={{ color: 'var(--subtle)' }}>{String(m.year).slice(2)}</span></span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.factsSection}>
        <div className={styles.sectionLabel}>About the species</div>
        <div className={styles.factsGrid}>
          {[
            { icon: '🐟', title: 'Conservation Status', body: 'Cownose rays (<em>Rhinoptera bonasus</em>) are Near Threatened due to bycatch and unregulated recreational fishing pressure along the Atlantic coast.' },
            { icon: '🌊', title: 'Seasonal Migration', body: 'They migrate in large aggregations — sometimes thousands — northward in spring and return south in fall, often entering the Chesapeake Bay.' },
            { icon: '📡', title: 'Telemetry Research', body: 'Tagged individuals provide depth, temperature, and track data that refines our understanding of habitat use and bycatch risk windows.' },
            { icon: '📸', title: 'Photo Documentation', body: 'Submitted photos help researchers verify sightings, assess aggregation size, and document unusual behaviors or injuries in the field.' },
          ].map((f) => (
            <div key={f.title} className={styles.factCard}>
              <div className={styles.factIcon}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p dangerouslySetInnerHTML={{ __html: f.body }} />
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.footer}>
        RayWatch · Cownose Ray Migration Tracker · Data is generalized for privacy — exact coordinates are never shown publicly
      </footer>
    </>
  );
}
