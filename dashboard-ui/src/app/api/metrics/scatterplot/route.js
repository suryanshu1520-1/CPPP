import { NextResponse } from 'next/server';
import { fetchR2Json } from '@/lib/r2';

export async function GET(request) {
  // Hoisted so the outer catch can reference it (fixes ReferenceError: org is not defined)
  let org = '';
  try {
    const { searchParams } = new URL(request.url);
    org = searchParams.get('org') || '';

    if (!org) {
      const globalScatter = await fetchR2Json('global_scatterplot.json');
      return NextResponse.json(globalScatter);
    }

    // Drill down: fetch specific organization profile
    const safeOrgName = org.replace(/\//g, "_").replace(/\\/g, "_");
    try {
      const orgProfile = await fetchR2Json(`orgs/${safeOrgName}.json`);
      const data = orgProfile.scatterplot || [];
      const anomaliesCount = data.filter(d => d.isAnomaly === 1).length;
      
      return NextResponse.json({
        success: true,
        org,
        anomaliesCount,
        normalCount: data.length - anomaliesCount,
        data
      });
    } catch (e) {
      console.warn(`Org profile not found for ${org}, falling back to empty.`, e);
      return NextResponse.json({
        success: true,
        org,
        anomaliesCount: 0,
        normalCount: 0,
        data: []
      });
    }
  } catch (error) {
    console.error("Error in scatterplot API:", error);
    return NextResponse.json({
      success: true,
      org: org || 'All Departments',
      anomaliesCount: 0,
      normalCount: 0,
      data: []
    });
  }
}
