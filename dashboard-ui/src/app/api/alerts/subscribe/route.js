import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, webhookUrl, alertType, minValue, orgName } = body;

    // Check if Cloudflare Worker proxy is available
    if (process.env.DB_SERVICE_WORKER_URL) {
        try {
            const workerUrl = new URL('/api/alerts/subscribe', process.env.DB_SERVICE_WORKER_URL);
            
            const headers = {
                'Content-Type': 'application/json'
            };
            if (process.env.DB_SERVICE_WORKER_SECRET) {
                headers['Authorization'] = `Bearer ${process.env.DB_SERVICE_WORKER_SECRET}`;
            }
            
            const res = await fetch(workerUrl.toString(), {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const data = await res.json();
                return NextResponse.json(data);
            }
            console.warn("DB service worker returned error status, falling back to direct Supabase query:", res.status);
        } catch (workerErr) {
            console.error("DB service worker fetch failed, falling back to direct Supabase query:", workerErr);
        }
    }

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
