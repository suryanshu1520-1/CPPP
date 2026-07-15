import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get('org') || '';
    const vendor = searchParams.get('vendor') || '';

    // Check if Cloudflare Worker proxy is available
    if (process.env.DB_SERVICE_WORKER_URL) {
        try {
            const workerUrl = new URL('/api/metrics/iri', process.env.DB_SERVICE_WORKER_URL);
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

    const w1 = parseFloat(searchParams.get('w1') || '0.4');
    const w2 = parseFloat(searchParams.get('w2') || '0.4');
    const w3 = parseFloat(searchParams.get('w3') || '0.2');

    const sumW = w1 + w2 + w3;
    const weightSingle = sumW > 0 ? w1 / sumW : 0.4;
    const weightRush = sumW > 0 ? w2 / sumW : 0.4;
    const weightDelay = sumW > 0 ? w3 / sumW : 0.2;

    if (!org && !vendor) {
      // Leaderboard: top 20 highest-risk organizations by single-bid rate.
      // PostgREST caps responses at 1000 rows, so page through all orgs.
      const orgs = [];
      for (let from = 0; ; from += 1000) {
        const { data: page, error } = await supabase
          .from('org_stats')
          .select('org_name, total_contracts, total_value, single_bid_count, avg_bids, avg_delay_days')
          .gt('total_contracts', 10)
          .order('org_name', { ascending: true })
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        orgs.push(...(page || []));
        if (!page || page.length < 1000) break;
      }

      const listData = (orgs || [])
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

      return NextResponse.json({
        success: true,
        type: 'leaderboard',
        weights: { SingleBid: weightSingle, RushJob: weightRush, AwardDelay: weightDelay },
        data: listData
      });
    }

    // Vendor-level IRI needs per-vendor aggregates, which live in the raw R2
    // dataset rather than the Supabase aggregate layer. The dashboard only
    // requests org-level scores; return an empty result for vendor queries.
    if (vendor) {
      return NextResponse.json({
        success: true,
        targetType: 'vendor',
        targetName: vendor,
        totalContracts: 0,
        iri: 0,
        components: { singleBidRate: 0, rushJobRate: 0, delayedAwardRate: 0 }
      });
    }

    const { data: stats, error } = await supabase
      .from('org_stats')
      .select('total_contracts, single_bid_count, rush_job_count, delayed_award_count, avg_bids, avg_delay_days')
      .eq('org_name', org)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!stats || Number(stats.total_contracts) === 0) {
      return NextResponse.json({
        success: true,
        targetType: 'organization',
        targetName: org,
        totalContracts: 0,
        iri: 0,
        components: { singleBidRate: 0, rushJobRate: 0, delayedAwardRate: 0 }
      });
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

    return NextResponse.json({
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
    });

  } catch (error) {
    console.error("Error in IRI API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
