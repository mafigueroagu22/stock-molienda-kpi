export type Silo = {
  id: string
  fecha: string
  silo: string
  producto: string
  stock_fisico: number
  stock_sap: number
  stock_plan: number
  densidad: number
  capacidad_max: number
  observaciones: string
  updated_at: string
}

export type Tolva = {
  id: string
  fecha: string
  material: string
  stock_fisico: number
  stock_sap: number
  stock_plan: number
  densidad: number
  capacidad_max: number
  consumo_th: number
  observaciones: string
  updated_at: string
}

export type Tanque = {
  id: string
  fecha: string
  tipo: string
  nombre: string
  stock_real: number
  stock_sap: number
  unidad: string
  consumo_estimado: number
  observaciones: string
  updated_at: string
}

export type Despacho = {
  id: string
  fecha: string
  silo_origen: string
  producto: string
  cantidad_ton: number
  tipo_despacho: string
  cliente: string
  destino: string
  observaciones: string
  registrado_por: string
  created_at: string
}

export type Consumo = {
  id: string
  material: string
  consumo_th: number
  horas_dia: number
  activo: boolean
  updated_at: string
}

export type Alert = {
  type: 'critical' | 'warning' | 'info'
  msg: string
}
