// src/app/api/inat/route.ts
import { NextRequest, NextResponse } from 'next/server';

const COWNOSE_RAY_TAXON_ID = 70449;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const swlat = searchParams.get('swlat');
  const swlng = searchParams.get('swlng');
  const nelat = searchParams.get('nelat');
  const nelng = searchParams.get('nelng');

  if (!swlat || !swlng || !nelat || !nelng) {
    return NextResponse.json({ error: 'Missing bounds' }, { status: 400 });
  }

  const params = new URLSearchParams({
    taxon_id: String(COWNOSE_RAY_TAXON_ID),
    nelat, nelng, swlat, swlng,
    per_page: '100',
    order_by: 'observed_on',
    order: 'desc',
    quality_grade: 'research,needs_id',
  });

  try {
    const res = await fetch(
      `https://api.inaturalist.org/v1/observations?${params.toString()}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `iNat API error: ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
