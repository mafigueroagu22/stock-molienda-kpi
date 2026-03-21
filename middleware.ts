import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// La autenticación se maneja en el cliente con Supabase Auth (localStorage).
// Este middleware solo permite pasar todo el tráfico sin interferir.
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
