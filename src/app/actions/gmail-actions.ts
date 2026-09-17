'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { getValidAccessToken, getStoredGmailTokens, getGmailOAuthConfig, saveGmailTokens, removeGmailTokens, isOpportunityEmail } from '@/lib/gmail/gmail-client';
import { extractOpportunitiesFromText, ExtractedOpportunityItem } from '@/lib/ai/opportunity-extractor';
import { checkDuplicateOpportunity, mergeOpportunityWithExisting, createOpportunity } from '@/app/actions/opportunity-actions';
import { DuplicateMatchResult, GmailSyncCheckpoint, QualityClassification } from '@/types';
import { revalidatePath } from 'next/cache';

export interface GmailSyncResult {
  totalScanned: number;
  opportunityEmailsFound: number;
  opportunities: ExtractedOpportunityItem[];
  duplicateMatches: Record<number, DuplicateMatchResult>;
  checkpointStats?: GmailSyncCheckpoint | null;
}

/**
 * Fetch public Gmail OAuth connection status for UI display.
 */
export async function getGmailConnectionStatus(): Promise<{
  isConnected: boolean;
  emailAddress?: string;
  lastSyncedAt?: string | null;
  checkpoint?: GmailSyncCheckpoint | null;
}> {
  try {
    const tokens = await getStoredGmailTokens();
    if (!tokens || !tokens.refresh_token) {
      return { isConnected: false };
    }

    const tokenInfo = await getValidAccessToken();
    if (!tokenInfo) {
      return { isConnected: false, emailAddress: tokens.email_address };
    }

    const checkpoint = await getGmailCheckpoint();

    return {
      isConnected: true,
      emailAddress: tokens.email_address || 'Connected Gmail Account',
      lastSyncedAt: checkpoint?.last_synced_at || null,
      checkpoint,
    };
  } catch (err) {
    return { isConnected: false };
  }
}

/**
 * Fetch per-user Gmail sync checkpoint & metric statistics.
 */
export async function getGmailCheckpoint(): Promise<GmailSyncCheckpoint | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('gmail_sync_checkpoints')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    return data as GmailSyncCheckpoint;
  } catch (err) {
    return null;
  }
}

/**
 * Generate Google OAuth consent URL for Gmail read-only access.
 */
export async function getGmailAuthUrl(redirectOrigin: string): Promise<string> {
  const config = await getGmailOAuthConfig();
  if (!config.clientId) {
    throw new Error('Google OAuth Client ID is missing. Configure GMAIL_CLIENT_ID in Vault or environment.');
  }

  const redirectUri = `${redirectOrigin.replace(/\/$/, '')}/api/auth/gmail/callback`;
  const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events');

  return `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(config.clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${scope}&` +
    `access_type=offline&` +
    `prompt=consent`;
}

/**
 * Exchange OAuth authorization code for Access & Refresh tokens.
 */
export async function handleGmailOAuthCallback(
  code: string,
  redirectOrigin: string
): Promise<{ success: boolean; emailAddress?: string; error?: string }> {
  try {
    const config = await getGmailOAuthConfig();
    if (!config.clientId || !config.clientSecret) {
      return { success: false, error: 'Google OAuth Client ID or Client Secret missing.' };
    }

    const redirectUri = `${redirectOrigin.replace(/\/$/, '')}/api/auth/gmail/callback`;

    const params = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return { success: false, error: `Token exchange failed: ${errText}` };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiryDate = Date.now() + (tokenData.expires_in || 3600) * 1000;

    let userEmail = 'Connected Gmail Account';
    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        if (profileData.email) userEmail = profileData.email;
      }
    } catch (e) {
      // Ignore userinfo failure fallback
    }

    const storedTokens = await getStoredGmailTokens();
    const saved = await saveGmailTokens({
      access_token: accessToken,
      refresh_token: refreshToken || storedTokens?.refresh_token || '',
      expiry_date: expiryDate,
      email_address: userEmail,
    });

    if (!saved) {
      return { success: false, error: 'Failed to save Gmail tokens in encrypted Vault.' };
    }

    revalidatePath('/opportunities');
    revalidatePath('/settings');

    return { success: true, emailAddress: userEmail };
  } catch (err: any) {
    return { success: false, error: err.message || 'OAuth callback failed.' };
  }
}

/**
 * Disconnect Gmail integration and remove tokens from Vault.
 */
export async function disconnectGmail(): Promise<{ success: boolean; error?: string }> {
  try {
    const ok = await removeGmailTokens();
    revalidatePath('/opportunities');
    revalidatePath('/settings');
    return { success: ok };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Classify quality and validity of an extracted Gmail opportunity.
 */
export async function classifyOpportunityQuality(
  item: ExtractedOpportunityItem,
  dupMatch: DuplicateMatchResult
): Promise<QualityClassification> {
  const todayISO = new Date().toISOString().split('T')[0];

  // Rule 1: Automatically exclude opportunities whose deadline has already passed
  if (item.deadline && item.deadline < todayISO) {
    return 'REJECTED';
  }

  // Rule 2: High Confidence criteria
  const isHighConfidence =
    item.confidence >= 0.85 &&
    dupMatch.matchLevel === 'NO_MATCH' &&
    item.title &&
    item.organization;

  if (isHighConfidence) {
    return 'HIGH_CONFIDENCE';
  }

  // Rule 3: Needs Review criteria (low confidence, uncertain language, or possible duplicate)
  return 'NEEDS_REVIEW';
}

/**
 * Phase 4B Sync Gmail Opportunities (Supports First-Sync & Incremental Background Sync).
 */
export async function syncGmailOpportunities(
  maxEmailsToFetch: number = 30,
  isAutomaticBackground: boolean = false
): Promise<{ success: boolean; data?: GmailSyncResult; error?: string }> {
  try {
    const tokenInfo = await getValidAccessToken();
    if (!tokenInfo) {
      return { success: false, error: 'Gmail is not connected or token has expired. Please connect Gmail first.' };
    }

    const { accessToken } = tokenInfo;

    // Fetch existing per-user checkpoint to avoid re-processing identical message IDs
    const supabase = createServiceRoleClient();
    const existingCheckpoint = await getGmailCheckpoint();
    const processedIdsSet = new Set<string>(existingCheckpoint?.processed_message_ids || []);

    // 1. Fetch recent message list (newer_than:30d)
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('newer_than:30d')}&maxResults=${maxEmailsToFetch}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      return { success: false, error: 'Failed to fetch messages from Gmail API.' };
    }

    const listData = await listRes.json();
    const rawMessages: { id: string; threadId: string }[] = listData.messages || [];

    // Filter out previously processed message IDs to preserve incremental state
    const newMessages = rawMessages.filter((m) => !processedIdsSet.has(m.id));

    if (newMessages.length === 0) {
      return {
        success: true,
        data: {
          totalScanned: 0,
          opportunityEmailsFound: 0,
          opportunities: [],
          duplicateMatches: {},
          checkpointStats: existingCheckpoint,
        },
      };
    }

    const detectedOpportunities: ExtractedOpportunityItem[] = [];
    const dupResults: Record<number, DuplicateMatchResult> = {};
    const newlyProcessedMessageIds: string[] = [];

    let opportunityEmailsCount = 0;
    let savedCount = existingCheckpoint?.total_opportunities_saved || 0;
    let mergedCount = existingCheckpoint?.total_duplicates_merged || 0;
    let needsReviewCount = existingCheckpoint?.total_needs_review || 0;

    const todayISO = new Date().toISOString().split('T')[0];

    // 2. Fetch headers & body for each new message with server-side keyword filtering
    for (const msgRef of newMessages) {
      newlyProcessedMessageIds.push(msgRef.id);

      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!msgRes.ok) continue;

      const msg = await msgRes.json();
      const payload = msg.payload || {};
      const headers = payload.headers || [];

      const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
      const fromSender = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
      const snippet = msg.snippet || '';

      // Server-side Signal Filtering: Skip non-opportunity noise
      if (!isOpportunityEmail(subject, snippet)) {
        continue;
      }

      opportunityEmailsCount++;

      let bodyText = snippet;
      if (payload.parts && payload.parts.length > 0) {
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain' && part.body && part.body.data) {
            bodyText += '\n' + Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
      }

      const emailMeta = `Message ID: ${msg.id} | Subject: ${subject} | From: ${fromSender}`;

      try {
        const extraction = await extractOpportunitiesFromText(bodyText, `Gmail: ${subject}`, 'GMAIL');
        if (extraction.opportunities && extraction.opportunities.length > 0) {
          for (const rawItem of extraction.opportunities) {
            // Rule: Automatically exclude expired opportunities (deadline < today)
            if (rawItem.deadline && rawItem.deadline < todayISO) {
              continue; // Exclude past deadline
            }

            const candidateItem: ExtractedOpportunityItem = {
              ...rawItem,
              source_identifier: emailMeta,
            };

            const dupMatch = await checkDuplicateOpportunity(candidateItem);
            const quality = await classifyOpportunityQuality(candidateItem, dupMatch);

            if (quality === 'REJECTED') {
              continue; // Exclude expired/invalid
            }

            if (isAutomaticBackground) {
              // Automatic Background Sync Behavior:
              if (dupMatch.matchLevel === 'EXACT_MATCH' || dupMatch.matchLevel === 'STRONG_MATCH') {
                if (dupMatch.matchedOpportunity) {
                  await mergeOpportunityWithExisting(dupMatch.matchedOpportunity.id, {
                    source: 'GMAIL',
                    source_identifier: emailMeta,
                    evidence_snippet: candidateItem.evidence_snippet || null,
                    description: candidateItem.description || null,
                    stipend: candidateItem.stipend || null,
                    salary: candidateItem.salary || null,
                    deadline: candidateItem.deadline || null,
                    application_url: candidateItem.application_url || null,
                    skills_required: candidateItem.skills_required || null,
                  });
                  mergedCount++;
                }
              } else if (quality === 'HIGH_CONFIDENCE') {
                await createOpportunity({
                  ...candidateItem,
                  source: 'GMAIL',
                  source_identifier: emailMeta,
                  status: 'NEW',
                  needs_review: false,
                });
                savedCount++;
              } else {
                // Place into Needs Review Queue
                await createOpportunity({
                  ...candidateItem,
                  source: 'GMAIL',
                  source_identifier: emailMeta,
                  status: 'NEW',
                  needs_review: true,
                });
                needsReviewCount++;
              }
            } else {
              // Manual / First Sync Behavior: Gather for AI Confirmation Gate modal
              const idx = detectedOpportunities.length;
              detectedOpportunities.push(candidateItem);
              dupResults[idx] = dupMatch;
            }
          }
        }
      } catch (err) {
        // Continue processing other messages safely
      }
    }

    // 3. Update or Create Incremental Checkpoint & Metrics in database
    const updatedProcessedIds = Array.from(new Set([...Array.from(processedIdsSet), ...newlyProcessedMessageIds]));
    const totalProcessed = (existingCheckpoint?.total_emails_processed || 0) + newMessages.length;
    const totalDetected = (existingCheckpoint?.total_opportunities_detected || 0) + detectedOpportunities.length;

    const checkpointData = {
      last_history_id: newMessages[0]?.threadId || existingCheckpoint?.last_history_id || null,
      last_message_id: newMessages[0]?.id || existingCheckpoint?.last_message_id || null,
      last_synced_at: new Date().toISOString(),
      processed_message_ids: updatedProcessedIds,
      total_emails_processed: totalProcessed,
      total_opportunities_detected: totalDetected,
      total_opportunities_saved: savedCount,
      total_duplicates_merged: mergedCount,
      total_needs_review: needsReviewCount,
      updated_at: new Date().toISOString(),
    };

    let updatedCheckpointRecord: GmailSyncCheckpoint | null = null;

    if (existingCheckpoint?.id) {
      const { data } = await supabase
        .from('gmail_sync_checkpoints')
        .update(checkpointData)
        .eq('id', existingCheckpoint.id)
        .select()
        .single();
      updatedCheckpointRecord = data as GmailSyncCheckpoint;
    } else {
      const { data } = await supabase
        .from('gmail_sync_checkpoints')
        .insert(checkpointData)
        .select()
        .single();
      updatedCheckpointRecord = data as GmailSyncCheckpoint;
    }

    revalidatePath('/opportunities');

    return {
      success: true,
      data: {
        totalScanned: newMessages.length,
        opportunityEmailsFound: opportunityEmailsCount,
        opportunities: detectedOpportunities,
        duplicateMatches: dupResults,
        checkpointStats: updatedCheckpointRecord,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Gmail sync failed.' };
  }
}
