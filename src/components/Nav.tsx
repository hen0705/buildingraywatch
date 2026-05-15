'use client';

import Link from 'next/link';

const RayIcon = ({ color = '#0a1628', size = 18 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 4C6 4 2 10 2 14c0 4 4 6 10 6s10-2 10-6c0-4-4-10-10-10Z" />
    <path d="M12 20l-4 3M12 20l4 3" />
  </svg>
);

export default function Nav() {
  return (
    <nav className="rw-nav">
      <Link href="/" className="rw-nav-brand">
        <div className="rw-nav-logo">
          <RayIcon />
        </div>
        <span className="rw-nav-name">RayWatch</span>
      </Link>
      <div className="rw-nav-links">
        <Link href="/map">Map</Link>
        <Link href="/submit">Report</Link>
        <Link href="/admin">Admin</Link>
        <Link href="/submit" className="cta">Report Sighting</Link>
      </div>
    </nav>
  );
}

export { RayIcon };