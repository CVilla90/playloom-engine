import type { Server as HttpServer } from "node:http";
import { BackroomsPublicMatchSocketServer } from "./BackroomsPublicMatchSocketServer";

export function attachGameServer(server: HttpServer): BackroomsPublicMatchSocketServer {
  return new BackroomsPublicMatchSocketServer(server);
}
