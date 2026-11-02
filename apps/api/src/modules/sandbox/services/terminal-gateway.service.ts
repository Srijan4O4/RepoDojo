export interface TerminalSession {
  sessionId: string;
  cols: number;
  rows: number;
  replayBuffer: string[]; // Bounded circular buffer
  maxBufferBytes: number;
  currentBufferBytes: number;
  isActive: boolean;
}

export class TerminalGatewayService {
  private static sessions = new Map<string, TerminalSession>();
  private static readonly MAX_BUFFER_BYTES = 100 * 1024; // 100 KB circular buffer (Decision 6.2)

  /**
   * Initializes or reconnects to an interactive terminal session.
   */
  public static getOrCreateSession(sessionId: string): TerminalSession {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        sessionId,
        cols: 80,
        rows: 24,
        replayBuffer: [
          `\x1b[32mRepoDojo Interactive Terminal v0.4\x1b[0m\r\n`,
          `\x1b[90mSession: ${sessionId}\x1b[0m\r\n`,
          `\x1b[90mConnected to container bridge: 172.28.1.10\x1b[0m\r\n`,
          `node@repodojo-sandbox:/workspace$ `,
        ],
        maxBufferBytes: this.MAX_BUFFER_BYTES,
        currentBufferBytes: 150,
        isActive: true,
      };
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  /**
   * Appends output to replay buffer, trimming old lines if buffer exceeds limit.
   */
  public static appendOutput(sessionId: string, data: string): void {
    const session = this.getOrCreateSession(sessionId);
    session.replayBuffer.push(data);
    session.currentBufferBytes += Buffer.byteLength(data, 'utf8');

    // Trim circular buffer if exceeding 100 KB
    while (session.currentBufferBytes > session.maxBufferBytes && session.replayBuffer.length > 1) {
      const removed = session.replayBuffer.shift();
      if (removed) {
        session.currentBufferBytes -= Buffer.byteLength(removed, 'utf8');
      }
    }
  }

  /**
   * Returns current buffer for client replay upon reconnection.
   */
  public static getReplayOutput(sessionId: string): string {
    const session = this.getOrCreateSession(sessionId);
    return session.replayBuffer.join('');
  }

  /**
   * Updates terminal dimensions upon resize event.
   */
  public static resizeTerminal(sessionId: string, cols: number, rows: number): void {
    const session = this.getOrCreateSession(sessionId);
    session.cols = cols;
    session.rows = rows;
  }

  /**
   * Terminates session on assessment finish.
   */
  public static closeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
