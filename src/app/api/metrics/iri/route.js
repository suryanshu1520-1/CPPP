import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/postgres';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get('org') || '';
    const vendor = searchParams.get('vendor') || '';

    const w1 = parseFloat(searchParams.get('w1') || '0.4');
    const w2 = parseFloat(searchParams.get('w2') || '0.4');
    const w3 = parseFloat(searchParams.get('w3') || '0.2');

    const sumW = w1 + w2 + w3;
    const weightSingle = sumW > 0 ? w1 / sumW : 0.4;
    const weightRush = sumW > 0 ? w2 / sumW : 0.4;
    const weightDelay = sumW > 0 ? w3 / sumW : 0.2;

    let targetType = '';
    let targetName = '';
    let sql = '';

    if (org) {
      targetType = 'organization';
      targetName = org;
      sql = `
        SELECT 
          COUNT(*)::int as "totalContracts",
          SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END)::int as "singleBidCount",
          SUM(CASE WHEN bid_window_days >= 0 AND bid_window_days < 7 THEN 1 ELSE 0 END)::int as "rushJobCount",
          SUM(CASE WHEN award_delay_days > 180 THEN 1 ELSE 0 END)::int as "delayedAwardCount",
          AVG(bids_received)::numeric(10,2) as "avgBids",
          AVG(award_delay_days)::numeric(10,1) as "avgDelayDays"
        FROM aoc_clean
        WHERE org_name = $1
      `;
    } else if (vendor) {
      targetType = 'vendor';
      targetName = vendor;
      sql = `
        SELECT 
          COUNT(*)::int as "totalContracts",
          SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END)::int as "singleBidCount",
          SUM(CASE WHEN bid_window_days >= 0 AND bid_window_days < 7 THEN 1 ELSE 0 END)::int as "rushJobCount",
          SUM(CASE WHEN award_delay_days > 180 THEN 1 ELSE 0 END)::int as "delayedAwardCount",
          AVG(bids_received)::numeric(10,2) as "avgBids",
          AVG(award_delay_days)::numeric(10,1) as "avgDelayDays"
        FROM aoc_clean
        WHERE vendor_name = $1
      `;
    } else {
      // Leaderboard: top 20 highest-risk organizations
      const highRiskOrgs = await query(`
        SELECT 
          org_name as name,
          COUNT(*)::int as "totalContracts",
          SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END)::int as "singleBidCount",
          AVG(bids_received)::numeric(10,2) as "avgBids",
          AVG(award_delay_days)::numeric(10,1) as "avgDelayDays"
        FROM aoc_clean
        WHERE org_name IS NOT NULL AND org_name != 'Unknown' AND org_name != ''
        GROUP BY org_name
        HAVING COUNT(*) > 10
        ORDER BY 
          (SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END)::float / COUNT(*)::float) DESC,
          COUNT(*) DESC
        LIMIT 20
      `);

      const listData = highRiskOrgs.map(item => {
        const totalContracts = Number(item.totalContracts);
        const singleBidRate = totalContracts ? (Number(item.singleBidCount) / totalContracts) : 0;
        const delayFactor = Math.min(1.0, (Number(item.avgDelayDays) || 0) / 180.0);
        const iri = (singleBidRate * 0.6 + delayFactor * 0.4) * 100.0;

        return {
          name: item.name,
          totalContracts,
          singleBidCount: Number(item.singleBidCount),
          singleBidRate: parseFloat((singleBidRate * 100).toFixed(1)),
          avgBids: item.avgBids ? parseFloat(Number(item.avgBids).toFixed(2)) : 0,
          avgDelayDays: item.avgDelayDays ? parseFloat(Number(item.avgDelayDays).toFixed(1)) : 0,
          iri: parseFloat(iri.toFixed(1))
        };
      }).sort((a, b) => b.iri - a.iri);

      return NextResponse.json({
        success: true,
        type: 'leaderboard',
        weights: { SingleBid: weightSingle, RushJob: weightRush, AwardDelay: weightDelay },
        data: listData
      });
    }

    const stats = await queryOne(sql, [targetName]);

    if (!stats || Number(stats.totalContracts) === 0) {
      return NextResponse.json({
        success: true,
        targetType,
        targetName,
        totalContracts: 0,
        iri: 0,
        components: { singleBidRate: 0, rushJobRate: 0, delayedAwardRate: 0 }
      });
    }

    const total = Number(stats.totalContracts);
    const singleBidRate = (Number(stats.singleBidCount) || 0) / total;
    const rushJobRate = (Number(stats.rushJobCount) || 0) / total;
    const delayedAwardRate = (Number(stats.delayedAwardCount) || 0) / total;

    const iri = (
      (singleBidRate * weightSingle) +
      (rushJobRate * weightRush) +
      (delayedAwardRate * weightDelay)
    ) * 100.0;

    return NextResponse.json({
      success: true,
      targetType,
      targetName,
      totalContracts: total,
      iri: parseFloat(iri.toFixed(1)),
      avgBids: stats.avgBids ? parseFloat(Number(stats.avgBids).toFixed(2)) : 0,
      avgDelayDays: stats.avgDelayDays ? parseFloat(Number(stats.avgDelayDays).toFixed(1)) : 0,
      weights: {
        SingleBid: parseFloat(weightSingle.toFixed(2)),
        RushJob: parseFloat(weightRush.toFixed(2)),
        AwardDelay: parseFloat(weightDelay.toFixed(2))
      },
      components: {
        singleBidCount: Number(stats.singleBidCount) || 0,
        singleBidRate: parseFloat((singleBidRate * 100).toFixed(1)),
        rushJobCount: Number(stats.rushJobCount) || 0,
        rushJobRate: parseFloat((rushJobRate * 100).toFixed(1)),
        delayedAwardCount: Number(stats.delayedAwardCount) || 0,
        delayedAwardRate: parseFloat((delayedAwardRate * 100).toFixed(1))
      }
    });

  } catch (error) {
    console.error("Error in IRI API:", error);

    if (error.message?.includes('DATABASE_UNAVAILABLE') || error.code === 'ECONNREFUSED') {
      return NextResponse.json({
        success: false,
        message: "Database is locked or currently being rebuilt. Showing mock integrity risk metrics.",
        isLocked: true,
        targetType: 'organization',
        targetName: "Military Engineer Services (MES)",
        totalContracts: 1245,
        iri: 68.4,
        avgBids: 2.1,
        avgDelayDays: 114.5,
        weights: { SingleBid: 0.4, RushJob: 0.4, AwardDelay: 0.2 },
        components: {
          singleBidCount: 520, singleBidRate: 41.8,
          rushJobCount: 350, rushJobRate: 28.1,
          delayedAwardCount: 145, delayedAwardRate: 11.6
        }
      });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}