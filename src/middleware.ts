import { NextRequest, NextResponse } from "next/server";

/**
 * Cloudflare may receive Next chunk URLs with encoded brackets (`%5Bid%5D`)
 * while assets were uploaded under literal `[id]`. Rewrite so the lookup hits.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/_next/static/")) {
    return NextResponse.next();
  }

  if (!/%5B|%5D|%28|%29/i.test(pathname)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname
    .replace(/%5B/gi, "[")
    .replace(/%5D/gi, "]")
    .replace(/%28/gi, "(")
    .replace(/%29/gi, ")");
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/_next/static/:path*",
};
