'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClientComponentClient();

export function useSilos(fecha: string) {
  return useQuery({
    queryKey: ['silos', fecha],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_silos')
        .select('*')
        .eq('fecha', fecha)
        .order('silo');
      if (error) throw error;
      return data;
    },
    enabled: !!fecha && fecha.length === 10,
  });
}

export function useUpdateSilo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { data, error } = await supabase
        .from('stock_silos')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['silos', data.fecha] });
    },
  });
}

export function useSafeFormat() {
  const fmtDec = (val: any, decimals = 1): string => {
    if (val === null || val === undefined || val === '') return '0.0';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '0.0';
    return num.toFixed(decimals);
  };

  return { fmtDec };
}
