import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// Create notification sound using Web Audio API
const createNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playSound = () => {
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.15);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
    };
    
    return playSound;
  } catch (error) {
    console.error('Failed to create audio context:', error);
    return () => {};
  }
};

/** Pending notifications are batched and consolidated into a single alert */
interface PendingNotification {
  senderName: string;
  messagePreview: string;
}

export function useWhatsAppNotifications() {
  const { user } = useAuth();
  const playSound = useRef<() => void>(() => {});
  const isInitialized = useRef(false);
  const [channelIds, setChannelIds] = useState<string[]>([]);

  // ── Notification batching (debounce) ────────────────────────
  const pendingNotificationsRef = useRef<PendingNotification[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const BATCH_WINDOW_MS = 1500; // Consolidate notifications within 1.5s

  const flushNotifications = useCallback(() => {
    const pending = pendingNotificationsRef.current;
    pendingNotificationsRef.current = [];
    batchTimerRef.current = null;

    if (pending.length === 0) return;

    // Play sound ONCE for the batch
    try {
      playSound.current();
    } catch (error) {
      console.error('Error playing sound:', error);
    }

    // Show a single consolidated toast
    if (pending.length === 1) {
      const n = pending[0];
      toast.message(`💬 ${n.senderName}`, {
        description: n.messagePreview,
        duration: 5000,
        action: {
          label: 'Ver',
          onClick: () => { window.location.href = '/atendimento-v2'; },
        },
      });
    } else {
      // Multiple messages: show summary
      const uniqueSenders = [...new Set(pending.map(n => n.senderName))];
      const senderSummary = uniqueSenders.length <= 3
        ? uniqueSenders.join(', ')
        : `${uniqueSenders.slice(0, 2).join(', ')} e +${uniqueSenders.length - 2}`;
      toast.message(`💬 ${pending.length} novas mensagens`, {
        description: `De: ${senderSummary}`,
        duration: 5000,
        action: {
          label: 'Ver',
          onClick: () => { window.location.href = '/atendimento-v2'; },
        },
      });
    }

    // Browser notification (single, consolidated)
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const body = pending.length === 1
          ? pending[0].messagePreview
          : `${pending.length} novas mensagens`;
        new Notification(`Nova mensagem`, {
          body,
          icon: '/favicon.ico',
          tag: 'whatsapp-message',
        });
      } catch (error) {
        console.error('Error showing browser notification:', error);
      }
    }
  }, []);

  const enqueueNotification = useCallback((notification: PendingNotification) => {
    pendingNotificationsRef.current.push(notification);
    // Reset the batch timer on each new notification
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
    }
    batchTimerRef.current = setTimeout(flushNotifications, BATCH_WINDOW_MS);
  }, [flushNotifications]);

  const initializeSound = useCallback(() => {
    if (!isInitialized.current) {
      playSound.current = createNotificationSound();
      isInitialized.current = true;
    }
  }, []);

  useEffect(() => {
    const handleInteraction = () => {
      initializeSound();
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [initializeSound]);

  useEffect(() => {
    if (!user) return;

    const fetchChannels = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.organization_id) return;

      const { data: channels } = await supabase
        .from('channels')
        .select('id')
        .eq('organization_id', profile.organization_id);

      if (channels && channels.length > 0) {
        setChannelIds(channels.map(c => c.id));
      }
    };

    fetchChannels();
  }, [user]);

  useEffect(() => {
    if (!user || channelIds.length === 0) return;

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const channelFilter = channelIds.join(',');
    const channel = supabase
      .channel(`whatsapp-notifications-${channelFilter.slice(0, 40)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `channel_id=in.(${channelFilter})`,
        },
        async (payload) => {
          const message = payload.new as {
            sender_name?: string;
            sender_phone: string;
            content?: string;
            message_type: string;
            direction: string;
            channel_id: string;
          };

          // Only notify for inbound messages
          if (message.direction !== 'inbound') return;

          // Check assignment
          try {
            const senderPhone = message.sender_phone.replace(/\D/g, '');
            const phoneSuffix = senderPhone.slice(-9);
            
            const { data: phoneAssignment } = await supabase
              .from('conversation_assignments')
              .select('assigned_to')
              .eq('channel_id', message.channel_id)
              .neq('status', 'archived')
              .or(`conversation_phone.ilike.%${phoneSuffix}%,conversation_phone.ilike.%${senderPhone}%`)
              .limit(1)
              .maybeSingle();

            if (phoneAssignment?.assigned_to && phoneAssignment.assigned_to !== user.id) {
              return;
            }
          } catch (e) {
            console.warn('[notifications] Assignment check failed, showing notification anyway:', e);
          }

          // Build notification data and enqueue (batched)
          const senderName = message.sender_name || message.sender_phone;
          const messagePreview = message.content
            ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
            : message.message_type === 'image' ? '📷 Imagem'
            : message.message_type === 'audio' ? '🎵 Áudio'
            : message.message_type === 'video' ? '🎬 Vídeo'
            : message.message_type === 'document' ? '📄 Documento'
            : 'Nova mensagem';

          enqueueNotification({ senderName, messagePreview });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, [user, channelIds, enqueueNotification]);
}

// Provider component to be used at app level
export function WhatsAppNotificationProvider({ children }: { children: React.ReactNode }) {
  useWhatsAppNotifications();
  return <>{children}</>;
}
