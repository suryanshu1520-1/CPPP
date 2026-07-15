import { NextResponse } from 'next/server';

// Intentional stub: alert_subscriptions rows are persisted (see alerts/subscribe),
// but nothing dispatches against them yet. Real dispatch needs an email/webhook
// provider decision (e.g. Resend) plus a scheduler — out of scope until that's chosen.
export async function POST(request) {
  return executeTrigger();
}

export async function GET(request) {
  return executeTrigger();
}

async function executeTrigger() {
  try {
    return NextResponse.json({
      success: true,
      processedSubscriptions: 0,
      dispatchesTriggered: 0,
      dispatches: [],
      note: 'Stub: no dispatch provider configured yet.'
    });
  } catch (error) {
    console.error('Trigger alerts error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
