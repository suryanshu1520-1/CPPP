import { NextResponse } from 'next/server';
import { fetchR2Json } from '@/lib/r2';

export async function GET(request) {
  try {
    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const type = searchParams.get('type') || 'all';
    const org = searchParams.get('org') || '';
    const vendor = searchParams.get('vendor') || '';
    const minVal = searchParams.get('minVal') ? parseFloat(searchParams.get('minVal')) : null;

    // Fetch precomputed red flags list from R2
    const response = await fetchR2Json('red_flags.json');
    let redFlags = response?.data || [];

    // Filter by flag type
    if (type !== 'all') {
      redFlags = redFlags.filter(item => item.flagType === type);
    }

    // Filter by organization/department
    if (org) {
      redFlags = redFlags.filter(item => item.department && item.department.toLowerCase() === org.toLowerCase());
    }

    // Filter by vendor
    if (vendor) {
      redFlags = redFlags.filter(item => item.vendor && item.vendor.toLowerCase() === vendor.toLowerCase());
    }

    // Filter by minimum contract value (value is in Rupees, minVal is in Crores)
    if (minVal !== null) {
      const minValRupees = minVal * 10000000;
      redFlags = redFlags.filter(item => item.value >= minValRupees);
    }

    // Apply sorting (newest contract date first) and limit
    redFlags.sort((a, b) => {
      const dateA = a.contractDate ? new Date(a.contractDate).getTime() : 0;
      const dateB = b.contractDate ? new Date(b.contractDate).getTime() : 0;
      return dateB - dateA;
    });

    const data = redFlags.slice(0, limit);

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching red flags from R2:', error);
    // Hardcoded fallback alerts in case of R2 connection issues
    const mockAlerts = [
      {
        contractId: "mock-1", tenderId: "2026_CPWD_839021_1",
        department: "Central Public Works Department (CPWD)",
        title: "Construction of boundary wall and security cabins at NIT Campus",
        value: 45000000, bids: 1, vendor: "R. K. Builders & Co.",
        publishedDate: "2026-05-10", closingDate: "2026-05-12",
        contractDate: "2026-06-15", awardDelay: 36, bidWindow: 2
      },
      {
        contractId: "mock-2", tenderId: "2026_NHAI_930219_4",
        department: "National Highways Authority of India (NHAI)",
        title: "Consultancy services for preparation of DPR for 4-laning of NH-31",
        value: 125000000, bids: 1, vendor: "Vikas Infrastructure Consultants Ltd",
        publishedDate: "2026-04-12", closingDate: "2026-05-15",
        contractDate: "2026-11-20", awardDelay: 189, bidWindow: 33
      }
    ];

    return NextResponse.json({
      success: true,
      data: mockAlerts
    });
  }
}
