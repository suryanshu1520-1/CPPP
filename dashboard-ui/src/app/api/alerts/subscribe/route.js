import { NextResponse } from 'next/server';
import crypto from 'crypto';

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

    // Generate random subscription ID
    const subscriptionId = crypto.randomUUID();

    return NextResponse.json({
      success: true,
      subscriptionId,
      message: "Subscription successfully registered for watchdog alerts."
    });

  } catch (error) {
    console.error('Subscription error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
