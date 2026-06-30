import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

export async function POST(request) {
  return executeTrigger();
}

export async function GET(request) {
  return executeTrigger();
}

async function executeTrigger() {
  try {
    // Fetch active subscriptions
    const subs = await query("SELECT * FROM subscriptions LIMIT 20");
    const dispatches = [];

    for (const sub of subs) {
      // Build search query for new anomalies matching subscription parameters
      let where = "org_name != 'Unknown'";
      const params = [];
      let paramIndex = 1;

      if (sub.alert_type === 'single_bid') {
        where += " AND bids_received = 1";
      } else if (sub.alert_type === 'rush') {
        where += " AND bid_window_days >= 0 AND bid_window_days < 7";
      } else if (sub.alert_type === 'delayed') {
        where += " AND award_delay_days > 90";
      } else {
        where += " AND (bids_received = 1 OR (bid_window_days >= 0 AND bid_window_days < 7) OR award_delay_days > 90)";
      }

      if (sub.org_name) {
        where += ` AND org_name = $${paramIndex++}`;
        params.push(sub.org_name);
      }

      if (sub.min_value) {
        where += ` AND contract_value >= $${paramIndex++}`;
        params.push(sub.min_value * 10000000);
      }

      const anomaliesQuery = `
        SELECT tender_id, org_name, tender_title as title, contract_value, bids_received, contract_date
        FROM aoc_clean
        WHERE ${where}
        ORDER BY contract_date DESC
        LIMIT 3
      `;

      const matches = await query(anomaliesQuery, params);

      if (matches.length > 0) {
        dispatches.push({
          subscriptionId: sub.id,
          email: sub.email,
          webhookUrl: sub.webhook_url || "simulated-email-dispatch",
          matchedAnomalies: matches.map(m => ({
            tenderId: m.tender_id,
            org: m.org_name,
            title: m.title ? m.title.substring(0, 60) + '...' : '',
            value: m.contract_value ? Number(m.contract_value) : 0,
            bids: m.bids_received,
            date: m.contract_date
          }))
        });
      }
    }

    return NextResponse.json({
      success: true,
      processedSubscriptions: subs.length,
      dispatchesTriggered: dispatches.length,
      dispatches
    });

  } catch (error) {
    console.error('Trigger alerts error:', error);
    if (error.message === 'DATABASE_UNAVAILABLE' || error.code === 'ECONNREFUSED') {
      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Please try again later.",
        isLocked: true
      }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}