import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RayWatch — Cownose Ray Migration Tracker',
  description:
    'Crowd-sourced sightings, researcher telemetry, and bycatch risk analytics across the Chesapeake Bay and Mid-Atlantic coast.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}