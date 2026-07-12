import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { AuthoritativeRaceSession } from "../AuthoritativeRaceSession";
import type { RaceClientMessage, RaceServerMessage } from "../protocol";
import { WANGAN_SESSION_SOCKET_PATH } from "../socketConstants";

interface ConnectedClient {
  readonly socket: WebSocket;
  readonly sessionId: string;
  joined: boolean;
}

function fallbackSessionId(): string {
  return `wangan-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function requestSessionId(request: IncomingMessage): string {
  const url = new URL(request.url ?? WANGAN_SESSION_SOCKET_PATH, request.headers.origin ?? "http://localhost");
  const requested = url.searchParams.get("session")?.trim();
  return requested && requested.length <= 128 ? requested : fallbackSessionId();
}

function parseMessage(raw: WebSocket.RawData): RaceClientMessage | null {
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString()) as { type?: unknown };
    if (parsed.type === "join_request" || parsed.type === "leave_request" || parsed.type === "race_input") {
      return parsed as RaceClientMessage;
    }
  } catch {
    // Invalid client payloads are ignored and never reach the simulation.
  }
  return null;
}

export interface WanganRaceSocketServerOptions {
  readonly path?: string;
  readonly tickRateHz?: number;
  readonly snapshotRateHz?: number;
}

export class WanganRaceSocketServer {
  private readonly path: string;
  private readonly match = new AuthoritativeRaceSession();
  private readonly socketServer = new WebSocketServer({ noServer: true });
  private readonly clientsBySocket = new Map<WebSocket, ConnectedClient>();
  private readonly clientsBySession = new Map<string, ConnectedClient>();
  private readonly tickTimer: NodeJS.Timeout;
  private readonly snapshotTimer: NodeJS.Timeout;
  private readonly handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(request.url ?? "/", request.headers.origin ?? "http://localhost");
    if (url.pathname !== this.path) {
      return;
    }
    this.socketServer.handleUpgrade(request, socket, head, (websocket) => {
      this.socketServer.emit("connection", websocket, request);
    });
  };

  constructor(
    private readonly httpServer: HttpServer,
    options: WanganRaceSocketServerOptions = {}
  ) {
    this.path = options.path ?? WANGAN_SESSION_SOCKET_PATH;
    this.socketServer.on("connection", (socket, request) => this.handleConnection(socket, request));
    this.httpServer.on("upgrade", this.handleUpgrade);

    const tickInterval = Math.max(16, Math.floor(1000 / (options.tickRateHz ?? 60)));
    const snapshotInterval = Math.max(33, Math.floor(1000 / (options.snapshotRateHz ?? 20)));
    this.tickTimer = setInterval(() => this.match.tick(Date.now()), tickInterval);
    this.snapshotTimer = setInterval(() => this.broadcastSnapshot(), snapshotInterval);
  }

  dispose(): void {
    clearInterval(this.tickTimer);
    clearInterval(this.snapshotTimer);
    this.httpServer.off("upgrade", this.handleUpgrade);
    for (const client of this.clientsBySocket.values()) {
      client.socket.close();
    }
    this.clientsBySocket.clear();
    this.clientsBySession.clear();
    this.socketServer.close();
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const sessionId = requestSessionId(request);
    const previous = this.clientsBySession.get(sessionId);
    if (previous) {
      this.detach(previous.socket, false);
      previous.socket.close(4001, "Session replaced by a newer connection.");
    }

    const client: ConnectedClient = { socket, sessionId, joined: false };
    this.clientsBySocket.set(socket, client);
    this.clientsBySession.set(sessionId, client);
    socket.on("message", (raw) => this.handleMessage(client, raw));
    socket.on("close", () => this.detach(socket, true));
    socket.on("error", () => this.detach(socket, true));
    this.send(socket, { type: "session_state", snapshot: this.match.getSnapshot() });
  }

  private handleMessage(client: ConnectedClient, raw: WebSocket.RawData): void {
    const message = parseMessage(raw);
    if (!message) {
      return;
    }
    if (message.type === "join_request") {
      const result = this.match.joinPlayer(client.sessionId, message.profile);
      client.joined = result.ok;
      if (!result.ok) {
        this.send(client.socket, { type: "join_rejected", reason: result.reason ?? "Could not join the session." });
        return;
      }
      this.send(client.socket, {
        type: "join_accepted",
        playerId: client.sessionId,
        snapshot: this.match.getSnapshot()
      });
      this.broadcastSnapshot();
      return;
    }
    if (message.type === "leave_request") {
      if (client.joined) {
        client.joined = false;
        this.match.removePlayer(client.sessionId);
        this.broadcastSnapshot();
      }
      return;
    }
    if (client.joined) {
      this.match.applyInput(client.sessionId, message);
    }
  }

  private detach(socket: WebSocket, removePlayer: boolean): void {
    const client = this.clientsBySocket.get(socket);
    if (!client) {
      return;
    }
    this.clientsBySocket.delete(socket);
    if (this.clientsBySession.get(client.sessionId) === client) {
      this.clientsBySession.delete(client.sessionId);
    }
    if (removePlayer && client.joined) {
      client.joined = false;
      this.match.removePlayer(client.sessionId);
      this.broadcastSnapshot();
    }
  }

  private broadcastSnapshot(): void {
    const message: RaceServerMessage = { type: "session_state", snapshot: this.match.getSnapshot() };
    for (const client of this.clientsBySocket.values()) {
      this.send(client.socket, message);
    }
  }

  private send(socket: WebSocket, message: RaceServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}
