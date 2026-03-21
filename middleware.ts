import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rutas públicas que no requieren autenticación
const PUBLIC_PATHS = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Permitir rutas públicas
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Para rutas protegidas, la verificación real ocurre en el cliente
  // (Supabase auth es client-side en este setup)
  // Este middleware solo redirige si no hay cookie de sesión de Supabase
  const supabaseAuthToken = request.cookies.get('sb-kwfxxvuxrbtrfcejtxuw-auth-token')
  const hasSession = supabaseAuthToken?.value

  if (!hasSession && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
}
