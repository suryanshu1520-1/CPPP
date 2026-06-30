import { NextResponse } from 'next/server';
import { getWritableDb } from '@/lib/db';

export async function POST(request) {
  try {
    const body = await request.json();

    const { email, webhookUrl, alertType, minValue, orgName } = body;

    // Validation
    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: "Invalid email format" }, { status: 400 });
    }

    const writeDb = getWritableDb();
    let result;
    try {
      const stmt = writeDb.prepare(`
        INSERT INTO subscriptions (email, webhook_url, alert_type, min_value, org_name)
        VALUES (?, ?, ?, ?, ?)
      `);

      result = stmt.run(
        email,
        webhookUrl || null,
        alertType || 'all',
        minValue ? parseFloat(minValue) : null,
        orgName || null
      );
    } finally {
      writeDb.close();
    }

    return NextResponse.json({
      success: true,
      subscriptionId: result.lastInsertRowid,
      message: "Subscription successfully registered for watchdog alerts."
    });

  } catch (error) {
    console.error('Subscription error:', error);
    if (error.message === 'DATABASE_UNAVAILABLE') {
      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Please try again later.",
        isLocked: true
      }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
