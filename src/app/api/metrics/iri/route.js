import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const org = searchParams.get('org') || '';
    const vendor = searchParams.get('vendor') || '';
    
    // Custom weight overrides from query params (defaulting to 0.4, 0.4, 0.2)
    const w1 = parseFloat(searchParams.get('w1') || '0.4'); // Single Bid Weight
    const w2 = parseFloat(searchParams.get('w2') || '0.4'); // Rush Job Weight
    const w3 = parseFloat(searchParams.get('w3') || '0.2'); // Award Delay Weight

    // Normalize weights to sum to 1.0
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
          COUNT(*) as totalContracts,
          SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) as singleBidCount,
          SUM(CASE WHEN bid_window_days >= 0 AND bid_window_days < 7 THEN 1 ELSE 0 END) as rushJobCount,
          SUM(CASE WHEN award_delay_days > 180 THEN 1 ELSE 0 END) as delayedAwardCount,
          AVG(bids_received) as avgBids,
          AVG(award_delay_days) as avgDelayDays
        FROM aoc_clean
        WHERE org_name = ? AND contract_date IS NOT NULL AND contract_date != '9999-01-01 00:00:00'
      `;
    } else if (vendor) {
      targetType = 'vendor';
      targetName = vendor;
      sql = `
        SELECT 
          COUNT(*) as totalContracts,
          SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) as singleBidCount,
          SUM(CASE WHEN bid_window_days >= 0 AND bid_window_days < 7 THEN 1 ELSE 0 END) as rushJobCount,
          SUM(CASE WHEN award_delay_days > 180 THEN 1 ELSE 0 END) as delayedAwardCount,
          AVG(bids_received) as avgBids,
          AVG(award_delay_days) as avgDelayDays
        FROM aoc_clean
        WHERE vendor_name = ? AND contract_date IS NOT NULL AND contract_date != '9999-01-01 00:00:00'
      `;
    } else {
      // If no org or vendor is specified, return top 20 highest-risk organizations
      // We estimate this quickly using org_summary metrics
      const listSql = `
        SELECT 
          org_name as name,
          total_contracts as totalContracts,
          single_bid_contracts as singleBidCount,
          avg_bids as avgBids,
          avg_delay_days as avgDelayDays,
          (single_bid_contracts * 100.0 / total_contracts) as singleBidRate
        FROM org_summary
        WHERE org_name IS NOT NULL AND org_name != 'Unknown' AND org_name != '' AND total_contracts > 10
        ORDER BY singleBidRate DESC, total_contracts DESC
        LIMIT 20
      `;
      const highRiskOrgs = db.prepare(listSql).all();
      
      const listData = highRiskOrgs.map(item => {
        const singleBidRate = item.totalContracts ? (item.singleBidCount / item.totalContracts) : 0;
        // Estimate delayed award rate (normalized average delay, capped at 1.0)
        const delayFactor = Math.min(1.0, (item.avgDelayDays || 0) / 180.0);
        
        // Dynamic composite IRI score (using 0.6 Single Bid, 0.4 Delay for summary list fallback)
        const iri = (singleBidRate * 0.6 + delayFactor * 0.4) * 100.0;
        
        return {
          name: item.name,
          totalContracts: item.totalContracts,
          singleBidCount: item.singleBidCount,
          singleBidRate: parseFloat((singleBidRate * 100).toFixed(1)),
          avgBids: item.avgBids ? parseFloat(item.avgBids.toFixed(2)) : 0,
          avgDelayDays: item.avgDelayDays ? parseFloat(item.avgDelayDays.toFixed(1)) : 0,
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

    const stats = db.prepare(sql).get(targetName);

    if (!stats || stats.totalContracts === 0) {
      return NextResponse.json({
        success: true,
        targetType,
        targetName,
        totalContracts: 0,
        iri: 0,
        components: { singleBidRate: 0, rushJobRate: 0, delayedAwardRate: 0 }
      });
    }

    const total = stats.totalContracts;
    const singleBidRate = (stats.singleBidCount || 0) / total;
    const rushJobRate = (stats.rushJobCount || 0) / total;
    const delayedAwardRate = (stats.delayedAwardCount || 0) / total;

    // Composite IRI calculation (weighted rates, scaled 0 to 100)
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
      avgBids: stats.avgBids ? parseFloat(stats.avgBids.toFixed(2)) : 0,
      avgDelayDays: stats.avgDelayDays ? parseFloat(stats.avgDelayDays.toFixed(1)) : 0,
      weights: {
        SingleBid: parseFloat(weightSingle.toFixed(2)),
        RushJob: parseFloat(weightRush.toFixed(2)),
        AwardDelay: parseFloat(weightDelay.toFixed(2))
      },
      components: {
        singleBidCount: stats.singleBidCount || 0,
        singleBidRate: parseFloat((singleBidRate * 100).toFixed(1)),
        rushJobCount: stats.rushJobCount || 0,
        rushJobRate: parseFloat((rushJobRate * 100).toFixed(1)),
        delayedAwardCount: stats.delayedAwardCount || 0,
        delayedAwardRate: parseFloat((delayedAwardRate * 100).toFixed(1))
      }
    });

  } catch (error) {
    console.error("Error in IRI API:", error);
    
    // Fallback Mock results if database locks
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table')) {
      return NextResponse.json({
        success: false,
        message: "Database is locked or currently being rebuilt. Showing mock integrity risk metrics.",
        isLocked: true,
        targetType: org ? 'organization' : 'vendor',
        targetName: org || vendor || "Military Engineer Services (MES)",
        totalContracts: 1245,
        iri: 68.4,
        avgBids: 2.1,
        avgDelayDays: 114.5,
        weights: { SingleBid: weightSingle, RushJob: weightRush, AwardDelay: weightDelay },
        components: {
          singleBidCount: 520,
          singleBidRate: 41.8,
          rushJobCount: 350,
          rushJobRate: 28.1,
          delayedAwardCount: 145,
          delayedAwardRate: 11.6
        }
      });
    }
    
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
