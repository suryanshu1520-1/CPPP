import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

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

    // RLS on alert_subscriptions is insert-only (no select), so generate the
    // id here rather than reading it back via INSERT ... RETURNING.
    const subscriptionId = crypto.randomUUID();
    const { error } = await supabase
      .from('alert_subscriptions')
      .insert({
        id: subscriptionId,
        email,
        webhook_url: webhookUrl || null,
        alert_type: alertType || null,
        org_name: orgName || null,
        min_value: minValue || null,
      });

    if (error) throw new Error(error.message);

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
