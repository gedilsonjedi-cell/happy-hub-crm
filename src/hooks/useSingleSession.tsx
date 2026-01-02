import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Generate a unique session token for this browser tab/session
const generateSessionToken = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
};

// Get or create session token for this browser session
const getSessionToken = () => {
  const storageKey = 'optimus_session_token';
  let token = sessionStorage.getItem(storageKey);
  
  if (!token) {
    token = generateSessionToken();
    sessionStorage.setItem(storageKey, token);
  }
  
  return token;
};

export const useSingleSession = (
  userId: string | undefined,
  onSessionInvalid: () => void
) => {
  const sessionToken = useRef<string>(getSessionToken());
  const isRegistering = useRef(false);
  const hasRegistered = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Register this session when user logs in
  const registerSession = useCallback(async () => {
    if (!userId || isRegistering.current || hasRegistered.current) return;
    
    isRegistering.current = true;
    
    try {
      // Get device info
      const deviceInfo = `${navigator.userAgent.substring(0, 100)}`;
      
      const { error } = await supabase.rpc('register_user_session', {
        _session_token: sessionToken.current,
        _device_info: deviceInfo,
        _ip_address: null // Could be fetched from an API if needed
      });
      
      if (error) {
        console.error('Error registering session:', error);
      } else {
        hasRegistered.current = true;
        console.log('Session registered successfully');
      }
    } catch (err) {
      console.error('Error registering session:', err);
    } finally {
      isRegistering.current = false;
    }
  }, [userId]);

  // Validate that current session is still active
  const validateSession = useCallback(async () => {
    if (!userId || !hasRegistered.current) return true;
    
    try {
      const { data, error } = await supabase.rpc('validate_user_session', {
        _session_token: sessionToken.current
      });
      
      if (error) {
        console.error('Error validating session:', error);
        return true; // Don't logout on error, just continue
      }
      
      if (data === false) {
        // Session is invalid - another device logged in
        toast.error("Sua sessão foi encerrada pois você acessou de outro dispositivo.", {
          duration: 5000
        });
        onSessionInvalid();
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('Error validating session:', err);
      return true;
    }
  }, [userId, onSessionInvalid]);

  // Update last activity
  const updateActivity = useCallback(async () => {
    if (!userId || !hasRegistered.current) return;
    
    try {
      await supabase.rpc('update_session_activity');
    } catch (err) {
      console.error('Error updating session activity:', err);
    }
  }, [userId]);

  // Register session when userId becomes available
  useEffect(() => {
    if (userId) {
      registerSession();
    } else {
      hasRegistered.current = false;
    }
  }, [userId, registerSession]);

  // Set up periodic session validation (every 30 seconds)
  useEffect(() => {
    if (!userId) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    // Initial validation after a short delay
    const initialCheck = setTimeout(() => {
      validateSession();
    }, 5000);

    // Periodic validation
    checkIntervalRef.current = setInterval(() => {
      validateSession();
      updateActivity();
    }, 30000); // Check every 30 seconds

    return () => {
      clearTimeout(initialCheck);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [userId, validateSession, updateActivity]);

  // Listen for visibility changes to validate session when user returns to tab
  useEffect(() => {
    if (!userId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        validateSession();
        updateActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, validateSession, updateActivity]);

  return {
    sessionToken: sessionToken.current,
    registerSession,
    validateSession
  };
};
