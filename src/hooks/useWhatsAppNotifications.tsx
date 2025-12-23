import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// Create notification sound using Web Audio API
const createNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playSound = () => {
      // Resume audio context if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Pleasant notification sound
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
      oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1); // Higher pitch
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2); // Back to A5
      
      oscillator.type = 'sine';
      
      // Volume envelope
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
      // Remove listeners after first interaction
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

    console.log('Setting up WhatsApp notifications listener');

    // Subscribe to new inbound messages
    const channel = supabase
      .channel('whatsapp-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: 'direction=eq.inbound'
        },
        (payload) => {
          console.log('New WhatsApp message received:', payload);
          
          const message = payload.new as {
            sender_name?: string;
            sender_phone: string;
            content?: string;
            message_type: string;
          };

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
              }
            }
          });

          // Also try to show browser notification if permitted
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`Nova mensagem de ${senderName}`, {
                body: messagePreview,
                icon: '/favicon.ico',
                tag: 'whatsapp-message'
              });
            } catch (error) {
              console.error('Error showing browser notification:', error);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('WhatsApp notifications subscription status:', status);
      });

    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Browser notification permission:', permission);
      });
    }

    return () => {
      console.log('Cleaning up WhatsApp notifications listener');
      supabase.removeChannel(channel);
    };
  }, [user]);
}

// Provider component to be used at app level
export function WhatsAppNotificationProvider({ children }: { children: React.ReactNode }) {
  useWhatsAppNotifications();
  return <>{children}</>;
}
