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

    // Check if Cloudflare Worker proxy is available
    if (process.env.DB_SERVICE_WORKER_URL) {
        try {
            const workerUrl = new URL('/api/search', process.env.DB_SERVICE_WORKER_URL);
            workerUrl.search = searchParams.toString();
            
            const headers = {};
            if (process.env.DB_SERVICE_WORKER_SECRET) {
                headers['Authorization'] = `Bearer ${process.env.DB_SERVICE_WORKER_SECRET}`;
            }
            
            const res = await fetch(workerUrl.toString(), { headers });
            if (res.ok) {
                const data = await res.json();
                return NextResponse.json(data);
            }
            console.warn("DB service worker returned error status, falling back to direct Supabase query:", res.status);
        } catch (workerErr) {
            console.error("DB service worker fetch failed, falling back to direct Supabase query:", workerErr);
        }
    }

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

    // The index holds high-value contracts (>= 1 Cr); the heavy raw dataset
    // stays in R2 per the storage split.
    const tsq = q ? buildTsQuery(q) : '';

    // Apply the same filters to any query builder (data + count share these).
    const applyFilters = (query) => {
      if (tsq) query = query.textSearch('fts', tsq);
      if (minBids !== null) query = query.gte('bids_received', minBids);
      if (maxBids !== null) query = query.lte('bids_received', maxBids);
      if (minVal !== null) query = query.gte('contract_value', minVal * 10000000);
      if (maxVal !== null) query = query.lte('contract_value', maxVal * 10000000);
      if (state) query = query.eq('org_name', state);
      if (entity) query = query.eq('org_name', entity);
      if (sector && SECTOR_PATTERNS[sector]) {
        query = query.or(SECTOR_PATTERNS[sector].map(p => `org_name.ilike.${p}`).join(','));
      }
      return query;
    };

    // Data: order by contract_value (idx_tsi_value) rather than closing_date so
    // value/bid filters without a keyword use the index instead of a full sort
    // (which hit the free-tier statement timeout). Highest-value-first is also
    // the most useful default ordering for a procurement watchdog.
    const dataCols =
      'internal_id, tender_id, org_name, title, vendor_name, contract_value, bids_received, published_date, closing_date, contract_date, award_delay_days, bid_window_days';
    // Fetch one extra row to know whether a next page exists, without an
    // expensive COUNT: exact counts over the 344k-row index time out on the
    // free tier and planner estimates are unreliable for value ranges. The
    // data query itself is fast for every filter (idx_tsi_value / GIN).
    const { data, error } = await applyFilters(
      supabase.from('tender_search_index').select(dataCols)
    )
      .order('contract_value', { ascending: false })
      .range(offset, offset + limit); // limit+1 rows

    if (error) throw new Error(error.message);

    const hasMore = (data || []).length > limit;
    const pageRows = (data || []).slice(0, limit);

    const results = pageRows.map(r => ({
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
      hasMore,
      page,
      limit,
      indexFloorCrores: 1
    });
  } catch (error) {
    console.error('Database query error in search:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
