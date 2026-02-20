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

export function useWhatsAppNotifications() {
  const { user } = useAuth();
  const playSound = useRef<() => void>(() => {});
  const isInitialized = useRef(false);
  // Store the user's channel IDs to filter subscriptions properly
  const [channelIds, setChannelIds] = useState<string[]>([]);

  // Initialize sound on first user interaction
  const initializeSound = useCallback(() => {
    if (!isInitialized.current) {
      playSound.current = createNotificationSound();
      isInitialized.current = true;
    }
  }, []);

  // Add click listener to initialize audio (browser policy requires user interaction)
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

  // Fetch user's channels once (to filter subscription by channel_id)
  // This prevents receiving notifications from other organizations
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
    // Only subscribe if we have the user's channels
    // This avoids a global subscription that receives ALL org messages
    if (!user || channelIds.length === 0) return;

    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Subscribe ONLY to the user's organization channels (filtered by channel_id)
    // This replaces the unfiltered global subscription that was a security risk
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
        (payload) => {
          const message = payload.new as {
            sender_name?: string;
            sender_phone: string;
            content?: string;
            message_type: string;
            direction: string;
          };

          // Only notify for inbound messages
          if (message.direction !== 'inbound') return;

          // Play notification sound
          try {
            playSound.current();
          } catch (error) {
            console.error('Error playing sound:', error);
          }

          // Show toast notification
          const senderName = message.sender_name || message.sender_phone;
          const messagePreview = message.content
            ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
            : message.message_type === 'image' ? '📷 Imagem'
            : message.message_type === 'audio' ? '🎵 Áudio'
            : message.message_type === 'video' ? '🎬 Vídeo'
            : message.message_type === 'document' ? '📄 Documento'
            : 'Nova mensagem';

          toast.message(`💬 ${senderName}`, {
            description: messagePreview,
            duration: 5000,
            action: {
              label: 'Ver',
              onClick: () => {
                window.location.href = '/whatsapp-chat';
              },
            },
          });

          // Browser notification if permitted
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`Nova mensagem de ${senderName}`, {
                body: messagePreview,
                icon: '/favicon.ico',
                tag: 'whatsapp-message',
              });
            } catch (error) {
              console.error('Error showing browser notification:', error);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, channelIds]);
}

// Provider component to be used at app level
export function WhatsAppNotificationProvider({ children }: { children: React.ReactNode }) {
  useWhatsAppNotifications();
  return <>{children}</>;
}
