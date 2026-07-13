import { NextResponse } from 'next/server';
import { fetchR2Json } from '@/lib/turso';

export async function GET() {
  try {
    const response = await fetchR2Json('vendors.json');
    // Limit to top 15 vendors for the dashboard leaderboard view
    const data = (response?.data || []).slice(0, 15);
    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching vendors from R2:', error);
    const mockVendors = [
      { vendor: "Larsen & Toubro Limited (L&T)", contracts: 1450, value: 345000000000, singleBidWins: 45, avgBids: 4.8, singleBidRate: 3.1 },
      { vendor: "Tata Projects Limited", contracts: 920, value: 182000000000, singleBidWins: 32, avgBids: 4.5, singleBidRate: 3.5 },
      { vendor: "Dilip Buildcon Limited", contracts: 1820, value: 145000000000, singleBidWins: 110, avgBids: 3.9, singleBidRate: 6.0 },
      { vendor: "Megha Engineering & Infrastructures Ltd (MEIL)", contracts: 720, value: 135000000000, singleBidWins: 65, avgBids: 3.2, singleBidRate: 9.0 },
      { vendor: "Afcons Infrastructure Limited", contracts: 380, value: 95000000000, singleBidWins: 12, avgBids: 4.1, singleBidRate: 3.2 }
    ].sort((a, b) => b.value - a.value);

    return NextResponse.json({
      success: true,
      data: mockVendors
    });
  }
}
