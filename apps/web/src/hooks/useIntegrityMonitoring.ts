import { useEffect } from 'react';
import { useIntegrityStore } from '../stores/integrity.store.js';

export function useIntegrityMonitoring(sessionId: string | null, assessmentId: string | null) {
  useEffect(() => {
    if (!sessionId || !assessmentId) return;

    const store = useIntegrityStore.getState();
    store.initializeSession(sessionId, assessmentId);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        useIntegrityStore.getState().recordTabHidden();
      } else {
        useIntegrityStore.getState().recordTabVisible();
      }
    };

    const handleBlur = () => {
      useIntegrityStore.getState().recordBlur();
    };

    const handleFocus = () => {
      useIntegrityStore.getState().recordFocus();
    };

    const handleBeforeUnload = () => {
      const { eventBuffer } = useIntegrityStore.getState();
      if (eventBuffer.length > 0 && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ events: eventBuffer })], {
          type: 'application/json',
        });
        navigator.sendBeacon('/api/integrity/events', blob);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Periodic flush interval every 5 seconds
    const interval = setInterval(() => {
      void useIntegrityStore.getState().flushBuffer();
    }, 5000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(interval);
      void useIntegrityStore.getState().flushBuffer();
    };
  }, [sessionId, assessmentId]);
}
