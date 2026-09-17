import { handleGmailOAuthCallback } from '@/app/actions/gmail-actions';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  const origin = url.origin;

  if (error || !code) {
    return NextResponse.redirect(`${origin}/opportunities?gmail_error=${encodeURIComponent(error || 'Authorization denied')}`);
  }

  const res = await handleGmailOAuthCallback(code, origin);

  if (res.success) {
    return NextResponse.redirect(`${origin}/opportunities?gmail_connected=true&email=${encodeURIComponent(res.emailAddress || '')}`);
  } else {
    return NextResponse.redirect(`${origin}/opportunities?gmail_error=${encodeURIComponent(res.error || 'Token exchange failed')}`);
  }
}
