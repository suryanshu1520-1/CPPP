import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Build a Postgres tsquery string with AND'd prefix terms
 * (e.g. "road nhai" -> "road:* & nhai:*")
 */
function buildTsQuery(q) {
  const cleanQ = q.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const terms = cleanQ.split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return '';
  return terms.map(t => `${t}:*`).join(' & ');
}

const SECTOR_PATTERNS = {
  roads: ['%highways%', '%nhai%', '%road%', '%pwd%', '%rwd%'],
  defense: ['%military%', '%mes%', '%weapons%', '%defence%'],
  energy: ['%coalfields%', '%lignite%', '%power%', '%bhel%'],
  petroleum: ['%bpcl%', '%indianoil%', '%hpcl%', '%petroleum%'],
  agriculture: ['%mandi%', '%agriculture%', '%coop%'],
  aviation: ['%airports%', '%aai%'],
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const minBids = searchParams.get('minBids') ? parseInt(searchParams.get('minBids')) : null;
    const maxBids = searchParams.get('maxBids') ? parseInt(searchParams.get('maxBids')) : null;
    const minVal = searchParams.get('minVal') ? parseFloat(searchParams.get('minVal')) : null;
    const maxVal = searchParams.get('maxVal') ? parseFloat(searchParams.get('maxVal')) : null;
    const state = searchParams.get('state') || '';
    const sector = searchParams.get('sector') || '';
    const entity = searchParams.get('entity') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const offset = (page - 1) * limit;

    // The index holds high-value contracts (>= 5 Cr); the heavy raw dataset
    // stays in R2 per the storage split.
    let query = supabase
      .from('tender_search_index')
      .select(
        'internal_id, tender_id, org_name, title, vendor_name, contract_value, bids_received, published_date, closing_date, contract_date, award_delay_days, bid_window_days',
        { count: 'exact' }
      );

    if (q) {
      const tsq = buildTsQuery(q);
      if (tsq) query = query.textSearch('fts', tsq);
    }
    if (minBids !== null) query = query.gte('bids_received', minBids);
    if (maxBids !== null) query = query.lte('bids_received', maxBids);
    if (minVal !== null) query = query.gte('contract_value', minVal * 10000000);
    if (maxVal !== null) query = query.lte('contract_value', maxVal * 10000000);
    if (state) query = query.eq('org_name', state);
    if (entity) query = query.eq('org_name', entity);
    if (sector && SECTOR_PATTERNS[sector]) {
      query = query.or(SECTOR_PATTERNS[sector].map(p => `org_name.ilike.${p}`).join(','));
    }

    const { data, error, count } = await query
      .order('closing_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    const results = (data || []).map(r => ({
      contractId: r.internal_id,
      tenderId: r.tender_id,
      department: r.org_name,
      title: r.title,
      value: r.contract_value ? Number(r.contract_value) : 0,
      bids: r.bids_received,
      vendor: r.vendor_name,
      publishedDate: r.published_date,
      closingDate: r.closing_date,
      contractDate: r.contract_date,
      awardDelay: r.award_delay_days,
      bidWindow: r.bid_window_days,
    }));

    return NextResponse.json({
      success: true,
      data: results,
      total: count ?? results.length,
      page,
      limit,
      indexFloorCrores: 5
    });
  } catch (error) {
    console.error('Database query error in search:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
