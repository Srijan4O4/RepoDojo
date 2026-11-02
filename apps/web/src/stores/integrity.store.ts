import { create } from 'zustand';
import type { SessionEventType, LineCountBucket, SessionEventMetadata } from '@repodojo/shared';

export interface PendingTelemetryEvent {
  sessionId: string;
  assessmentId: string;
  eventType: SessionEventType;
  timestamp: string;
  metadata?: SessionEventMetadata;
}

export function determineLineBucket(lineCount?: number): LineCountBucket {
  if (!lineCount || lineCount <= 5) return '1-5';
  if (lineCount <= 15) return '6-15';
  if (lineCount <= 50) return '16-50';
  return '50+';
}

interface IntegrityState {
  sessionId: string | null;
  assessmentId: string | null;
  eventBuffer: PendingTelemetryEvent[];
  lastHiddenAt: number | null;
  isFlushing: boolean;

  // Actions
  initializeSession: (sessionId: string, assessmentId: string) => void;
  recordEvent: (eventType: SessionEventType, metadata?: SessionEventMetadata) => void;
  recordTabHidden: () => void;
  recordTabVisible: () => void;
  recordBlur: () => void;
  recordFocus: () => void;
  recordPaste: (charCount: number, lineCount: number, targetFile: string) => void;
  flushBuffer: () => Promise<void>;
  reset: () => void;
}

export const useIntegrityStore = create<IntegrityState>((set, get) => ({
  sessionId: null,
  assessmentId: null,
  eventBuffer: [],
  lastHiddenAt: null,
  isFlushing: false,

  initializeSession: (sessionId, assessmentId) => {
    set({ sessionId, assessmentId, eventBuffer: [], lastHiddenAt: null });
  },

  recordEvent: (eventType, metadata) => {
    const { sessionId, assessmentId, eventBuffer } = get();
    if (!sessionId || !assessmentId) return;

    const newEvent: PendingTelemetryEvent = {
      sessionId,
      assessmentId,
      eventType,
      timestamp: new Date().toISOString(),
      metadata,
    };

    const updatedBuffer = [...eventBuffer, newEvent];
    set({ eventBuffer: updatedBuffer });

    // Flush immediately if buffer reaches 10 items
    if (updatedBuffer.length >= 10) {
      void get().flushBuffer();
    }
  },

  recordTabHidden: () => {
    const now = Date.now();
    set({ lastHiddenAt: now });
    get().recordEvent('TAB_HIDDEN');
  },

  recordTabVisible: () => {
    const { lastHiddenAt } = get();
    const now = Date.now();
    const durationMs = lastHiddenAt ? now - lastHiddenAt : 0;
    set({ lastHiddenAt: null });
    get().recordEvent('TAB_VISIBLE', { durationMs });
  },

  recordBlur: () => {
    get().recordEvent('WINDOW_BLUR');
  },

  recordFocus: () => {
    get().recordEvent('WINDOW_FOCUS');
  },

  recordPaste: (charCount, lineCount, targetFile) => {
    get().recordEvent('PASTE_EVENT', {
      charCount,
      lineCount,
      lineCountBucket: determineLineBucket(lineCount),
      targetFile,
    });
  },

  flushBuffer: async () => {
    const { eventBuffer, isFlushing } = get();
    if (!eventBuffer.length || isFlushing) return;

    set({ isFlushing: true });
    const eventsToSend = [...eventBuffer];

    try {
      const res = await fetch('/api/integrity/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ events: eventsToSend }),
      });

      if (res.ok) {
        // Remove successfully sent events from buffer
        set((state) => ({
          eventBuffer: state.eventBuffer.slice(eventsToSend.length),
        }));
      }
    } catch {
      // In case of transient network drop, keep events in buffer for next flush
    } finally {
      set({ isFlushing: false });
    }
  },

  reset: () => {
    set({
      sessionId: null,
      assessmentId: null,
      eventBuffer: [],
      lastHiddenAt: null,
      isFlushing: false,
    });
  },
}));
