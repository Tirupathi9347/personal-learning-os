'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/gmail/gmail-client';
import { getOpportunityById, updateOpportunityStatus } from '@/app/actions/opportunity-actions';
import { Opportunity } from '@/types';
import { revalidatePath } from 'next/cache';

/**
 * Add or update an opportunity deadline event on Google Calendar.
 * Handles duplicate prevention by updating existing event_id if already synced.
 */
export async function syncOpportunityToGoogleCalendar(
  opportunityId: string,
  actionType: 'MARK_APPLIED_AND_CALENDAR' | 'CALENDAR_ONLY' = 'CALENDAR_ONLY'
): Promise<{ success: boolean; eventId?: string; message?: string; error?: string }> {
  try {
    const opportunity = await getOpportunityById(opportunityId);
    if (!opportunity) {
      return { success: false, error: 'Opportunity record not found.' };
    }

    if (!opportunity.deadline) {
      return {
        success: false,
        error: 'No deadline specified for this opportunity. Cannot create a deadline event without a valid date.',
      };
    }

    // 1. If user chose "Mark Applied & Add to Calendar", update status first
    if (actionType === 'MARK_APPLIED_AND_CALENDAR') {
      await updateOpportunityStatus(opportunityId, 'APPLIED');
    }

    // 2. Fetch valid Google OAuth token
    const tokenInfo = await getValidAccessToken();
    if (!tokenInfo || !tokenInfo.accessToken) {
      return {
        success: false,
        error: 'Google Account is not connected. Click "Connect Gmail" in the header to authorize Google Calendar.',
      };
    }

    const { accessToken } = tokenInfo;
    const supabase = createServiceRoleClient();

    // Calculate start & end date for Google Calendar All-Day Event (end date is exclusive)
    const startDateStr = opportunity.deadline;
    const deadlineDate = new Date(startDateStr);
    const endDateObj = new Date(deadlineDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endDateStr = endDateObj.toISOString().split('T')[0];

    // Event summary and description
    const eventSummary = `[Deadline] ${opportunity.organization} - ${opportunity.title}`;
    const eventDesc = `Application Deadline for ${opportunity.title} at ${opportunity.organization}.\n` +
      `Role: ${opportunity.role || 'Not specified'}\n` +
      `Application Link: ${opportunity.application_url || 'None'}\n` +
      `Source: ${opportunity.source || 'Opportunity Hub'}`;

    const eventPayload = {
      summary: eventSummary,
      description: eventDesc,
      start: { date: startDateStr },
      end: { date: endDateStr },
    };

    let calendarEventId = opportunity.google_calendar_event_id;
    let res: Response;

    if (calendarEventId) {
      // Update existing Google Calendar event (Prevent Duplicates!)
      res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(calendarEventId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        }
      );
    } else {
      // Create new Google Calendar event
      res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      let friendlyError = errText;

      if (errText.includes('has not been used in project') || errText.includes('disabled')) {
        friendlyError = `Google Calendar API is not enabled in your Google Cloud Project. Please enable "Google Calendar API" in Google Cloud Console (https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).`;
      } else if (errText.includes('insufficient') || errText.includes('403') || errText.includes('401')) {
        friendlyError = `Calendar permission needed. Please disconnect and reconnect Google in the header/Settings so Google grants Calendar access.`;
      }

      return { success: false, error: friendlyError };
    }

    const calendarData = await res.json();
    const createdEventId = calendarData.id;

    // Save calendar event ID & synced flag in Supabase
    await supabase
      .from('opportunities')
      .update({
        google_calendar_event_id: createdEventId,
        calendar_synced: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId);

    revalidatePath('/opportunities');
    revalidatePath('/');

    return {
      success: true,
      eventId: createdEventId,
      message: calendarEventId
        ? `Updated existing Google Calendar event for ${opportunity.organization} (${startDateStr}).`
        : `Added ${opportunity.organization} deadline to Google Calendar (${startDateStr}).`,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to sync to Google Calendar.' };
  }
}
