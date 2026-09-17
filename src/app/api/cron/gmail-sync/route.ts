import { syncGmailOpportunities } from '@/app/actions/gmail-actions';
import { NextResponse } from 'next/server';

/**
 * Background Monitoring API Route for Gmail Sync (Hourly Cron / Scheduler Fallback).
 * Triggers incremental sync for new Gmail messages, auto-saving High-Confidence items & queuing Needs-Review items.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Optional secret check if configured
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }

    const res = await syncGmailOpportunities(30, true);

    if (res.success && res.data) {
      return NextResponse.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        scanned: res.data.totalScanned,
        opportunitiesFound: res.data.opportunityEmailsFound,
        checkpoint: res.data.checkpointStats,
      });
    }

    return NextResponse.json({ status: 'warning', message: res.error || 'No active Gmail connection' }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Background sync failed' }, { status: 500 });
  }
}
