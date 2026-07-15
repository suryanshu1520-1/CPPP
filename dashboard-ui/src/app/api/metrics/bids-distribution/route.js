import { NextResponse } from 'next/server';
import { fetchR2Json } from '@/lib/r2';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get('org') || '';

    if (!org) {
      const globalBids = await fetchR2Json('global_bids.json');
      return NextResponse.json(globalBids);
    }

    // Drill down: fetch specific organization profile
    const safeOrgName = org.replace(/\//g, "_").replace(/\\/g, "_");
    try {
      const orgProfile = await fetchR2Json(`orgs/${safeOrgName}.json`);
      return NextResponse.json({
        success: true,
        org,
        data: orgProfile.bidsDistribution
      });
    } catch (e) {
      console.warn(`Org profile not found for ${org}, falling back to empty.`, e);
      return NextResponse.json({
        success: true,
        org,
        data: []
      });
    }
  } catch (error) {
    console.error("Error in bids-distribution API:", error);
    return NextResponse.json({
      success: false,
      data: [
        { bids: "1 Bid", count: 582857 },
        { bids: "2 Bids", count: 839811 },
        { bids: "3 Bids", count: 1474351 },
        { bids: "4 Bids", count: 551325 },
        { bids: "5+ Bids", count: 1034645 }
      ]
    });
  }
}
