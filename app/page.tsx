'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'
import { format, subDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Silo, Tolva, Tanque, Despacho, Consumo, Alert } from '@/lib/types'

// ─── Supabase ─────────────────────────────────────────────────────────────────
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Utils ────────────────────────────────────────────────────────────────────
const today = new Date()
const todayStr = format(today, 'yyyy-MM-dd')
const fmt = (n: number) => n?.toLocaleString('es-CL', { maximumFractionDigits: 0 }) ?? '—'
const fmtDec = (n: number | string | null | undefined, d = 1) =>
  (n == null || n === '') ? '—' : Number(n).toFixed(d)
const pctOf = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)
const sapDiffPct = (fisico: number, sap: number) =>
  sap > 0 ? (((fisico - sap) / sap) * 100).toFixed(1) : '0.0'
const autStr = (h: number) =>
  h > 999 ? '∞' : h >= 48 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`
const autColor = (h: number) =>
  h > 24 ? 'text-emerald-400' : h > 12 ? 'text-amber-400' : 'text-red-400'
const levelColor = (p: number) =>
  p >= 60 ? '#22c55e' : p >= 30 ? '#f59e0b' : '#ef4444'
const diffColor = (d: number) =>
  Math.abs(d) > 5 ? 'text-red-400' : Math.abs(d) > 3 ? 'text-amber-400' : 'text-emerald-400'

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg shadow-2xl shadow-black/50 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ─── KPI Metric Card ──────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, sub, color, icon }: {
  label: string; value: string | number; unit?: string; sub?: string; color: string; icon: string
}) {
  return (
    <div className={`card p-4 border ${color}`}>
      <div className="flex items-start gap-3">
        <div className="text-2xl mt-0.5">{icon}</div>
        <div className="min-w-0">
          <p className="text-slate-400 text-xs truncate">{label}</p>
          <p className="text-white font-black text-xl leading-tight mt-0.5">
            {value}
            {unit && <span className="text-slate-400 font-normal text-sm ml-1">{unit}</span>}
          </p>
          {sub && <p className="text-slate-500 text-xs mt-0.5 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function LevelBar({ value, max, height = 'h-2' }: { value: number; max: number; height?: string }) {
  const p = pctOf(value, max)
  return (
    <div className={`w-full bg-slate-700/50 rounded-full overflow-hidden ${height}`}>
      <div
        className={`${height} rounded-full progress-bar`}
        style={{ width: `${p}%`, backgroundColor: levelColor(p) }}
      />
    </div>
  )
}

// ─── Gauge Radial ─────────────────────────────────────────────────────────────
function GaugeRadial({ value, max, size = 80 }: { value: number; max: number; size?: number }) {
  const p = pctOf(value, max)
  const data = [{ value: p, fill: levelColor(p) }]
  return (
    <div style={{ width: size, height: size / 2 + 20 }} className="relative">
      <RadialBarChart
        width={size} height={size}
        cx={size / 2} cy={size / 2}
        innerRadius={size * 0.38} outerRadius={size * 0.48}
        startAngle={180} endAngle={0}
        data={data}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar dataKey="value" cornerRadius={4} background={{ fill: '#1e293b' }} />
      </RadialBarChart>
      <div className="absolute bottom-0 left-0 right-0 text-center">
        <span className="text-xs font-bold" style={{ color: levelColor(p) }}>{p}%</span>
      </div>
    </div>
  )
}

// ─── Animated SVG Silo ────────────────────────────────────────────────────────
function SiloAnimado({ pct, size = 160 }: { pct: number; size?: number }) {
  const color = levelColor(pct)
  const colorDim = pct >= 60 ? '#166534' : pct >= 30 ? '#78350f' : '#7f1d1d'

  // Geometry (all relative to viewBox 0 0 100 220)
  // Body: x=20..80, y=20..170 (cylinder)
  // Dome top: ellipse at y=20, rx=30, ry=8
  // Cone bottom: y=170..195, narrows to x=45..55
  // Discharge nozzle: 45..55, y=195..205
  // Legs: 2 lines from y=205 down to y=220
  // Ladder: right side

  const bodyTop = 20
  const bodyBot = 170
  const coneBot = 195
  const bodyH = bodyBot - bodyTop     // 150
  const fillH = (pct / 100) * bodyH   // actual fill height in units
  const fillTop = bodyBot - fillH      // y where fill starts (from top)

  // Clip path: just the cylinder body + cone (filled region)
  const clipId = `clip-silo-${pct}`

  return (
    <svg
      viewBox="0 0 100 230"
      width={size}
      height={size * 230 / 100}
      className="drop-shadow-xl"
      aria-label={`Silo al ${pct}%`}
    >
      <defs>
        <clipPath id={clipId}>
          {/* Clip to cylinder body */}
          <rect x="20" y={bodyTop} width="60" height={bodyH} />
        </clipPath>
        <linearGradient id={`grad-fill-${pct}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={colorDim} />
          <stop offset="40%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={colorDim} />
        </linearGradient>
        <linearGradient id="grad-shell" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="50%" stopColor="#2d5a8e" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1e3a5f" />
        </linearGradient>
      </defs>

      {/* === Legs === */}
      <line x1="30" y1={coneBot} x2="25" y2="225" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
      <line x1="70" y1={coneBot} x2="75" y2="225" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
      <line x1="25" y1="215" x2="75" y2="215" stroke="#334155" strokeWidth="1.5" />

      {/* === Cone (empty) === */}
      <polygon
        points={`20,${bodyBot} 80,${bodyBot} 55,${coneBot} 45,${coneBot}`}
        fill="#0f172a"
        stroke="#1e3a5f"
        strokeWidth="1"
      />

      {/* === Fill inside cylinder (clipped) === */}
      <rect
        x="20" y={fillTop} width="60" height={fillH}
        fill={`url(#grad-fill-${pct})`}
        clipPath={`url(#${clipId})`}
        style={{ transition: 'y 1.2s cubic-bezier(0.4,0,0.2,1), height 1.2s cubic-bezier(0.4,0,0.2,1)' }}
      />

      {/* Fill ellipse surface at top of liquid (shimmer) */}
      {pct > 2 && (
        <ellipse
          cx="50" cy={fillTop}
          rx="30" ry="5"
          fill={color}
          fillOpacity="0.55"
          clipPath={`url(#${clipId})`}
          style={{ transition: 'cy 1.2s cubic-bezier(0.4,0,0.2,1)' }}
        />
      )}

      {/* === Cylinder shell === */}
      <rect
        x="20" y={bodyTop} width="60" height={bodyH}
        fill="url(#grad-shell)"
        stroke="#1e3a5f"
        strokeWidth="1.5"
        rx="1"
      />
      {/* Highlight stripe */}
      <rect x="22" y={bodyTop} width="6" height={bodyH} fill="white" fillOpacity="0.04" rx="1" />

      {/* Horizontal ring lines */}
      {[0.25, 0.5, 0.75].map((f, i) => (
        <line
          key={i}
          x1="20" y1={bodyTop + bodyH * f}
          x2="80" y2={bodyTop + bodyH * f}
          stroke="#1e3a5f"
          strokeWidth="1"
          strokeDasharray="3,2"
        />
      ))}

      {/* === Dome cap === */}
      <ellipse cx="50" cy={bodyTop} rx="30" ry="9" fill="#1e3a5f" stroke="#334155" strokeWidth="1.2" />
      <ellipse cx="50" cy={bodyTop} rx="30" ry="9" fill="none" stroke="#2d5a8e" strokeWidth="0.8" />
      {/* vent pipe on top */}
      <rect x="47" y="7" width="6" height="12" fill="#334155" rx="2" />
      <ellipse cx="50" cy="7" rx="3" ry="1.5" fill="#1e3a5f" stroke="#334155" strokeWidth="0.8" />

      {/* === Discharge nozzle === */}
      <rect x="45" y={coneBot} width="10" height="10" fill="#1e3a5f" stroke="#334155" strokeWidth="1" />
      <ellipse cx="50" cy={coneBot + 10} rx="5" ry="1.5" fill="#0f172a" stroke="#334155" strokeWidth="0.8" />

      {/* === Ladder (right side) === */}
      <line x1="78" y1={bodyTop + 10} x2="78" y2={bodyBot - 5} stroke="#334155" strokeWidth="1.5" />
      <line x1="82" y1={bodyTop + 10} x2="82" y2={bodyBot - 5} stroke="#334155" strokeWidth="1.5" />
      {Array.from({ length: 8 }).map((_, i) => (
        <line
          key={i}
          x1="78" y1={bodyTop + 15 + i * 18}
          x2="82" y2={bodyTop + 15 + i * 18}
          stroke="#334155" strokeWidth="1"
        />
      ))}

      {/* === % label === */}
      <text
        x="50" y="105"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="13"
        fontWeight="bold"
        fill={pct < 5 ? '#64748b' : 'white'}
        style={{ fontFamily: 'monospace' }}
      >{pct}%</text>
    </svg>
  )
}

// ─── Silo Card ────────────────────────────────────────────────────────────────
function SiloCard({ silo, onEdit }: { silo: Silo; onEdit: (s: Silo) => void }) {
  const p = pctOf(silo.stock_fisico, silo.capacidad_max)
  const sapD = parseFloat(sapDiffPct(silo.stock_fisico, silo.stock_sap))
  const borderClass = p < 20 ? 'border-red-500/40' : p < 50 ? 'border-amber-500/30' : 'border-slate-700/40'
  const hasEspacio = silo.espacio_mar != null || silo.espacio_centro != null || silo.espacio_cerro != null

  return (
    <div className={`card ${borderClass} card-hover overflow-hidden group animate-fade-in`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <span className="text-blue-400 text-xs font-bold uppercase tracking-widest">{silo.silo}</span>
          <h3 className="text-white font-bold text-sm mt-0.5 leading-tight">{silo.producto}</h3>
        </div>
        <button
          onClick={() => onEdit(silo)}
          className="opacity-0 group-hover:opacity-100 btn-ghost p-1.5 text-xs transition-opacity"
          title="Editar"
        >✎</button>
      </div>

      {/* Silo visual + data */}
      <div className="flex items-start gap-3 px-5 pb-4">
        {/* Animated SVG silo */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <SiloAnimado pct={p} size={90} />
        </div>

        {/* Right side data */}
        <div className="flex-1 min-w-0 space-y-3 pt-1">
          {/* Stock bars */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Stock físico</span>
              <span className="text-white font-bold">{fmt(silo.stock_fisico)} t</span>
            </div>
            <LevelBar value={silo.stock_fisico} max={silo.capacidad_max} height="h-2" />
            <div className="flex justify-between text-xs text-slate-600 mt-0.5">
              <span>{p}% capacidad</span>
              <span>Cap. {fmt(silo.capacidad_max)} t</span>
            </div>
          </div>

          {/* SAP diff badge */}
          <div className="flex gap-2">
            <div className={`flex-1 rounded-lg px-2 py-1.5 text-center text-xs ${Math.abs(sapD) > 5 ? 'bg-red-500/10 border border-red-500/20' : Math.abs(sapD) > 3 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
              <span className="text-slate-500 text-xs">SAP </span>
              <span className={`font-bold ${diffColor(sapD)}`}>{fmt(silo.stock_sap)} t</span>
            </div>
            <div className={`flex-none rounded-lg px-2 py-1.5 text-center text-xs ${Math.abs(sapD) > 5 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-700/40 border border-slate-700/30'}`}>
              <span className={`font-bold ${diffColor(sapD)}`}>{sapD > 0 ? '+' : ''}{sapD}%</span>
            </div>
          </div>

          {/* Espacio libre medición */}
          {hasEspacio && (
            <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/30">
              <p className="text-slate-500 text-xs font-semibold mb-1.5 uppercase tracking-wide">Espacio Libre (m)</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {silo.espacio_mar != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">L.Mar</span>
                    <span className="text-slate-200 font-mono font-semibold">{fmtDec(silo.espacio_mar, 2)}</span>
                  </div>
                )}
                {silo.espacio_centro != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Centro</span>
                    <span className="text-slate-200 font-mono font-semibold">{fmtDec(silo.espacio_centro, 2)}</span>
                  </div>
                )}
                {silo.espacio_cerro != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">L.Cerro</span>
                    <span className="text-slate-200 font-mono font-semibold">{fmtDec(silo.espacio_cerro, 2)}</span>
                  </div>
                )}
                {silo.espacio_promedio != null && (
                  <div className="flex justify-between col-span-2 pt-1 border-t border-slate-700/30 mt-0.5">
                    <span className="text-blue-400 font-semibold">Promedio</span>
                    <span className="text-blue-300 font-mono font-bold">{fmtDec(silo.espacio_promedio, 2)} m</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {silo.observaciones && (
        <div className="px-5 pb-3">
          <p className="text-slate-500 text-xs italic truncate" title={silo.observaciones}>
            "{silo.observaciones}"
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Tolva Row ────────────────────────────────────────────────────────────────
function TolvaRow({ tolva, consumo, onEdit }: {
  tolva: Tolva; consumo?: Consumo; onEdit: (t: Tolva) => void
}) {
  const th = consumo?.consumo_th ?? tolva.consumo_th
  const autonomiaH = th > 0 ? tolva.stock_fisico / th : 999
  const sapD = parseFloat(sapDiffPct(tolva.stock_fisico, tolva.stock_sap))
  const capP = pctOf(tolva.stock_fisico, tolva.capacidad_max)

  const autBadge =
    autonomiaH > 24 ? 'badge-green' : autonomiaH > 12 ? 'badge-yellow' : 'badge-red'

  return (
    <tr className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group animate-fade-in">
      <td className="px-5 py-4">
        <p className="text-white font-semibold text-sm">{tolva.material}</p>
        <div className="w-28 mt-2">
          <LevelBar value={tolva.stock_fisico} max={tolva.capacidad_max} />
          <p className="text-slate-500 text-xs mt-1">{capP}% capacidad</p>
        </div>
      </td>
      <td className="px-4 py-4 text-right">
        <p className="text-white font-semibold">{fmt(tolva.stock_fisico)} t</p>
      </td>
      <td className="px-4 py-4 text-right">
        <p className={`font-semibold ${diffColor(sapD)}`}>{fmt(tolva.stock_sap)} t</p>
        {Math.abs(sapD) > 3 && (
          <p className={`text-xs ${diffColor(sapD)}`}>{sapD > 0 ? '+' : ''}{sapD}%</p>
        )}
      </td>
      <td className="px-4 py-4 text-right text-slate-300 text-sm">{fmt(tolva.stock_plan)} t</td>
      <td className="px-4 py-4 text-right">
        <span className="text-blue-300 font-medium text-sm">{fmtDec(th)} t/h</span>
      </td>
      <td className="px-4 py-4 text-right">
        <span className={autBadge}>{autStr(autonomiaH)}</span>
      </td>
      <td className="px-4 py-4 text-right">
        <button
          onClick={() => onEdit(tolva)}
          className="opacity-0 group-hover:opacity-100 btn-ghost px-3 py-1.5 text-xs transition-opacity"
        >Editar</button>
      </td>
    </tr>
  )
}

// ─── Tanque SVG (vertical cylinder gauge) ─────────────────────────────────────
function TanqueSVG({ pct, isGLP }: { pct: number; isGLP: boolean }) {
  const color = isGLP
    ? (pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#ef4444')
    : (pct >= 50 ? '#06b6d4' : pct >= 25 ? '#f59e0b' : '#ef4444')
  const fillH = (pct / 100) * 70
  const fillTop = 15 + (70 - fillH)
  return (
    <svg viewBox="0 0 50 110" width="44" height="88" className="flex-shrink-0">
      <defs>
        <linearGradient id={`tg-${isGLP ? 'glp' : 'add'}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="50%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.5" />
        </linearGradient>
      </defs>
      {/* Shell */}
      <rect x="8" y="10" width="34" height="75" rx="4" fill="#0f172a" stroke="#1e3a5f" strokeWidth="1.5" />
      {/* Fill */}
      <rect x="9" y={fillTop} width="32" height={fillH} rx="3"
        fill={`url(#tg-${isGLP ? 'glp' : 'add'})`}
        style={{ transition: 'y 1s ease, height 1s ease' }}
      />
      {/* Horizontal scale lines */}
      {[0.25, 0.5, 0.75].map((f, i) => (
        <line key={i} x1="9" y1={15 + f * 70} x2="41" y2={15 + f * 70}
          stroke="#1e3a5f" strokeWidth="0.8" />
      ))}
      {/* Percent label */}
      <text x="25" y="54" textAnchor="middle" dominantBaseline="middle"
        fontSize="9" fontWeight="bold" fill={pct < 10 ? '#475569' : 'white'}
        fontFamily="monospace">{pct}%</text>
      {/* Bottom nozzle */}
      <rect x="20" y="85" width="10" height="8" rx="2" fill="#1e3a5f" stroke="#334155" strokeWidth="1" />
      {/* Top cap */}
      <ellipse cx="25" cy="10" rx="17" ry="4" fill="#1e3a5f" stroke="#334155" strokeWidth="1" />
      <rect x="22" y="5" width="6" height="6" rx="1" fill="#334155" />
    </svg>
  )
}

// ─── Tanque Card ──────────────────────────────────────────────────────────────
function TanqueCard({ tanque, onEdit }: { tanque: Tanque; onEdit: (t: Tanque) => void }) {
  const sapD = parseFloat(sapDiffPct(tanque.stock_real, tanque.stock_sap))
  const autonomiaH = tanque.consumo_estimado > 0
    ? (tanque.stock_real / tanque.consumo_estimado) * 24 : 999
  const capacidad = tanque.capacidad_diseno ?? (tanque.tipo === 'GLP' ? 4000 : 10000)
  const levP = tanque.porcentaje != null ? Math.round(tanque.porcentaje) : pctOf(tanque.stock_real, capacidad)

  const isGLP = tanque.tipo === 'GLP'
  const cardGradient = isGLP
    ? 'bg-gradient-to-br from-orange-500/8 to-amber-500/4'
    : 'bg-gradient-to-br from-cyan-500/8 to-blue-500/4'
  const borderClass = isGLP ? 'border-orange-500/25' : 'border-cyan-500/20'
  const typeColor = isGLP ? 'text-orange-400' : 'text-cyan-400'

  return (
    <div className={`card ${borderClass} ${cardGradient} card-hover p-5 group animate-fade-in`}>
      <div className="flex items-start gap-3">
        {/* Tank SVG */}
        <TanqueSVG pct={levP} isGLP={isGLP} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1">
            <div>
              <span className={`text-xs font-bold uppercase tracking-widest ${typeColor}`}>{tanque.tipo}</span>
              <h3 className="text-white font-bold text-sm mt-0.5 leading-tight">{tanque.nombre}</h3>
              {tanque.codigo && <span className="text-slate-600 text-xs font-mono">{tanque.codigo}</span>}
            </div>
            <button
              onClick={() => onEdit(tanque)}
              className="opacity-0 group-hover:opacity-100 btn-ghost p-1.5 text-xs transition-opacity"
            >✎</button>
          </div>

          <div className="mt-2 mb-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Nivel</span>
              <span className="text-white font-semibold">{fmt(tanque.stock_real)} {tanque.unidad}</span>
            </div>
            <LevelBar value={levP} max={100} height="h-2.5" />
            <div className="flex justify-between text-xs text-slate-600 mt-0.5">
              <span>{levP}%</span>
              <span>Cap. {fmt(capacidad)} {tanque.unidad}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="bg-slate-800/60 rounded-lg p-2">
              <p className="text-slate-500 text-xs">SAP</p>
              <p className={`font-bold text-xs ${diffColor(sapD)}`}>{fmt(tanque.stock_sap)}</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-2">
              <p className="text-slate-500 text-xs">Consumo</p>
              <p className="text-blue-300 font-bold text-xs">{tanque.consumo_estimado > 0 ? fmt(tanque.consumo_estimado) : '—'}</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-2">
              <p className="text-slate-500 text-xs">Autonomía</p>
              <p className={`font-bold text-xs ${autColor(autonomiaH)}`}>{autStr(autonomiaH)}</p>
            </div>
          </div>

          {Math.abs(sapD) > 5 && (
            <div className="mt-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg p-1.5 text-center">
              ⚠ Δ SAP: {sapD > 0 ? '+' : ''}{sapD}%
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Edit Silo Modal ──────────────────────────────────────────────────────────
function EditSiloModal({ silo, onClose, onSave }: {
  silo: Silo; onClose: () => void; onSave: (d: Partial<Silo>) => void
}) {
  const [form, setForm] = useState({
    stock_fisico:    silo.stock_fisico,
    stock_sap:       silo.stock_sap,
    stock_plan:      silo.stock_plan,
    densidad:        silo.densidad,
    capacidad_max:   silo.capacidad_max,
    espacio_mar:     silo.espacio_mar ?? '',
    espacio_centro:  silo.espacio_centro ?? '',
    espacio_cerro:   silo.espacio_cerro ?? '',
    espacio_promedio:silo.espacio_promedio ?? '',
    hora:            silo.hora ?? '',
    realizado_por:   silo.realizado_por ?? '',
    observaciones:   silo.observaciones,
  })
  const setN = (k: string, v: string) =>
    setForm(f => ({ ...f, [k]: ['observaciones','hora','realizado_por'].includes(k) ? v : (v === '' ? '' : parseFloat(v) || 0) }))

  const stockFields: [string, string][] = [
    ['Stock Físico (t)', 'stock_fisico'],
    ['Stock SAP (t)',    'stock_sap'],
    ['Stock Plan (t)',   'stock_plan'],
    ['Densidad (t/m³)', 'densidad'],
    ['Capacidad Máx (t)','capacidad_max'],
  ]
  const espacioFields: [string, string][] = [
    ['L. Mar (m)',    'espacio_mar'],
    ['Centro (m)',    'espacio_centro'],
    ['L. Cerro (m)',  'espacio_cerro'],
    ['Promedio (m)',  'espacio_promedio'],
  ]

  return (
    <Modal title={`${silo.silo} — ${silo.producto}`} onClose={onClose}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">Stock</p>
        <div className="grid grid-cols-2 gap-3">
          {stockFields.map(([label, key]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                type="number" step="0.01"
                value={(form as Record<string, number | string>)[key]}
                onChange={e => setN(key, e.target.value)}
                className="input-dark"
              />
            </div>
          ))}
        </div>

        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide pt-1">Espacio Libre (Medición)</p>
        <div className="grid grid-cols-2 gap-3">
          {espacioFields.map(([label, key]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                type="number" step="0.01"
                value={(form as Record<string, number | string>)[key]}
                onChange={e => setN(key, e.target.value)}
                placeholder="—"
                className="input-dark"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Hora medición</label>
            <input type="time" value={form.hora} onChange={e => setN('hora', e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="label">Realizado por</label>
            <input value={form.realizado_por} onChange={e => setN('realizado_por', e.target.value)} placeholder="Operador" className="input-dark" />
          </div>
        </div>

        <div>
          <label className="label">Observaciones</label>
          <textarea
            value={form.observaciones}
            onChange={e => setN('observaciones', e.target.value)}
            rows={2}
            className="input-dark resize-none"
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 btn-ghost py-2.5 text-sm">Cancelar</button>
          <button onClick={() => onSave(form as Partial<Silo>)} className="flex-1 btn-primary py-2.5 text-sm">Guardar Cambios</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Edit Tolva Modal ─────────────────────────────────────────────────────────
function EditTolvaModal({ tolva, onClose, onSave }: {
  tolva: Tolva; onClose: () => void; onSave: (d: Partial<Tolva>) => void
}) {
  const [form, setForm] = useState({
    stock_fisico: tolva.stock_fisico,
    stock_sap: tolva.stock_sap,
    stock_plan: tolva.stock_plan,
    consumo_th: tolva.consumo_th,
    densidad: tolva.densidad,
    capacidad_max: tolva.capacidad_max,
    observaciones: tolva.observaciones,
  })
  const setN = (k: string, v: string) =>
    setForm(f => ({ ...f, [k]: k === 'observaciones' ? v : parseFloat(v) || 0 }))

  const fields: [string, string][] = [
    ['Stock Físico (t)', 'stock_fisico'],
    ['Stock SAP (t)', 'stock_sap'],
    ['Stock Plan (t)', 'stock_plan'],
    ['Consumo (t/h)', 'consumo_th'],
    ['Densidad (t/m³)', 'densidad'],
    ['Capacidad Máx (t)', 'capacidad_max'],
  ]

  return (
    <Modal title={`Tolva — ${tolva.material}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {fields.map(([label, key]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                type="number" step="0.01"
                value={(form as Record<string, number | string>)[key] as number}
                onChange={e => setN(key, e.target.value)}
                className="input-dark"
              />
            </div>
          ))}
        </div>
        <div>
          <label className="label">Observaciones</label>
          <textarea
            value={form.observaciones}
            onChange={e => setN('observaciones', e.target.value)}
            rows={2}
            className="input-dark resize-none"
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 btn-ghost py-2.5 text-sm">Cancelar</button>
          <button onClick={() => onSave(form)} className="flex-1 btn-primary py-2.5 text-sm">Guardar Cambios</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Edit Tanque Modal ────────────────────────────────────────────────────────
function EditTanqueModal({ tanque, onClose, onSave }: {
  tanque: Tanque; onClose: () => void; onSave: (d: Partial<Tanque>) => void
}) {
  const [form, setForm] = useState({
    stock_real: tanque.stock_real,
    stock_sap: tanque.stock_sap,
    consumo_estimado: tanque.consumo_estimado,
    observaciones: tanque.observaciones,
  })
  const setN = (k: string, v: string) =>
    setForm(f => ({ ...f, [k]: k === 'observaciones' ? v : parseFloat(v) || 0 }))

  return (
    <Modal title={`${tanque.tipo} — ${tanque.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            [`Stock Real (${tanque.unidad})`, 'stock_real'],
            [`Stock SAP (${tanque.unidad})`, 'stock_sap'],
            [`Consumo estimado (${tanque.unidad}/día)`, 'consumo_estimado'],
          ].map(([label, key]) => (
            <div key={key} className={key === 'consumo_estimado' ? 'col-span-2' : ''}>
              <label className="label">{label}</label>
              <input
                type="number" step="0.01"
                value={(form as Record<string, number | string>)[key] as number}
                onChange={e => setN(key, e.target.value)}
                className="input-dark"
              />
            </div>
          ))}
        </div>
        <div>
          <label className="label">Observaciones</label>
          <textarea
            value={form.observaciones}
            onChange={e => setN('observaciones', e.target.value)}
            rows={2}
            className="input-dark resize-none"
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 btn-ghost py-2.5 text-sm">Cancelar</button>
          <button onClick={() => onSave(form)} className="flex-1 btn-primary py-2.5 text-sm">Guardar Cambios</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Despacho Form ────────────────────────────────────────────────────────────
function DespachoForm({ silos, onSave }: { silos: Silo[]; onSave: (d: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    silo_origen: silos[0]?.silo ?? '',
    producto: silos[0]?.producto ?? '',
    cantidad_ton: '',
    tipo_despacho: 'granel',
    cliente: '',
    destino: '',
    observaciones: '',
    registrado_por: '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const onSiloChange = (s: string) => {
    const found = silos.find(x => x.silo === s)
    setForm(f => ({ ...f, silo_origen: s, producto: found?.producto ?? '' }))
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.cantidad_ton || parseFloat(form.cantidad_ton) <= 0) return
    onSave({ ...form, cantidad_ton: parseFloat(form.cantidad_ton), fecha: todayStr })
    setForm(f => ({ ...f, cantidad_ton: '', cliente: '', destino: '', observaciones: '' }))
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-4">
      <h3 className="text-white font-bold flex items-center gap-2 text-sm">
        <span className="text-blue-400 text-base">🚚</span> Registrar Despacho
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Silo Origen</label>
          <select value={form.silo_origen} onChange={e => onSiloChange(e.target.value)} className="input-dark">
            {silos.map(s => <option key={s.id} value={s.silo}>{s.silo}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Producto</label>
          <input value={form.producto} readOnly className="input-dark opacity-60 cursor-not-allowed" />
        </div>
        <div>
          <label className="label">Cantidad (t)</label>
          <input
            type="number" step="0.1" min="0.1"
            value={form.cantidad_ton}
            onChange={e => set('cantidad_ton', e.target.value)}
            placeholder="0.0" required
            className="input-dark"
          />
        </div>
        <div>
          <label className="label">Tipo</label>
          <select value={form.tipo_despacho} onChange={e => set('tipo_despacho', e.target.value)} className="input-dark">
            <option value="granel">Granel</option>
            <option value="big_bag">Big Bag</option>
            <option value="saco">Saco (50 kg)</option>
          </select>
        </div>
        <div>
          <label className="label">Cliente</label>
          <input value={form.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Nombre cliente" className="input-dark" />
        </div>
        <div>
          <label className="label">Destino</label>
          <input value={form.destino} onChange={e => set('destino', e.target.value)} placeholder="Destino" className="input-dark" />
        </div>
        <div>
          <label className="label">Observaciones</label>
          <input value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Opcional" className="input-dark" />
        </div>
        <div>
          <label className="label">Registrado por</label>
          <input value={form.registrado_por} onChange={e => set('registrado_por', e.target.value)} placeholder="Operador" className="input-dark" />
        </div>
      </div>
      <button type="submit" className="btn-primary w-full py-3 text-sm font-semibold">
        ✓ Confirmar Despacho
      </button>
    </form>
  )
}

// ─── Consumo Inline Edit Row ──────────────────────────────────────────────────
function ConsumoRow({ consumo, tolva, onSave }: {
  consumo: Consumo; tolva?: Tolva; onSave: (id: string, th: number, horas: number) => void
}) {
  const [editTH, setEditTH] = useState(false)
  const [editH, setEditH] = useState(false)
  const [th, setTH] = useState(consumo.consumo_th.toString())
  const [horas, setHoras] = useState(consumo.horas_dia.toString())

  const save = () => {
    onSave(consumo.id, parseFloat(th) || 0, parseFloat(horas) || 22)
    setEditTH(false)
    setEditH(false)
  }

  const autH = consumo.consumo_th > 0 && tolva ? tolva.stock_fisico / consumo.consumo_th : 999
  const totalDia = consumo.consumo_th * consumo.horas_dia

  return (
    <tr className="border-b border-slate-700/30 hover:bg-slate-700/15 transition-colors animate-fade-in">
      <td className="px-5 py-4 text-white font-semibold text-sm">{consumo.material}</td>
      <td className="px-4 py-4 text-right">
        {editTH ? (
          <input
            type="number" step="0.1" value={th}
            onChange={e => setTH(e.target.value)}
            onBlur={save} onKeyDown={e => e.key === 'Enter' && save()} autoFocus
            className="w-24 bg-slate-700 border border-blue-500/60 rounded-lg px-2 py-1.5 text-white text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <button onClick={() => setEditTH(true)} className="text-blue-300 font-semibold text-sm hover:text-blue-200 hover:underline">
            {fmtDec(consumo.consumo_th)} t/h
          </button>
        )}
      </td>
      <td className="px-4 py-4 text-right">
        {editH ? (
          <input
            type="number" step="0.5" value={horas}
            onChange={e => setHoras(e.target.value)}
            onBlur={save} onKeyDown={e => e.key === 'Enter' && save()} autoFocus
            className="w-20 bg-slate-700 border border-blue-500/60 rounded-lg px-2 py-1.5 text-white text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <button onClick={() => setEditH(true)} className="text-slate-300 font-medium text-sm hover:text-white hover:underline">
            {consumo.horas_dia}h
          </button>
        )}
      </td>
      <td className="px-4 py-4 text-right text-slate-300 text-sm">{fmt(totalDia)} t</td>
      <td className="px-4 py-4 text-right">
        <span className={autH > 24 ? 'badge-green' : autH > 12 ? 'badge-yellow' : 'badge-red'}>
          {autStr(autH)}
        </span>
      </td>
    </tr>
  )
}

// ─── JSON View Panel ──────────────────────────────────────────────────────────
function JsonPanel({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data, null, 2)
  return (
    <div className="card overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-slate-400 text-xs font-mono ml-2">stock_{format(today, 'yyyyMMdd')}.json</span>
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(json)}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >📋 Copiar JSON</button>
      </div>
      <pre className="p-5 text-xs font-mono text-emerald-300 overflow-auto max-h-72 leading-relaxed">
        {json}
      </pre>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
type Tab = 'silos' | 'tolvas' | 'tanques' | 'despacho' | 'consumos' | 'historia'

type HistoriaRow = {
  fecha: string
  material?: string
  silo?: string
  stock_fisico?: number
  cantidad_ton?: number
  producto?: string
}

export default function Dashboard() {
  const router = useRouter()
  const [user,      setUser]      = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [silos,     setSilos]     = useState<Silo[]>([])
  const [tolvas,    setTolvas]    = useState<Tolva[]>([])
  const [tanques,   setTanques]   = useState<Tanque[]>([])
  const [despachos, setDespachos] = useState<Despacho[]>([])
  const [consumos,  setConsumos]  = useState<Consumo[]>([])
  const [loading,      setLoading]      = useState(true)
  const [tab,          setTab]          = useState<Tab>('silos')
  const [jsonView,     setJsonView]     = useState(false)
  const [editSilo,     setEditSilo]     = useState<Silo | null>(null)
  const [editTolva,    setEditTolva]    = useState<Tolva | null>(null)
  const [editTanque,   setEditTanque]   = useState<Tanque | null>(null)
  const [lastUpdated,  setLastUpdated]  = useState('')
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [historiaS,    setHistoriaS]    = useState<HistoriaRow[]>([])
  const [historiaT,    setHistoriaT]    = useState<HistoriaRow[]>([])
  const [historiaD,    setHistoriaD]    = useState<HistoriaRow[]>([])
  const [loadingHist,  setLoadingHist]  = useState(false)

  // ── Auth guard ──────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      setAuthReady(true)
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
    })
    return () => subscription.unsubscribe()
  }, [router])

  const logout = async () => {
    await sb.auth.signOut()
    router.push('/login')
  }

  const loadAll = useCallback(async () => {
    const [s, t, tk, d, c] = await Promise.all([
      sb.from('stock_silos').select('*').eq('fecha', selectedDate),
      sb.from('stock_tolvas').select('*').eq('fecha', selectedDate),
      sb.from('stock_tanques').select('*').eq('fecha', selectedDate),
      sb.from('despacho_cemento').select('*').eq('fecha', selectedDate).order('created_at', { ascending: false }),
      sb.from('consumos_programados').select('*').eq('activo', true).order('material'),
    ])
    setSilos(s.data ?? [])
    setTolvas(t.data ?? [])
    setTanques(tk.data ?? [])
    setDespachos(d.data ?? [])
    setConsumos(c.data ?? [])
    setLoading(false)
    setLastUpdated(format(new Date(), 'HH:mm:ss'))
  }, [selectedDate])

  const loadHistory = useCallback(async () => {
    setLoadingHist(true)
    const desde = format(subDays(new Date(), 30), 'yyyy-MM-dd')
    const [s, t, d] = await Promise.all([
      sb.from('stock_silos').select('fecha,silo,producto,stock_fisico').gte('fecha', desde).order('fecha'),
      sb.from('stock_tolvas').select('fecha,material,stock_fisico').gte('fecha', desde).order('fecha'),
      sb.from('despacho_cemento').select('fecha,cantidad_ton,producto').gte('fecha', desde).order('fecha'),
    ])
    setHistoriaS(s.data ?? [])
    setHistoriaT(t.data ?? [])
    setHistoriaD(d.data ?? [])
    setLoadingHist(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { if (tab === 'historia') loadHistory() }, [tab, loadHistory])

  // Realtime subscriptions
  useEffect(() => {
    const ch = sb.channel('stock-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_silos' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_tolvas' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_tanques' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'despacho_cemento' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consumos_programados' }, loadAll)
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [loadAll])

  // KPIs
  const kpis = useMemo(() => {
    const totalSilos     = silos.reduce((a, s) => a + s.stock_fisico, 0)
    const totalDespacho  = despachos.reduce((a, d) => a + d.cantidad_ton, 0)
    const critMaterials  = tolvas.filter(t => {
      const c = consumos.find(x => x.material === t.material)
      const th = c?.consumo_th ?? t.consumo_th
      return th > 0 && (t.stock_fisico / th) < 12
    }).length
    const sapErrors = [...silos, ...tolvas].filter(item => {
      const d = Math.abs(item.stock_fisico - item.stock_sap) / (item.stock_sap || 1) * 100
      return d > 5
    }).length
    const minAut = tolvas.reduce((min, t) => {
      const c = consumos.find(x => x.material === t.material)
      const th = c?.consumo_th ?? t.consumo_th
      return th > 0 ? Math.min(min, t.stock_fisico / th) : min
    }, 999)
    return { totalSilos, totalDespacho, critMaterials, sapErrors, minAut }
  }, [silos, tolvas, despachos, consumos])

  // Alerts
  const alerts: Alert[] = useMemo(() => {
    const a: Alert[] = []
    tolvas.forEach(t => {
      const c   = consumos.find(x => x.material === t.material)
      const th  = c?.consumo_th ?? t.consumo_th
      if (th > 0) {
        const h = t.stock_fisico / th
        if (h < 8)       a.push({ type: 'critical', msg: `🚨 ${t.material}: ${Math.round(h)}h autonomía — CRÍTICO, programar recepción urgente` })
        else if (h < 16) a.push({ type: 'warning',  msg: `⚠️ ${t.material}: ${Math.round(h)}h autonomía — Programar recepción próximas 24h` })
      }
    })
    silos.forEach(s => {
      const d = Math.abs(parseFloat(sapDiffPct(s.stock_fisico, s.stock_sap)))
      if (d > 5) a.push({ type: 'warning', msg: `⚠️ ${s.silo}: Diferencia SAP ${d.toFixed(1)}% — Verificar medición o actualizar SAP` })
    })
    tanques.forEach(tk => {
      const h = tk.consumo_estimado > 0 ? (tk.stock_real / tk.consumo_estimado) * 24 : 999
      if (h < 12) a.push({ type: 'critical', msg: `🚨 ${tk.nombre}: ${Math.round(h)}h autonomía — CRÍTICO` })
    })
    return a
  }, [silos, tolvas, tanques, consumos])

  // Save handlers
  const saveSilo = async (data: Partial<Silo>) => {
    if (!editSilo) return
    await sb.from('stock_silos').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editSilo.id)
    setEditSilo(null); loadAll()
  }
  const saveTolva = async (data: Partial<Tolva>) => {
    if (!editTolva) return
    await sb.from('stock_tolvas').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editTolva.id)
    setEditTolva(null); loadAll()
  }
  const saveTanque = async (data: Partial<Tanque>) => {
    if (!editTanque) return
    await sb.from('stock_tanques').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editTanque.id)
    setEditTanque(null); loadAll()
  }
  const saveDespacho = async (data: Record<string, unknown>) => {
    await sb.from('despacho_cemento').insert(data); loadAll()
  }
  const saveConsumo = async (id: string, th: number, horas: number) => {
    await sb.from('consumos_programados').update({ consumo_th: th, horas_dia: horas, updated_at: new Date().toISOString() }).eq('id', id)
    loadAll()
  }

  const exportCSV = () => {
    const rows: string[] = []
    rows.push('TIPO,NOMBRE,STOCK FISICO,SAP,PLAN,FECHA')
    silos.forEach(s  => rows.push(`Silo,${s.silo} - ${s.producto},${s.stock_fisico},${s.stock_sap},${s.stock_plan},${s.fecha}`))
    tolvas.forEach(t => rows.push(`Tolva,${t.material},${t.stock_fisico},${t.stock_sap},${t.stock_plan},${t.fecha}`))
    tanques.forEach(t => rows.push(`Tanque,${t.nombre},${t.stock_real},${t.stock_sap},,${t.fecha}`))
    rows.push('')
    rows.push('DESPACHO,SILO,PRODUCTO,CANTIDAD (t),TIPO,CLIENTE,FECHA')
    despachos.forEach(d => rows.push(`Despacho,${d.silo_origen},${d.producto},${d.cantidad_ton},${d.tipo_despacho},${d.cliente},${d.fecha}`))
    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stock_molienda_${selectedDate}.csv`
    a.click()
  }

  const TABS: { id: Tab; label: string; icon: string; count: number }[] = [
    { id: 'silos',    label: 'Silos Cemento',   icon: '🏭', count: silos.length },
    { id: 'tolvas',   label: 'Mat. Primas',      icon: '🏗️', count: tolvas.length },
    { id: 'tanques',  label: 'GLP / Aditivos',   icon: '🔥', count: tanques.length },
    { id: 'despacho', label: 'Despacho',          icon: '🚚', count: despachos.length },
    { id: 'consumos', label: 'Consumos',          icon: '⚙️', count: consumos.length },
    { id: 'historia', label: 'Historial',         icon: '📅', count: 30 },
  ]

  if (!authReady) return (
    <div className="min-h-screen bg-[#080e1a] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Verificando acceso…</p>
      </div>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen bg-[#080e1a] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Cargando datos de molienda…</p>
      </div>
    </div>
  )

  const jsonData = { fecha: selectedDate, silos, tolvas, tanques, despachos, consumos }

  // ── Historia: calcular datos por fecha ──────────────────────
  const histSilosDias = useMemo(() => {
    const dias: Record<string, number> = {}
    historiaS.forEach(r => {
      dias[r.fecha!] = (dias[r.fecha!] ?? 0) + (r.stock_fisico ?? 0)
    })
    return Object.entries(dias).map(([fecha, total]) => ({
      fecha: format(parseISO(fecha), 'dd/MM', { locale: es }),
      total: Math.round(total),
    })).slice(-14)
  }, [historiaS])

  const histTolvasMat = useMemo(() => {
    const materiales = Array.from(new Set(historiaT.map(r => r.material!)))
    const dias = Array.from(new Set(historiaT.map(r => r.fecha!))).sort().slice(-14)
    return dias.map(fecha => {
      const row: Record<string, string | number> = { fecha: format(parseISO(fecha), 'dd/MM', { locale: es }) }
      materiales.forEach(m => {
        const found = historiaT.find(r => r.fecha === fecha && r.material === m)
        row[m] = found?.stock_fisico ?? 0
      })
      return row
    })
  }, [historiaT])

  const histDespacho = useMemo(() => {
    const dias: Record<string, number> = {}
    historiaD.forEach(r => {
      dias[r.fecha!] = (dias[r.fecha!] ?? 0) + (r.cantidad_ton ?? 0)
    })
    return Object.entries(dias).map(([fecha, total]) => ({
      fecha: format(parseISO(fecha), 'dd/MM', { locale: es }),
      total: Math.round(total),
    })).slice(-14)
  }, [historiaD])

  return (
    <div className="min-h-screen bg-navy-900">

      {/* ── Header ── */}
      <header className="bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/30 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center text-sm font-black text-white shadow-lg shadow-blue-500/30">P</div>
            <div>
              <h1 className="text-white font-black text-base tracking-tight leading-none">
                POLPAICO <span className="text-blue-400">MOLIENDA</span>
              </h1>
              <p className="text-slate-500 text-xs capitalize mt-0.5">
                {format(today, "EEEE d 'de' MMMM yyyy", { locale: es })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Date picker */}
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700/60 rounded-xl px-3 py-1.5">
              <span className="text-slate-500 text-xs">📅</span>
              <input
                type="date"
                value={selectedDate}
                max={todayStr}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
                title="Seleccionar fecha"
              />
              {selectedDate !== todayStr && (
                <button
                  onClick={() => setSelectedDate(todayStr)}
                  className="text-blue-400 hover:text-blue-300 text-xs ml-1"
                  title="Volver a hoy"
                >Hoy</button>
              )}
            </div>
            {lastUpdated && (
              <span className="text-slate-600 text-xs hidden lg:block">↻ {lastUpdated}</span>
            )}
            <button
              onClick={exportCSV}
              className="btn-ghost px-3 py-1.5 text-xs text-emerald-400 hover:text-emerald-300"
              title="Exportar CSV para Google Sheets"
            >⬇ CSV</button>
            <button
              onClick={() => setJsonView(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${jsonView ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'btn-ghost text-slate-400'}`}
            >
              {'{ }'} JSON
            </button>
            <button onClick={loadAll} className="btn-ghost px-3 py-1.5 text-xs" title="Actualizar">↻</button>
            <div className="flex items-center gap-1.5 hidden sm:flex">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow" />
              <span className="text-slate-500 text-xs">Live</span>
            </div>
            {/* User + logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-700/60">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-slate-300 text-xs font-medium leading-none">
                  {user?.email?.split('@')[0]}
                </span>
                <span className="text-slate-600 text-xs leading-none mt-0.5">
                  {user?.email?.split('@')[1]}
                </span>
              </div>
              <div className="w-7 h-7 bg-blue-600/30 border border-blue-500/30 rounded-full flex items-center justify-center text-blue-300 text-xs font-bold uppercase">
                {user?.email?.[0] ?? '?'}
              </div>
              <button
                onClick={logout}
                className="btn-ghost px-2.5 py-1.5 text-xs text-slate-400 hover:text-red-400"
                title="Cerrar sesión"
              >
                ⎋
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-5 py-6 space-y-5">

        {/* ── Alerts ── */}
        {alerts.length > 0 && (
          <div className="space-y-2 animate-slide-up">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`rounded-xl px-4 py-3 text-sm border ${
                  a.type === 'critical'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : 'bg-amber-500/8 border-amber-500/20 text-amber-300'
                }`}
              >
                {a.msg}
              </div>
            ))}
          </div>
        )}

        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-slide-up">
          <MetricCard
            label="Stock Total Silos"
            value={`${(kpis.totalSilos / 1000).toFixed(1)}k`} unit="t"
            sub={`${silos.length} silos activos`}
            color={`border-blue-500/20`} icon="🏭"
          />
          <MetricCard
            label="Despacho Hoy"
            value={fmt(kpis.totalDespacho)} unit="t"
            sub={`${despachos.length} movimientos`}
            color="border-emerald-500/20" icon="🚚"
          />
          <MetricCard
            label="Mat. Críticos"
            value={kpis.critMaterials}
            sub="< 12h autonomía"
            color={kpis.critMaterials > 0 ? 'border-red-500/40' : 'border-slate-700/30'}
            icon={kpis.critMaterials > 0 ? '🚨' : '✅'}
          />
          <MetricCard
            label="Mín. Autonomía"
            value={kpis.minAut > 999 ? '∞' : autStr(kpis.minAut)}
            sub="Materia prima"
            color={kpis.minAut < 12 ? 'border-red-500/40' : kpis.minAut < 24 ? 'border-amber-500/30' : 'border-emerald-500/20'}
            icon="⏱️"
          />
          <MetricCard
            label="Errores SAP"
            value={kpis.sapErrors}
            sub="Diferencias > 5%"
            color={kpis.sapErrors > 0 ? 'border-amber-500/30' : 'border-slate-700/30'}
            icon="📊"
          />
        </div>

        {/* ── JSON Panel ── */}
        {jsonView && <JsonPanel data={jsonData} />}

        {/* ── Tabs ── */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${tab === t.id ? 'tab-active' : 'tab-inactive'}`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/15 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Tab: SILOS ── */}
        {tab === 'silos' && (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {silos.map(s => <SiloCard key={s.id} silo={s} onEdit={setEditSilo} />)}
            {silos.length === 0 && (
              <div className="col-span-3 text-center py-20 text-slate-500">
                <p className="text-4xl mb-3">🏭</p>
                <p>No hay datos de silos para hoy. Agrega registros en Supabase.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: TOLVAS ── */}
        {tab === 'tolvas' && (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/80 border-b border-slate-700/50">
                <tr>
                  {['Material', 'Stock Físico', 'SAP', 'Plan', 'Consumo', 'Autonomía', ''].map(h => (
                    <th key={h} className={`px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider ${h === 'Material' || h === '' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tolvas.map(t => (
                  <TolvaRow
                    key={t.id} tolva={t}
                    consumo={consumos.find(c => c.material === t.material)}
                    onEdit={setEditTolva}
                  />
                ))}
              </tbody>
            </table>
            {tolvas.length === 0 && (
              <p className="text-center py-16 text-slate-500">No hay datos de tolvas para hoy.</p>
            )}
          </div>
        )}

        {/* ── Tab: GLP / ADITIVOS ── */}
        {tab === 'tanques' && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tanques.map(t => <TanqueCard key={t.id} tanque={t} onEdit={setEditTanque} />)}
            {tanques.length === 0 && (
              <div className="col-span-3 text-center py-20 text-slate-500">
                <p className="text-4xl mb-3">🔥</p>
                <p>No hay datos de tanques para hoy.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: DESPACHO ── */}
        {tab === 'despacho' && (
          <div className="grid lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2">
              <DespachoForm silos={silos} onSave={saveDespacho} />
            </div>
            <div className="lg:col-span-3">
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
                  <h3 className="text-white font-bold text-sm">Despachos de Hoy</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm">{fmt(despachos.reduce((a, d) => a + d.cantidad_ton, 0))} t</span>
                    <span className="badge-blue">{despachos.length} mov.</span>
                  </div>
                </div>
                <div className="overflow-auto max-h-[460px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700/50">
                      <tr>
                        {['Hora', 'Silo', 'Producto', 'Cantidad', 'Tipo', 'Cliente'].map(h => (
                          <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider ${h === 'Cantidad' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {despachos.map(d => (
                        <tr key={d.id} className="border-b border-slate-700/30 hover:bg-slate-700/15 transition-colors">
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                            {d.created_at ? format(new Date(d.created_at), 'HH:mm') : '—'}
                          </td>
                          <td className="px-4 py-3 text-blue-400 font-medium">{d.silo_origen}</td>
                          <td className="px-4 py-3 text-slate-200 truncate max-w-[120px]">{d.producto}</td>
                          <td className="px-4 py-3 text-white font-bold text-right">{fmt(d.cantidad_ton)} t</td>
                          <td className="px-4 py-3">
                            <span className="badge-blue capitalize">{d.tipo_despacho}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 truncate max-w-[100px]">{d.cliente || '—'}</td>
                        </tr>
                      ))}
                      {despachos.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-16 text-slate-500">
                            Sin despachos registrados hoy
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: CONSUMOS ── */}
        {tab === 'consumos' && (
          <div className="space-y-4">
            <div className="card p-4 bg-blue-500/5 border-blue-500/15">
              <p className="text-blue-300 text-sm">
                💡 <strong>Edición inline:</strong> haz clic en los valores de <span className="font-mono bg-blue-500/15 px-1 rounded">t/h</span> o <span className="font-mono bg-blue-500/15 px-1 rounded">horas</span> para editar directamente. Los cambios recalculan la autonomía en tiempo real.
              </p>
            </div>
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50">
                <h3 className="text-white font-bold text-sm">Consumos Programados</h3>
                <p className="text-slate-500 text-xs mt-0.5">Tasas de consumo por material — usadas para calcular autonomía</p>
              </div>
              <table className="w-full">
                <thead className="bg-slate-800/80 border-b border-slate-700/50">
                  <tr>
                    {['Material', 'Consumo (t/h)', 'Horas/día', 'Total/día', 'Autonomía'].map(h => (
                      <th key={h} className={`px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider ${h === 'Material' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consumos.map(c => (
                    <ConsumoRow
                      key={c.id} consumo={c}
                      tolva={tolvas.find(t => t.material === c.material)}
                      onSave={saveConsumo}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: HISTORIA ── */}
        {tab === 'historia' && (
          <div className="space-y-6 animate-slide-up">
            {loadingHist ? (
              <div className="text-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Cargando historial 30 días…</p>
              </div>
            ) : (
              <>
                {/* Google Sheets banner */}
                <div className="card p-4 bg-emerald-500/5 border-emerald-500/15 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-emerald-300 font-semibold text-sm">🔗 Integración Google Sheets</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Descarga el CSV de cualquier día y ábrelo en Sheets, o usa la URL de la API directamente.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={exportCSV}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                    >⬇ Exportar CSV</button>
                    <button
                      onClick={() => {
                        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/stock_silos?fecha=eq.${selectedDate}&select=*`
                        navigator.clipboard.writeText(url)
                        alert('URL copiada — úsala en Google Sheets con la función =IMPORTDATA()')
                      }}
                      className="btn-ghost px-4 py-2 text-xs font-semibold text-slate-300"
                    >📋 Copiar URL API</button>
                  </div>
                </div>

                {/* Chart 1: Stock total silos por día */}
                <div className="card p-5">
                  <h3 className="text-white font-bold text-sm mb-1">Stock Total Silos — Últimos 14 días</h3>
                  <p className="text-slate-500 text-xs mb-4">Suma de stock físico en todos los silos por día</p>
                  {histSilosDias.length === 0 ? (
                    <p className="text-slate-600 text-sm text-center py-8">Sin datos históricos aún. Los datos se acumulan cada día.</p>
                  ) : (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={histSilosDias} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                          <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v/1000)}k`} />
                          <Tooltip
                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                            formatter={(v: number) => [`${fmt(v)} t`, 'Total silos']}
                          />
                          <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Chart 2: Despacho por día */}
                <div className="card p-5">
                  <h3 className="text-white font-bold text-sm mb-1">Despacho Diario — Últimos 14 días</h3>
                  <p className="text-slate-500 text-xs mb-4">Toneladas despachadas por día</p>
                  {histDespacho.length === 0 ? (
                    <p className="text-slate-600 text-sm text-center py-8">Sin registros de despacho histórico aún.</p>
                  ) : (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={histDespacho} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                          <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                            formatter={(v: number) => [`${fmt(v)} t`, 'Despacho']}
                          />
                          <Bar dataKey="total" fill="#22c55e" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Chart 3: Materias primas por día */}
                <div className="card p-5">
                  <h3 className="text-white font-bold text-sm mb-1">Stock Materias Primas — Últimos 14 días</h3>
                  <p className="text-slate-500 text-xs mb-4">Evolución diaria de stock físico por material</p>
                  {histTolvasMat.length === 0 ? (
                    <p className="text-slate-600 text-sm text-center py-8">Sin datos históricos de materias primas aún.</p>
                  ) : (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={histTolvasMat} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                          <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v/1000)}k`} />
                          <Tooltip
                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                            formatter={(v: number) => [`${fmt(v)} t`, '']}
                          />
                          {['Clinker','Puzolana','Ceniza Volante','Yeso','Caliza'].map((m, i) => (
                            <Bar key={m} dataKey={m} stackId="a" fill={['#3b82f6','#22c55e','#f59e0b','#8b5cf6','#06b6d4'][i]} fillOpacity={0.85} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Tabla despacho histórico */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-700/50">
                    <h3 className="text-white font-bold text-sm">Registro de Despachos — Últimos 30 días</h3>
                  </div>
                  <div className="overflow-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-800/95 border-b border-slate-700/50">
                        <tr>
                          {['Fecha','Producto','Cantidad','Tipo'].map(h => (
                            <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-400 uppercase ${h==='Cantidad' ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {historiaD.slice().reverse().map((d, i) => (
                          <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/15">
                            <td className="px-4 py-3 text-blue-300 font-mono text-xs">{d.fecha}</td>
                            <td className="px-4 py-3 text-slate-200">{d.producto}</td>
                            <td className="px-4 py-3 text-white font-bold text-right">{fmt(d.cantidad_ton ?? 0)} t</td>
                            <td className="px-4 py-3 text-slate-400 text-xs">—</td>
                          </tr>
                        ))}
                        {historiaD.length === 0 && (
                          <tr><td colSpan={4} className="text-center py-10 text-slate-600">Sin despachos en los últimos 30 días</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {editSilo   && <EditSiloModal   silo={editSilo}     onClose={() => setEditSilo(null)}   onSave={saveSilo} />}
      {editTolva  && <EditTolvaModal  tolva={editTolva}   onClose={() => setEditTolva(null)}  onSave={saveTolva} />}
      {editTanque && <EditTanqueModal tanque={editTanque} onClose={() => setEditTanque(null)} onSave={saveTanque} />}
    </div>
  )
}
