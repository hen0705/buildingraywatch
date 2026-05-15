'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { supabase, uploadPhoto, updateSightingPhotos } from '@/lib/supabase';
import { GeneralizationEngine, uuid } from '@/lib/core';
import type { BehaviorType, SubmitterType, TelemetryAttachment } from '@/types';
import styles from './submit.module.css';

const MAX_PHOTOS = 5;

interface FormState {
  lat: string;
  lng: string;
  obsDate: string;
  obsTime: string;
  count: number;
  behavior: BehaviorType | null;
  depthM: string;
  waterTempC: string;
  notes: string;
  subName: string;
  subEmail: string;
  submitterType: SubmitterType;
  telemEnabled: boolean;
  telemTagId: string;
  telemDeployDate: string;
  telemNotes: string;
}

interface Errors {
  lat?: string;
  lng?: string;
  date?: string;
}

export default function SubmitPage() {
  const [form, setForm] = useState<FormState>({
    lat: '', lng: '', obsDate: new Date().toISOString().slice(0, 10),
    obsTime: '', count: 10, behavior: null,
    depthM: '', waterTempC: '', notes: '',
    subName: '', subEmail: '', submitterType: 'public',
    telemEnabled: false, telemTagId: '', telemDeployDate: '', telemNotes: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [gpsStatus, setGpsStatus] = useState<{ msg: string; type: 'idle' | 'ok' | 'err' }>({ msg: '', type: 'idle' });
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [telemFile, setTelemFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Revoke old preview URLs on unmount
  useEffect(() => {
    return () => { photoPreviews.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  const updatePhotos = useCallback((files: File[]) => {
    photoPreviews.forEach((u) => URL.revokeObjectURL(u));
    const previews = files.map((f) => URL.createObjectURL(f));
    setPhotos(files);
    setPhotoPreviews(previews);
  }, [photoPreviews]);

  const addPhotos = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const next = [...photos];
    Array.from(fileList)
      .slice(0, MAX_PHOTOS - next.length)
      .forEach((f) => next.push(f));
    updatePhotos(next);
  }, [photos, updatePhotos]);

  const removePhoto = useCallback((i: number) => {
    const next = photos.filter((_, idx) => idx !== i);
    updatePhotos(next);
  }, [photos, updatePhotos]);

  function progress() {
    const steps = [
      !!(form.lat && form.lng && form.obsDate),
      true,
      photos.length > 0,
      !!(form.telemEnabled && telemFile),
      true,
    ];
    return steps;
  }

  function validate(): boolean {
    const errs: Errors = {};
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const obsDate = form.obsDate ? new Date(form.obsDate + 'T00:00:00') : null;

    if (isNaN(lat) || lat < -90 || lat > 90) errs.lat = 'Enter a valid latitude';
    if (isNaN(lng) || lng < -180 || lng > 180) errs.lng = 'Enter a valid longitude';
    if (!form.obsDate || !obsDate || obsDate > today)
      errs.date = !form.obsDate ? 'Date is required' : 'Date cannot be in the future';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);

    const sightingId = uuid();
    const grid = GeneralizationEngine.snapToGrid(parseFloat(form.lat), parseFloat(form.lng));
    let telemData: TelemetryAttachment | null = null;

    if (form.telemEnabled && telemFile) {
      telemData = {
        file_name: telemFile.name,
        file_size: telemFile.size,
        tag_id: form.telemTagId || null,
        deploy_date: form.telemDeployDate || null,
        notes: form.telemNotes || null,
      };
    }

    const payload = {
      id: sightingId,
      submitted_at: new Date().toISOString(),
      status: 'pending',
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      accuracy_m: 20,
      count: form.count,
      behavior: form.behavior || 'unknown',
      depth_m: parseFloat(form.depthM) || null,
      water_temp_c: parseFloat(form.waterTempC) || null,
      submitter_name: form.subName || null,
      submitter_email: form.subEmail || null,
      submitter_type: form.submitterType,
      notes: form.notes || null,
      photo_urls: null,
      telemetry_data: telemData,
      reviewed_by: null, reviewed_at: null, reject_reason: null,
      ...grid,
    };

    const { error: insertError } = await supabase.from('sightings').insert([payload]);
    if (insertError) {
      alert('Error submitting sighting: ' + insertError.message);
      setSubmitting(false);
      return;
    }

    if (photos.length) {
      setPhotoProgress(true);
      const urls: string[] = [];
      for (const file of photos) {
        try { urls.push(await uploadPhoto(file, sightingId)); } catch { /* skip */ }
      }
      setPhotoProgress(false);
      await updateSightingPhotos(sightingId, urls);
    }

    setSuccessId(sightingId.slice(0, 8).toUpperCase());
    setSubmitting(false);
  }

  function resetForm() {
    setForm({
      lat: '', lng: '', obsDate: new Date().toISOString().slice(0, 10),
      obsTime: '', count: 10, behavior: null,
      depthM: '', waterTempC: '', notes: '',
      subName: '', subEmail: '', submitterType: 'public',
      telemEnabled: false, telemTagId: '', telemDeployDate: '', telemNotes: '',
    });
    updatePhotos([]);
    setTelemFile(null);
    setErrors({});
    setSuccessId(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  }

  function useGPS() {
    setGpsStatus({ msg: 'Locating…', type: 'idle' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) }));
        setGpsStatus({ msg: '✓ Location acquired', type: 'ok' });
      },
      () => {
        setGpsStatus({ msg: 'Location failed — enter coordinates manually', type: 'err' });
      }
    );
  }

  const progressSteps = progress();

  if (successId) {
    return (
      <div className={styles.wrapper}>
        <SiteHeader />
        <div className={styles.successScreen}>
          <div className={styles.successRay}>✓</div>
          <h2>Sighting submitted</h2>
          <p>Thank you for contributing to cownose ray migration research. Your sighting is in the review queue and will appear on the map once approved.</p>
          <div className={styles.successId}>Sighting ID: {successId}</div>
          <br />
          <button className={styles.btnAnother} onClick={resetForm}>Submit another sighting</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <SiteHeader />
      <h1 className={styles.h1}>Report a <span>sighting</span></h1>
      <p className={styles.subtitle}>Help track cownose ray migration. Your exact location is kept private — only generalized zones are shown publicly.</p>

      {/* Progress */}
      <div className={styles.progressBar}>
        {progressSteps.map((done, i) => (
          <div key={i} className={`${styles.progStep} ${done ? styles.progStepDone : i === 0 ? styles.progStepActive : ''}`} />
        ))}
      </div>

      {/* Card 1: Location */}
      <div className={styles.card}>
        <CardTitle num={1} text="Location & time" />
        <div className={styles.gpsRow} style={{ marginBottom: 12 }}>
          <div className={styles.gpsInputs}>
            <div>
              <label className={styles.label}>Latitude <span className={styles.req}>*</span></label>
              <input
                type="number" className={`${styles.input} ${errors.lat ? styles.inputError : ''}`}
                step="0.00001" placeholder="36.85000" min="-90" max="90"
                value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
              />
              {errors.lat && <div className={styles.fieldError}>{errors.lat}</div>}
            </div>
            <div>
              <label className={styles.label}>Longitude <span className={styles.req}>*</span></label>
              <input
                type="number" className={`${styles.input} ${errors.lng ? styles.inputError : ''}`}
                step="0.00001" placeholder="-75.98000" min="-180" max="180"
                value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
              />
              {errors.lng && <div className={styles.fieldError}>{errors.lng}</div>}
            </div>
          </div>
          <button className={styles.btnGps} onClick={useGPS}>📍 Use GPS</button>
        </div>
        {gpsStatus.msg && (
          <div className={`${styles.gpsStatus} ${gpsStatus.type === 'ok' ? styles.gpsOk : gpsStatus.type === 'err' ? styles.gpsErr : ''}`}>
            {gpsStatus.msg}
          </div>
        )}
        <div className={`${styles.fieldRow} ${styles.cols2}`} style={{ marginTop: 10 }}>
          <div>
            <label className={styles.label}>Date <span className={styles.req}>*</span></label>
            <input
              type="date" className={`${styles.input} ${errors.date ? styles.inputError : ''}`}
              value={form.obsDate} onChange={(e) => setForm((f) => ({ ...f, obsDate: e.target.value }))}
            />
            {errors.date && <div className={styles.fieldError}>{errors.date}</div>}
          </div>
          <div>
            <label className={styles.label}>Time (approx.)</label>
            <input type="time" className={styles.input} value={form.obsTime} onChange={(e) => setForm((f) => ({ ...f, obsTime: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Card 2: Observation */}
      <div className={styles.card}>
        <CardTitle num={2} text="Observation details" />
        <div style={{ marginBottom: 12 }}>
          <label className={styles.label}>Estimated ray count <span className={styles.req}>*</span></label>
          <div className={styles.countDisplay}>
            <input
              type="range" min={1} max={500} step={1} value={form.count}
              onChange={(e) => setForm((f) => ({ ...f, count: +e.target.value }))}
              style={{ flex: 1, accentColor: 'var(--ray)' }}
            />
            <div className={styles.countVal}>{form.count}</div>
          </div>
          <div className={styles.countNote}>
            {form.count < 5 ? 'Individual rays' : form.count < 50 ? 'Small school' : form.count < 200 ? 'Medium aggregation' : 'Large school or migration front'}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className={styles.label}>Behavior observed</label>
          <div className={styles.chipRow}>
            {(['feeding', 'transiting', 'resting', 'unknown'] as BehaviorType[]).map((b) => (
              <button
                key={b} className={`${styles.chip} ${form.behavior === b ? styles.chipSelected : ''}`}
                onClick={() => setForm((f) => ({ ...f, behavior: b }))}
              >
                {b.charAt(0).toUpperCase() + b.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className={`${styles.fieldRow} ${styles.cols2}`}>
          <div>
            <label className={styles.label}>Water depth (m)</label>
            <input type="number" className={styles.input} step="0.5" min="0" max="200" placeholder="e.g. 3" value={form.depthM} onChange={(e) => setForm((f) => ({ ...f, depthM: e.target.value }))} />
          </div>
          <div>
            <label className={styles.label}>Water temp (°C)</label>
            <input type="number" className={styles.input} step="0.5" min="0" max="35" placeholder="e.g. 22" value={form.waterTempC} onChange={(e) => setForm((f) => ({ ...f, waterTempC: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Card 3: Photos */}
      <div className={styles.card}>
        <CardTitle num={3} text="Photos" />
        {photos.length === 0 ? (
          <div
            ref={dropzoneRef}
            className={styles.dropzone}
            onDragOver={(e) => { e.preventDefault(); dropzoneRef.current?.classList.add(styles.dropzoneDrag); }}
            onDragLeave={() => dropzoneRef.current?.classList.remove(styles.dropzoneDrag)}
            onDrop={(e) => { e.preventDefault(); dropzoneRef.current?.classList.remove(styles.dropzoneDrag); addPhotos(e.dataTransfer.files); }}
            onClick={() => photoInputRef.current?.click()}
          >
            <input ref={photoInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display: 'none' }} onChange={(e) => addPhotos(e.target.files)} />
            <div className={styles.dropzoneIcon}>📷</div>
            <div className={styles.dropzoneText}>Drop photos or <strong>tap to upload</strong><br /><span style={{ fontSize: '.75rem', opacity: .6 }}>Up to 5 photos · EXIF location stripped automatically</span></div>
          </div>
        ) : (
          <div className={styles.photoGrid}>
            {photos.map((_, i) => (
              <div key={i} className={styles.photoThumb}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreviews[i]} alt={`Photo ${i + 1}`} />
                <button className={styles.removeBtn} onClick={() => removePhoto(i)}>×</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className={styles.photoAddBtn}>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => addPhotos(e.target.files)} />
                +
              </label>
            )}
          </div>
        )}
        {photos.length > 0 && <div className={styles.photoCount}>{photos.length} / {MAX_PHOTOS} photos attached</div>}
        {photoProgress && <div className={styles.photoProgress}>Uploading photos…</div>}
        <div style={{ marginTop: 12 }}>
          <label className={styles.label}>Additional notes</label>
          <textarea className={styles.textarea} placeholder="Any other observations — water clarity, weather, nearby vessels, entanglement…" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>

      {/* Card 4: Telemetry */}
      <div className={styles.card}>
        <CardTitle num={4} text={<>Telemetry data <span style={{ fontSize: '.7rem', fontWeight: 400, color: 'var(--muted)', textTransform: 'none', letterSpacing: 0 }}>(researchers only)</span></>} />
        <div className={styles.telemToggle} onClick={() => setForm((f) => ({ ...f, telemEnabled: !f.telemEnabled }))}>
          <span className={styles.telemToggleLabel}>I have telemetry / tag data to attach</span>
          <div className={`${styles.toggleSw} ${form.telemEnabled ? styles.toggleSwOn : ''}`} />
        </div>
        {form.telemEnabled && (
          <div style={{ marginTop: 14 }}>
            <label className={styles.telemDropzone}>
              <input type="file" accept=".csv,.json,.gpx" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => setTelemFile(e.target.files?.[0] ?? null)} />
              <div style={{ fontSize: '1.2rem', opacity: .35, marginBottom: 6 }}>↑</div>
              <div>Drop telemetry file (.csv, .json, .gpx) or <strong style={{ color: 'var(--ray)' }}>browse</strong></div>
              <div style={{ fontSize: '.7rem', marginTop: 3, opacity: .6 }}>Raw track data is aggregated to grid cells before storage</div>
            </label>
            {telemFile && <div style={{ fontSize: '.78rem', color: 'var(--ray)', marginTop: 6 }}>✓ {telemFile.name} ({(telemFile.size / 1024).toFixed(1)} KB)</div>}
            <div className={`${styles.fieldRow} ${styles.cols2}`} style={{ marginTop: 10 }}>
              <div>
                <label className={styles.label}>Tag ID / Animal ID</label>
                <input type="text" className={styles.input} placeholder="e.g. CR-2024-007" value={form.telemTagId} onChange={(e) => setForm((f) => ({ ...f, telemTagId: e.target.value }))} />
              </div>
              <div>
                <label className={styles.label}>Deployment date</label>
                <input type="date" className={styles.input} value={form.telemDeployDate} onChange={(e) => setForm((f) => ({ ...f, telemDeployDate: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label className={styles.label}>Notes / study context</label>
              <textarea className={styles.textarea} rows={2} placeholder="Study name, institution, tagging method…" value={form.telemNotes} onChange={(e) => setForm((f) => ({ ...f, telemNotes: e.target.value }))} />
            </div>
          </div>
        )}
      </div>

      {/* Card 5: About you */}
      <div className={styles.card}>
        <CardTitle num={5} text="About you (optional)" />
        <div style={{ marginBottom: 14 }}>
          <label className={styles.label}>I am a…</label>
          <div className={styles.typeCards}>
            {([['public', '👤', 'Member of public'], ['fisherman', '⚓', 'Fisher / waterman'], ['researcher', '🔬', 'Researcher']] as [SubmitterType, string, string][]).map(([val, icon, lbl]) => (
              <div key={val} className={`${styles.typeCard} ${form.submitterType === val ? styles.typeCardSelected : ''}`} onClick={() => setForm((f) => ({ ...f, submitterType: val }))}>
                <div className={styles.typeIcon}>{icon}</div>
                <div className={styles.typeLabel}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
        <div className={`${styles.fieldRow} ${styles.cols2}`}>
          <div>
            <label className={styles.label}>Name</label>
            <input type="text" className={styles.input} placeholder="Optional" value={form.subName} onChange={(e) => setForm((f) => ({ ...f, subName: e.target.value }))} />
          </div>
          <div>
            <label className={styles.label}>Email (for updates)</label>
            <input type="email" className={styles.input} placeholder="Optional" value={form.subEmail} onChange={(e) => setForm((f) => ({ ...f, subEmail: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className={styles.privacyNote}>
        <span>🔒</span>
        <span>Your exact coordinates are stored privately and never shown publicly. Only generalized zone data (≈15km cells) is displayed on the public map. Photos have EXIF location data stripped. Email is used only to notify you when your sighting is approved.</span>
      </div>

      <button className={styles.btnSubmit} disabled={submitting} onClick={handleSubmit}>
        {submitting ? <><span className="rw-spinner" />Submitting…</> : 'Submit sighting'}
      </button>
    </div>
  );
}

function SiteHeader() {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.logoWrap}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round">
          <path d="M12 4 C6 4 2 10 2 14 C2 18 6 20 12 20 C18 20 22 18 22 14 C22 10 18 4 12 4Z" />
          <path d="M12 20 L8 23 M12 20 L16 23" />
          <circle cx="9" cy="12" r="1" fill="var(--bg)" />
        </svg>
      </div>
      <div>
        <div className={styles.siteName}>RayWatch</div>
        <div className={styles.siteSub}>Cownose Ray Migration Tracker</div>
      </div>
      <Link href="/map" className={styles.navLink}>View migration map →</Link>
    </header>
  );
}

function CardTitle({ num, text }: { num: number; text: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '.75rem', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ray)', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 20, height: 20, background: 'var(--ray)', borderRadius: '50%', fontSize: '.65rem', color: 'var(--bg)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{num}</span>
      {text}
    </div>
  );
}