// useForceReload
// Escuta um broadcast Supabase Realtime no canal `app-updates` (event `force-reload`)
// e força limpeza de cache + reload em TODOS os clientes online.
//
// Payload esperado: { version: string, reason?: string, hard?: boolean }
// - Se a versão recebida for diferente da última aplicada (localStorage), aplica.
// - Se hard=true, limpa caches/SW; sempre preserva a sessão Supabase.

import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'app:last_force_reload_version';

async function clearCachesAndReload(hard: boolean) {
  try {
    if (hard) {
      // CacheStorage (SW caches)
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // localStorage exceto auth do Supabase
      const auth: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('supabase.auth') || k === STORAGE_KEY)) {
          auth[k] = localStorage.getItem(k) || '';
        }
      }
      localStorage.clear();
      Object.entries(auth).forEach(([k, v]) => localStorage.setItem(k, v));
      sessionStorage.clear();

      // Service workers
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    }
  } catch (err) {
    console.error('[force-reload] cleanup error', err);
  } finally {
    window.location.reload();
  }
}

export function useForceReload() {
  useEffect(() => {
    const channel = supabase.channel('app-updates', {
      config: { broadcast: { self: false, ack: false } },
    });

    channel.on('broadcast', { event: 'force-reload' }, (msg) => {
      const payload = (msg?.payload || {}) as {
        version?: string;
        reason?: string;
        hard?: boolean;
      };
      const incoming = String(payload.version || '');
      if (!incoming) return;

      const last = localStorage.getItem(STORAGE_KEY);
      if (last === incoming) return; // já aplicado neste cliente

      localStorage.setItem(STORAGE_KEY, incoming);
      console.warn('[force-reload] aplicando atualização', payload);
      // Pequeno atraso para o setItem persistir
      setTimeout(() => clearCachesAndReload(payload.hard !== false), 150);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
