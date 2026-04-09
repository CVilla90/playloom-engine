import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BackroomsPublicMatchSocketServer } from "./games/backrooms-breaker-floor/src/multiplayer/server/BackroomsPublicMatchSocketServer";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

function backroomsPublicRoomPlugin(): Plugin {
  let roomServer: BackroomsPublicMatchSocketServer | null = null;

  const attach = (httpServer: Parameters<NonNullable<Plugin["configureServer"]>>[0]["httpServer"]): void => {
    if (!httpServer || roomServer) {
      return;
    }

    roomServer = new BackroomsPublicMatchSocketServer(httpServer);
    httpServer.once("close", () => {
      roomServer?.dispose();
      roomServer = null;
    });
  };

  return {
    name: "playloom-backrooms-public-room",
    configureServer(server) {
      attach(server.httpServer);
    },
    configurePreviewServer(server) {
      attach(server.httpServer);
    }
  };
}

export default defineConfig({
  plugins: [backroomsPublicRoomPlugin()],
  resolve: {
    alias: {
      "@playloom/engine-core": resolve(rootDir, "packages/engine-core/src/index.ts"),
      "@playloom/engine-input": resolve(rootDir, "packages/engine-input/src/index.ts"),
      "@playloom/engine-renderer-canvas": resolve(rootDir, "packages/engine-renderer-canvas/src/index.ts"),
      "@playloom/engine-audio": resolve(rootDir, "packages/engine-audio/src/index.ts"),
      "@playloom/engine-assets": resolve(rootDir, "packages/engine-assets/src/index.ts")
    }
  }
});
