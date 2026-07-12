import type { Server as HttpServer } from "node:http";
import { WanganRaceSocketServer } from "./WanganRaceSocketServer";

export function attachGameServer(server: HttpServer): WanganRaceSocketServer {
  return new WanganRaceSocketServer(server);
}
