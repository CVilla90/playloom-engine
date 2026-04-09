import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { AuthoritativePublicMatch } from "../AuthoritativePublicMatch";
import type {
  ClientMessage,
  MatchSnapshot,
  ServerMessage
} from "../protocol";
import { BACKROOMS_MATCH_SOCKET_PATH } from "../socketConstants";

interface ConnectedClient {
  readonly socket: WebSocket;
  readonly sessionId: string;
  joined: boolean;
}

function createFallbackSessionId(): string {
  return `session-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function readSessionId(request: IncomingMessage): string {
  const origin = request.headers.origin ?? "http://localhost";
  const url = new URL(request.url ?? BACKROOMS_MATCH_SOCKET_PATH, origin);
  const sessionId = url.searchParams.get("session")?.trim();
  return sessionId && sessionId.length > 0 ? sessionId : createFallbackSessionId();
}

function toJson(raw: WebSocket.RawData): ClientMessage | null {
  try {
    const text = typeof raw === "string" ? raw : raw.toString();
    return JSON.parse(text) as ClientMessage;
  } catch {
    return null;
  }
}

export interface BackroomsPublicMatchSocketServerOptions {
  readonly path?: string;
  readonly tickRateHz?: number;
  readonly snapshotRateHz?: number;
}

export class BackroomsPublicMatchSocketServer {
  private readonly httpServer: HttpServer;
  private readonly path: string;
  private readonly match = new AuthoritativePublicMatch();
  private readonly socketServer: WebSocketServer;
  private readonly clientsBySocket = new Map<WebSocket, ConnectedClient>();
  private readonly clientsBySessionId = new Map<string, ConnectedClient>();
  private readonly tickTimer: NodeJS.Timeout;
  private readonly snapshotTimer: NodeJS.Timeout;
  private lastPhase = this.match.getPhase();
  private lastBannerText: string | null = null;
  private lastResultsKey: string | null = null;
  private readonly handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const origin = request.headers.origin ?? "http://localhost";
    const url = new URL(request.url ?? "/", origin);
    if (url.pathname !== this.path) {
      return;
    }

    this.socketServer.handleUpgrade(request, socket, head, (websocket) => {
      this.socketServer.emit("connection", websocket, request);
    });
  };

  constructor(
    server: HttpServer,
    options: BackroomsPublicMatchSocketServerOptions = {}
  ) {
    this.httpServer = server;
    this.path = options.path ?? BACKROOMS_MATCH_SOCKET_PATH;
    this.socketServer = new WebSocketServer({
      noServer: true
    });
    this.socketServer.on("connection", (socket, request) => {
      this.handleConnection(socket, request);
    });
    this.httpServer.on("upgrade", this.handleUpgrade);

    const tickIntervalMs = Math.max(16, Math.floor(1000 / (options.tickRateHz ?? 60)));
    const snapshotIntervalMs = Math.max(33, Math.floor(1000 / (options.snapshotRateHz ?? 20)));
    this.tickTimer = setInterval(() => {
      this.match.tick(Date.now());
    }, tickIntervalMs);
    this.snapshotTimer = setInterval(() => {
      this.broadcastSnapshot(Date.now());
    }, snapshotIntervalMs);
  }

  dispose(): void {
    clearInterval(this.tickTimer);
    clearInterval(this.snapshotTimer);
    this.httpServer.off("upgrade", this.handleUpgrade);

    for (const client of this.clientsBySocket.values()) {
      client.socket.close();
    }

    this.clientsBySocket.clear();
    this.clientsBySessionId.clear();
    this.socketServer.close();
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const sessionId = readSessionId(request);
    const previous = this.clientsBySessionId.get(sessionId);
    if (previous) {
      this.detachClient(previous.socket, true, Date.now());
      previous.socket.close(4001, "Session replaced.");
    }

    const client: ConnectedClient = {
      socket,
      sessionId,
      joined: false
    };
    this.clientsBySocket.set(socket, client);
    this.clientsBySessionId.set(sessionId, client);

    socket.on("message", (raw) => {
      this.handleMessage(client, raw);
    });
    socket.on("close", () => {
      this.detachClient(socket, true, Date.now());
    });
    socket.on("error", () => {
      this.detachClient(socket, true, Date.now());
    });

    this.send(socket, {
      type: "snapshot",
      snapshot: this.match.getSnapshot(Date.now())
    });
  }

  private handleMessage(client: ConnectedClient, raw: WebSocket.RawData): void {
    const message = toJson(raw);
    if (!message) {
      return;
    }

    const now = Date.now();
    switch (message.type) {
      case "join_request": {
        const result = this.match.joinPlayer({
          id: client.sessionId,
          name: message.name
        }, now);
        client.joined = result.ok;
        if (!result.ok) {
          this.send(client.socket, {
            type: "join_rejected",
            reason: result.reason ?? "Could not join the public room."
          });
          return;
        }

        this.send(client.socket, {
          type: "join_accepted",
          playerId: client.sessionId,
          snapshot: this.match.getSnapshot(now)
        });
        this.broadcastSnapshot(now);
        return;
      }
      case "leave_request":
        if (client.joined) {
          client.joined = false;
          this.match.removePlayer(client.sessionId, now);
          this.broadcastSnapshot(now);
        }
        return;
      case "input_update":
        if (!client.joined) {
          return;
        }
        this.match.applyInputUpdate(client.sessionId, {
          move: message.move,
          facing: message.facing,
          flashlightOn: message.flashlightOn,
          wantsInteract: message.wantsInteract,
          wantsPunch: message.wantsPunch
        }, now);
        this.match.syncPlayerState(client.sessionId, {
          x: message.x,
          y: message.y,
          move: message.move,
          facing: message.facing,
          flashlightOn: message.flashlightOn,
          wantsInteract: message.wantsInteract,
          wantsPunch: message.wantsPunch
        }, now);
        return;
      case "interaction_request":
        if (!client.joined) {
          return;
        }
        if (message.targetKind === "pickup") {
          this.match.collectPickup(client.sessionId, message.targetId, now);
        } else if (message.targetKind === "relay") {
          this.match.collectRelay(client.sessionId, message.targetId, now);
        } else if (message.targetKind === "panel") {
          this.match.activatePanel(client.sessionId, message.targetId, now);
        } else {
          this.match.startExtraction(client.sessionId, now);
        }
        this.broadcastSnapshot(now);
        return;
      case "punch_request":
        if (!client.joined) {
          return;
        }
        const result = this.match.submitPunch(client.sessionId, message.facing, now);
        this.broadcastSnapshot(now);
        if (result.ok && result.value) {
          this.send(client.socket, {
            type: "punch_resolved",
            result: result.value
          });
        }
        return;
    }
  }

  private detachClient(socket: WebSocket, removePlayer: boolean, now: number): void {
    const client = this.clientsBySocket.get(socket);
    if (!client) {
      return;
    }

    this.clientsBySocket.delete(socket);
    const currentBySession = this.clientsBySessionId.get(client.sessionId);
    if (currentBySession === client) {
      this.clientsBySessionId.delete(client.sessionId);
    }

    if (removePlayer && client.joined) {
      client.joined = false;
      this.match.removePlayer(client.sessionId, now);
      this.broadcastSnapshot(now);
    }
  }

  private broadcastSnapshot(now: number): void {
    const snapshot = this.match.getSnapshot(now);
    this.broadcast({
      type: "snapshot",
      snapshot
    });
    this.broadcastLifecycleMessages(snapshot);
  }

  private broadcastLifecycleMessages(snapshot: MatchSnapshot): void {
    if (snapshot.phase !== this.lastPhase) {
      this.lastPhase = snapshot.phase;
      this.broadcast({
        type: "phase_changed",
        phase: snapshot.phase,
        snapshot
      });
    }

    const bannerText = snapshot.statusBanner?.text ?? null;
    if (snapshot.statusBanner && bannerText !== this.lastBannerText) {
      this.lastBannerText = bannerText;
      this.broadcast({
        type: "status_message",
        banner: snapshot.statusBanner
      });
    } else if (!snapshot.statusBanner) {
      this.lastBannerText = null;
    }

    const resultsKey = snapshot.results ? JSON.stringify(snapshot.results) : null;
    if (snapshot.results && resultsKey !== this.lastResultsKey) {
      this.lastResultsKey = resultsKey;
      this.broadcast({
        type: "round_results",
        results: snapshot.results
      });
    } else if (!snapshot.results) {
      this.lastResultsKey = null;
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clientsBySocket.values()) {
      this.send(client.socket, message);
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(message));
  }
}
