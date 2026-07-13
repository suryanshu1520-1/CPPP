import { NextResponse } from 'next/server';

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
      dispatches: []
    });
  } catch (error) {
    console.error('Trigger alerts error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
