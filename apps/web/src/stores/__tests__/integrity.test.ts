import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useIntegrityStore, determineLineBucket } from '../integrity.store.js';

describe('Domain 15: Client-side Integrity Store & Telemetry Buffering', () => {
  beforeEach(() => {
    useIntegrityStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('should categorize line count into privacy-safe buckets', () => {
    expect(determineLineBucket(2)).toBe('1-5');
    expect(determineLineBucket(10)).toBe('6-15');
    expect(determineLineBucket(30)).toBe('16-50');
    expect(determineLineBucket(75)).toBe('50+');
  });

  it('should initialize session metadata and buffer events', () => {
    const store = useIntegrityStore.getState();
    store.initializeSession('sess-100', 'challenge-node-01');

    store.recordEvent('WINDOW_FOCUS');

    const state = useIntegrityStore.getState();
    expect(state.sessionId).toBe('sess-100');
    expect(state.assessmentId).toBe('challenge-node-01');
    expect(state.eventBuffer.length).toBe(1);
    expect(state.eventBuffer[0].eventType).toBe('WINDOW_FOCUS');
    expect(state.eventBuffer[0].sessionId).toBe('sess-100');
  });

  it('should track tab hidden and visible durations', () => {
    const store = useIntegrityStore.getState();
    store.initializeSession('sess-101', 'challenge-node-01');

    // Simulate tab hidden
    const now = Date.now();
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 4500);

    store.recordTabHidden();
    expect(useIntegrityStore.getState().eventBuffer.length).toBe(1);
    expect(useIntegrityStore.getState().eventBuffer[0].eventType).toBe('TAB_HIDDEN');

    // Simulate tab visible 4.5s later
    store.recordTabVisible();
    const state = useIntegrityStore.getState();
    expect(state.eventBuffer.length).toBe(2);
    expect(state.eventBuffer[1].eventType).toBe('TAB_VISIBLE');
    expect(state.eventBuffer[1].metadata?.durationMs).toBe(4500);
  });

  it('should record paste events with line buckets and char counts without storing raw text', () => {
    const store = useIntegrityStore.getState();
    store.initializeSession('sess-102', 'challenge-node-01');

    store.recordPaste(1200, 42, 'src/services/auth.ts');

    const state = useIntegrityStore.getState();
    expect(state.eventBuffer.length).toBe(1);
    const pasteEvent = state.eventBuffer[0];
    expect(pasteEvent.eventType).toBe('PASTE_EVENT');
    expect(pasteEvent.metadata?.charCount).toBe(1200);
    expect(pasteEvent.metadata?.lineCount).toBe(42);
    expect(pasteEvent.metadata?.lineCountBucket).toBe('16-50');
    expect(pasteEvent.metadata?.targetFile).toBe('src/services/auth.ts');
    // Ensure no raw text field exists
    expect((pasteEvent.metadata as any)?.text).toBeUndefined();
    expect((pasteEvent.metadata as any)?.clipboard).toBeUndefined();
  });

  it('should flush buffered events to /api/integrity/events', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success' }),
    });
    global.fetch = mockFetch;

    const store = useIntegrityStore.getState();
    store.initializeSession('sess-103', 'challenge-node-01');

    store.recordBlur();
    store.recordFocus();

    expect(useIntegrityStore.getState().eventBuffer.length).toBe(2);

    await useIntegrityStore.getState().flushBuffer();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrity/events',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    expect(useIntegrityStore.getState().eventBuffer.length).toBe(0);
  });
});
