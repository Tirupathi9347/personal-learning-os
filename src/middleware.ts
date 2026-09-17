import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Single-user mode: allow all requests to proceed cleanly
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
