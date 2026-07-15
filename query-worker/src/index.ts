import { Client } from 'pg';

export interface Env {
  SUPABASE_DB: {
    connectionString: string;
  };
  API_SECRET_KEY?: string;
}

// Full-text search TSQuery builder matching the original logic
function buildTsQuery(q: string) {
  const cleanQ = q.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const terms = cleanQ.split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return '';
  return terms.map(t => `${t}:*`).join(' & ');
}

const SECTOR_PATTERNS: Record<string, string[]> = {
  roads: ['%highways%', '%nhai%', '%road%', '%pwd%', '%rwd%'],
  defense: ['%military%', '%mes%', '%weapons%', '%defence%'],
  energy: ['%coalfields%', '%lignite%', '%power%', '%bhel%'],
  petroleum: ['%bpcl%', '%indianoil%', '%hpcl%', '%petroleum%'],
  agriculture: ['%mandi%', '%agriculture%', '%coop%'],
  aviation: ['%airports%', '%aai%'],
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Simple CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Optional API key validation
    if (env.API_SECRET_KEY) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${env.API_SECRET_KEY}`) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Connect to Supabase via Hyperdrive connection string
    const client = new Client({
      connectionString: env.SUPABASE_DB.connectionString,
    });

    try {
      await client.connect();

      let result: any;
      switch (url.pathname) {
        case '/api/metrics/fiscal-heatmap':
          result = await handleFiscalHeatmap(url, client);
          break;
        case '/api/metrics/money-flow':
          result = await handleMoneyFlow(url, client);
          break;
        case '/api/metrics/iri':
          result = await handleIri(url, client);
          break;
        case '/api/search':
          result = await handleSearch(url, client);
          break;
        case '/api/alerts/subscribe':
          if (request.method !== 'POST') {
            return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
              status: 405,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          const body = await request.json();
          result = await handleSubscribe(body, client);
          break;
        default:
          return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('Error in Worker endpoint:', err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      ctx.waitUntil(client.end());
    }
  }
};

async function handleFiscalHeatmap(url: URL, client: Client) {
  const org = url.searchParams.get('org') || '';

  // Get daily awards list. Cast fields to ensure JS driver handles them cleanly.
  const queryText = `
    SELECT award_date::text, contracts::integer, total_value::double precision, single_bid_count::integer
    FROM daily_awards 
    WHERE org_name = $1 
    ORDER BY award_date ASC
  `;
  const dbRes = await client.query(queryText, [org]);
  
  const data = dbRes.rows.map(r => {
    const dateStr = r.award_date;
    const parts = dateStr.split('-');
    if (parts.length < 3) return null;

    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const d = parseInt(parts[2]);

    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay();
    const onejan = new Date(y, 0, 1);
    const weekNum = Math.ceil(((dateObj.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);

    const contracts = Number(r.contracts);
    const singleBidRate = contracts > 0 ? (Number(r.single_bid_count) / contracts) * 100 : 0;

    return {
      date: dateStr,
      day: dayOfWeek,
      week: weekNum,
      month: m,
      year: y,
      value: r.total_value ? Number(r.total_value) : 0,
      contracts,
      singleBidRate: parseFloat(singleBidRate.toFixed(1))
    };
  }).filter(Boolean);

  return {
    success: true,
    org: org || 'All Departments',
    data
  };
}

async function handleMoneyFlow(url: URL, client: Client) {
  const org = url.searchParams.get('org') || '';
  const limit = parseInt(url.searchParams.get('limit') || '8');

  let nodes: any[] = [];
  let links: any[] = [];

  if (org) {
    const queryText = `
      SELECT vendor_name, total_value::double precision as total_value, contracts::integer as contracts
      FROM money_flow_vendors
      WHERE org_name = $1
      ORDER BY rank ASC
      LIMIT $2
    `;
    const dbRes = await client.query(queryText, [org, limit]);
    const vendorRows = dbRes.rows;

    if (vendorRows.length === 0) {
      return {
        success: true,
        org,
        data: { nodes: [], links: [] }
      };
    }

    const totalValue = vendorRows.reduce((sum, r) => sum + Number(r.total_value), 0);
    nodes.push({ id: 'org', name: org, type: 'department', value: totalValue });

    vendorRows.forEach((r, idx) => {
      const vid = `v${idx}`;
      const vendorLabel = r.vendor_name.length > 30 ? r.vendor_name.substring(0, 28) + '...' : r.vendor_name;
      nodes.push({ 
        id: vid, 
        name: vendorLabel, 
        type: 'vendor', 
        value: Number(r.total_value), 
        fullName: r.vendor_name, 
        contracts: r.contracts 
      });
      links.push({ source: 'org', target: vid, value: Number(r.total_value) });
    });
  } else {
    const queryText = `
      SELECT org_name, total_value::double precision as total_value, total_contracts::integer as total_contracts
      FROM org_stats
      ORDER BY total_value DESC
      LIMIT $1
    `;
    const dbRes = await client.query(queryText, [limit]);
    const deptRows = dbRes.rows;

    if (deptRows.length === 0) {
      return {
        success: true,
        org: 'All Departments',
        data: { nodes: [], links: [] }
      };
    }

    // Batch query for top 3 vendors across selected organizations
    const deptNames = deptRows.map(d => d.org_name);
    const vendorQueryText = `
      SELECT org_name, vendor_name, total_value::double precision as total_value, rank::integer as rank
      FROM money_flow_vendors
      WHERE org_name = ANY($1) AND rank <= 3
    `;
    const vendorRes = await client.query(vendorQueryText, [deptNames]);
    const vendorRows = vendorRes.rows;

    const vendorsByOrg: Record<string, any[]> = {};
    vendorRows.forEach(v => {
      (vendorsByOrg[v.org_name] = vendorsByOrg[v.org_name] || []).push(v);
    });

    const grandTotal = deptRows.reduce((sum, r) => sum + Number(r.total_value), 0);
    nodes.push({ id: 'total', name: 'Total Procurement Budget', type: 'total', value: grandTotal });

    deptRows.forEach((d, dIdx) => {
      const did = `d${dIdx}`;
      const deptLabel = d.org_name.length > 25 ? d.org_name.substring(0, 23) + '...' : d.org_name;
      nodes.push({ 
        id: did, 
        name: deptLabel, 
        type: 'department', 
        value: Number(d.total_value), 
        fullName: d.org_name, 
        contracts: Number(d.total_contracts) 
      });
      links.push({ source: 'total', target: did, value: Number(d.total_value) });

      const topVendors = (vendorsByOrg[d.org_name] || []).sort((a, b) => a.rank - b.rank);
      topVendors.forEach((v, vIdx) => {
        const vid = `${did}_v${vIdx}`;
        const vendorLabel = v.vendor_name.length > 22 ? v.vendor_name.substring(0, 20) + '...' : v.vendor_name;
        nodes.push({ id: vid, name: vendorLabel, type: 'vendor', value: Number(v.total_value), fullName: v.vendor_name });
        links.push({ source: did, target: vid, value: Number(v.total_value) });
      });
    });
  }

  return {
    success: true,
    org: org || 'All Departments',
    data: { nodes, links }
  };
}

async function handleIri(url: URL, client: Client) {
  const org = url.searchParams.get('org') || '';
  const vendor = url.searchParams.get('vendor') || '';

  const w1 = parseFloat(url.searchParams.get('w1') || '0.4');
  const w2 = parseFloat(url.searchParams.get('w2') || '0.4');
  const w3 = parseFloat(url.searchParams.get('w3') || '0.2');

  const sumW = w1 + w2 + w3;
  const weightSingle = sumW > 0 ? w1 / sumW : 0.4;
  const weightRush = sumW > 0 ? w2 / sumW : 0.4;
  const weightDelay = sumW > 0 ? w3 / sumW : 0.2;

  if (!org && !vendor) {
    // Leaderboard
    const queryText = `
      SELECT org_name, total_contracts::integer as total_contracts, total_value::double precision as total_value, 
             single_bid_count::integer as single_bid_count, avg_bids::double precision as avg_bids, 
             avg_delay_days::double precision as avg_delay_days
      FROM org_stats
      WHERE total_contracts > 10
      ORDER BY org_name ASC
    `;
    const dbRes = await client.query(queryText);
    const orgs = dbRes.rows;

    const listData = orgs
      .map(item => {
        const totalContracts = Number(item.total_contracts);
        const singleBidRate = totalContracts ? Number(item.single_bid_count) / totalContracts : 0;
        const delayFactor = Math.min(1.0, (Number(item.avg_delay_days) || 0) / 180.0);
        const iri = (singleBidRate * 0.6 + delayFactor * 0.4) * 100.0;

        return {
          name: item.org_name,
          totalContracts,
          singleBidCount: Number(item.single_bid_count),
          singleBidRate: parseFloat((singleBidRate * 100).toFixed(1)),
          avgBids: item.avg_bids ? parseFloat(Number(item.avg_bids).toFixed(2)) : 0,
          avgDelayDays: item.avg_delay_days ? parseFloat(Number(item.avg_delay_days).toFixed(1)) : 0,
          iri: parseFloat(iri.toFixed(1))
        };
      })
      .sort((a, b) => b.iri - a.iri)
      .slice(0, 20);

    return {
      success: true,
      type: 'leaderboard',
      weights: { SingleBid: weightSingle, RushJob: weightRush, AwardDelay: weightDelay },
      data: listData
    };
  }

  if (vendor) {
    return {
      success: true,
      targetType: 'vendor',
      targetName: vendor,
      totalContracts: 0,
      iri: 0,
      components: { singleBidRate: 0, rushJobRate: 0, delayedAwardRate: 0 }
    };
  }

  const queryText = `
    SELECT total_contracts::integer as total_contracts, single_bid_count::integer as single_bid_count, 
           rush_job_count::integer as rush_job_count, delayed_award_count::integer as delayed_award_count, 
           avg_bids::double precision as avg_bids, avg_delay_days::double precision as avg_delay_days
    FROM org_stats
    WHERE org_name = $1
    LIMIT 1
  `;
  const dbRes = await client.query(queryText, [org]);
  const stats = dbRes.rows[0];

  if (!stats || Number(stats.total_contracts) === 0) {
    return {
      success: true,
      targetType: 'organization',
      targetName: org,
      totalContracts: 0,
      iri: 0,
      components: { singleBidRate: 0, rushJobRate: 0, delayedAwardRate: 0 }
    };
  }

  const total = Number(stats.total_contracts);
  const singleBidRate = (Number(stats.single_bid_count) || 0) / total;
  const rushJobRate = (Number(stats.rush_job_count) || 0) / total;
  const delayedAwardRate = (Number(stats.delayed_award_count) || 0) / total;

  const iri = (
    (singleBidRate * weightSingle) +
    (rushJobRate * weightRush) +
    (delayedAwardRate * weightDelay)
  ) * 100.0;

  return {
    success: true,
    targetType: 'organization',
    targetName: org,
    totalContracts: total,
    iri: parseFloat(iri.toFixed(1)),
    avgBids: stats.avg_bids ? parseFloat(Number(stats.avg_bids).toFixed(2)) : 0,
    avgDelayDays: stats.avg_delay_days ? parseFloat(Number(stats.avg_delay_days).toFixed(1)) : 0,
    weights: {
      SingleBid: parseFloat(weightSingle.toFixed(2)),
      RushJob: parseFloat(weightRush.toFixed(2)),
      AwardDelay: parseFloat(weightDelay.toFixed(2))
    },
    components: {
      singleBidCount: Number(stats.single_bid_count) || 0,
      singleBidRate: parseFloat((singleBidRate * 100).toFixed(1)),
      rushJobCount: Number(stats.rush_job_count) || 0,
      rushJobRate: parseFloat((rushJobRate * 100).toFixed(1)),
      delayedAwardCount: Number(stats.delayed_award_count) || 0,
      delayedAwardRate: parseFloat((delayedAwardRate * 100).toFixed(1))
    }
  };
}

async function handleSearch(url: URL, client: Client) {
  const q = url.searchParams.get('q') || '';
  const minBids = url.searchParams.get('minBids') ? parseInt(url.searchParams.get('minBids')!) : null;
  const maxBids = url.searchParams.get('maxBids') ? parseInt(url.searchParams.get('maxBids')!) : null;
  const minVal = url.searchParams.get('minVal') ? parseFloat(url.searchParams.get('minVal')!) : null;
  const maxVal = url.searchParams.get('maxVal') ? parseFloat(url.searchParams.get('maxVal')!) : null;
  const state = url.searchParams.get('state') || '';
  const sector = url.searchParams.get('sector') || '';
  const entity = url.searchParams.get('entity') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
  const offset = (page - 1) * limit;

  let whereClauses: string[] = [];
  let queryParams: any[] = [];

  if (q) {
    const tsq = buildTsQuery(q);
    if (tsq) {
      queryParams.push(tsq);
      whereClauses.push(`fts @@ to_tsquery('english', $${queryParams.length})`);
    }
  }

  if (minBids !== null) {
    queryParams.push(minBids);
    whereClauses.push(`bids_received >= $${queryParams.length}`);
  }
  if (maxBids !== null) {
    queryParams.push(maxBids);
    whereClauses.push(`bids_received <= $${queryParams.length}`);
  }
  if (minVal !== null) {
    queryParams.push(minVal * 10000000); // Crores to Rs
    whereClauses.push(`contract_value >= $${queryParams.length}`);
  }
  if (maxVal !== null) {
    queryParams.push(maxVal * 10000000); // Crores to Rs
    whereClauses.push(`contract_value <= $${queryParams.length}`);
  }
  if (state) {
    queryParams.push(state);
    whereClauses.push(`org_name = $${queryParams.length}`);
  }
  if (entity) {
    queryParams.push(entity);
    whereClauses.push(`org_name = $${queryParams.length}`);
  }
  if (sector && SECTOR_PATTERNS[sector]) {
    const patterns = SECTOR_PATTERNS[sector];
    const ilikeClauses = patterns.map(p => {
      queryParams.push(p);
      return `org_name ILIKE $${queryParams.length}`;
    });
    whereClauses.push(`(${ilikeClauses.join(' OR ')})`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // 1. Get total count
  const countQuery = `SELECT COUNT(*)::integer as count FROM tender_search_index ${whereSql}`;
  const countRes = await client.query(countQuery, queryParams);
  const total = countRes.rows[0]?.count || 0;

  // 2. Get paginated data
  const dataParams = [...queryParams];
  dataParams.push(limit);
  const limitPlaceholder = `$${dataParams.length}`;
  dataParams.push(offset);
  const offsetPlaceholder = `$${dataParams.length}`;

  const dataQuery = `
    SELECT internal_id, tender_id, org_name, title, vendor_name, 
           contract_value::double precision as contract_value, bids_received::integer as bids_received, 
           published_date::text, closing_date::text, contract_date::text, 
           award_delay_days::integer, bid_window_days::integer
    FROM tender_search_index
    ${whereSql}
    ORDER BY closing_date DESC NULLS LAST
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;

  const dataRes = await client.query(dataQuery, dataParams);

  const results = dataRes.rows.map(r => ({
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

  return {
    success: true,
    data: results,
    total,
    page,
    limit,
    indexFloorCrores: 5
  };
}

async function handleSubscribe(body: any, client: Client) {
  const { email, webhookUrl, alertType, minValue, orgName } = body;

  if (!email) {
    throw new Error("Email is required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email format");
  }

  const subscriptionId = crypto.randomUUID();

  const queryText = `
    INSERT INTO alert_subscriptions (id, email, webhook_url, alert_type, org_name, min_value)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;
  await client.query(queryText, [
    subscriptionId,
    email,
    webhookUrl || null,
    alertType || null,
    orgName || null,
    minValue || null
  ]);

  return {
    success: true,
    subscriptionId,
    message: "Subscription successfully registered for watchdog alerts."
  };
}
