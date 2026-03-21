'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Login() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [showPass, setShowPass] = useState(false)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await sb.auth.signInWithPassword({ email, password })
    if (err) {
      setError('Credenciales incorrectas. Contacta al administrador de sistema.')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#080e1a] flex items-center justify-center p-4">

      {/* Background grid */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Glow */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm animate-fade-in">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-xl shadow-blue-500/30 mb-4">
            <span className="text-white font-black text-xl">P</span>
          </div>
          <h1 className="text-white font-black text-2xl tracking-tight">
            POLPAICO <span className="text-blue-400">KPI</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">Control de Stock — Molienda Coronel</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/70 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-7 shadow-2xl shadow-black/50">
          <h2 className="text-white font-bold text-base mb-1">Iniciar sesión</h2>
          <p className="text-slate-500 text-xs mb-6">Acceso restringido al equipo de producción</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 mb-5">
              {error}
            </div>
          )}

          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@polpaico.cl"
                required
                autoComplete="email"
                className="w-full bg-slate-700/80 border border-slate-600/60 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500
                           focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full bg-slate-700/80 border border-slate-600/60 rounded-xl px-4 py-3 pr-11 text-white text-sm placeholder-slate-500
                             focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-sm"
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed
                         text-white font-semibold rounded-xl py-3 text-sm transition-all duration-150
                         shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verificando…
                </span>
              ) : (
                'Ingresar al Dashboard'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">
          ¿Sin acceso? Contacta al administrador del sistema
        </p>
      </div>
    </div>
  )
}
