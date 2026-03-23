-- Índices de performance para queries rápidas
CREATE INDEX IF NOT EXISTS idx_stock_silos_fecha_silo
ON public.stock_silos (fecha DESC, silo);

CREATE INDEX IF NOT EXISTS idx_stock_tanques_fecha_tipo
ON public.stock_tanques (fecha DESC, tipo, nombre);

CREATE INDEX IF NOT EXISTS idx_stock_tolvas_fecha_material
ON public.stock_tolvas (fecha DESC, material);

CREATE INDEX IF NOT EXISTS idx_grinding_hourly_fecha_producto
ON public.grinding_hourly (fecha_hora DESC, producto);

ANALYZE public.stock_silos;
ANALYZE public.stock_tanques;
ANALYZE public.grinding_hourly;
