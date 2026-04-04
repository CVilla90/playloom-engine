import { FRONTIER_NAV_CONTACTS } from "./frontierNavData";

export interface OrbitCaptureBand {
  readonly id: string;
  readonly label: string;
  readonly maxSsi: number;
  readonly accent: string;
  readonly description: string;
}

export interface TravelDestinationService {
  readonly id: string;
  readonly mode: "info" | "market" | "workshop";
  readonly label: string;
  readonly tag: string;
  readonly description: string;
  readonly sender: string;
  readonly subject: string;
  readonly body: string;
  readonly statusText: string;
}

export interface TravelDestinationVisualProfile {
  readonly bodyName: string;
  readonly stationName: string;
  readonly bodyType:
    | "ringed_giant"
    | "white_dwarf"
    | "scarred_moon"
    | "anomaly"
    | "magnetar"
    | "black_hole"
    | "nebula_shell"
    | "galaxy_bridge"
    | "star_cluster"
    | "void_anchor";
  readonly approachOffsetX: number;
  readonly approachOffsetY: number;
  readonly bodyColor: string;
  readonly shadowColor: string;
  readonly glowColor: string;
  readonly detailColor: string;
  readonly accentColor: string;
  readonly stationColor: string;
  readonly stationAccent: string;
}

export interface DestinationTransmission {
  readonly sender: string;
  readonly subject: string;
  readonly body: string;
}

export interface TravelDestinationUiProfile {
  readonly orbitTitle: string;
  readonly orbitSummary: string;
  readonly orbitStatusLine: string;
  readonly orbitPromptLine: string;
}

export interface TravelDestination {
  readonly totalDistance: number;
  readonly approachDistance: number;
  readonly overshootDistance: number;
  readonly services: readonly TravelDestinationService[];
  readonly visual: TravelDestinationVisualProfile;
  readonly ui: TravelDestinationUiProfile;
  readonly comms: {
    readonly routeOpen: DestinationTransmission;
    readonly arrival: DestinationTransmission;
    readonly overshoot: DestinationTransmission;
    readonly departure: DestinationTransmission;
  };
  readonly approachBands: readonly OrbitCaptureBand[];
}

export interface NavContact {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly accent: string;
  readonly note: string;
  readonly destination?: TravelDestination;
}

const BASE_NAV_CONTACTS = [
  {
    id: "registry-beacon",
    name: "Registry Beacon",
    type: "relay",
    x: 0.18,
    y: -0.22,
    accent: "#8fe3ff",
    note: "White-dwarf registry carrier with clean charter and sync windows.",
    destination: {
      totalDistance: 5.1,
      approachDistance: 1.7,
      overshootDistance: 1.05,
      services: [
        {
          id: "registry-desk",
          mode: "info",
          label: "Registry Desk",
          tag: "records",
          description: "Pilot seals, charter filings, and route credentials live here.",
          sender: "Registrar Ione Vale",
          subject: "Registry seal in order",
          body: "Your charter and relay seal are on file. We will expose deeper registry options once the broader contract layer is online.",
          statusText: "Registry desk confirms your charter and seal."
        },
        {
          id: "provision-counter",
          mode: "market",
          label: "Provision Counter",
          tag: "trade",
          description: "A lawful supply counter with conservative margins and clean basics.",
          sender: "Registry Quartermaster",
          subject: "Counter open",
          body: "Registry stock is live. Prices stay tidy here, even if the better margins usually live farther out.",
          statusText: "Provision counter is ready for trade."
        },
        {
          id: "sync-spine",
          mode: "info",
          label: "Sync Spine",
          tag: "sync",
          description: "A high-integrity relay spine for formal registry syncs and archives.",
          sender: "Beacon Clerk Taro",
          subject: "Sync spine nominal",
          body: "Archive integrity is green. Manual sync slots still write through the ledger, but this spine will become the diegetic save point later.",
          statusText: "Registry sync spine is clean and stable."
        }
      ],
      visual: {
        bodyName: "Aster White",
        stationName: "Registry Beacon",
        bodyType: "white_dwarf",
        approachOffsetX: 74,
        approachOffsetY: 18,
        bodyColor: "#d8efff",
        shadowColor: "#547392",
        glowColor: "#f3fbff",
        detailColor: "#8fdcff",
        accentColor: "#d6fbff",
        stationColor: "#9cc7ff",
        stationAccent: "#f1f3c3"
      },
      ui: {
        orbitTitle: "ASTER WHITE // REGISTRY SPINE",
        orbitSummary: "A pale dwarf burns behind the relay spine while clerks and sync arrays hold a disciplined orbit. This is the clean records stop for charters, archives, and later contract routing.",
        orbitStatusLine: "Registry spine clear // handshake windows stable",
        orbitPromptLine: "Use the orbit panel to file records, inspect the board, or undock"
      },
      comms: {
        routeOpen: {
          sender: "Registrar Ione Vale",
          subject: "Registry vector green",
          body: "Beacon lane is open. Run the wake hard, then bleed beneath the bracket limits before you cross the spine."
        },
        arrival: {
          sender: "Registrar Ione Vale",
          subject: "Registry orbit secured",
          body: "Handshake complete. Registry services are online and the white-dwarf halo is holding steady."
        },
        overshoot: {
          sender: "Registry Traffic",
          subject: "Vector reset",
          body: "You crossed the beacon brackets too hot. We are kicking you wide for another pass. Brake earlier and catch the spine cleanly."
        },
        departure: {
          sender: "Registry Traffic",
          subject: "Departure logged",
          body: "Registry sync remains on file. Clear the beacon halo and call again when you need records."
        }
      },
      approachBands: [
        {
          id: "outer-bracket",
          label: "Outer Bracket",
          maxSsi: 350,
          accent: "#caecff",
          description: "Drop under 350 SSI before you cross the white-dwarf brackets."
        },
        {
          id: "handshake",
          label: "Handshake Arc",
          maxSsi: 210,
          accent: "#a8e7ff",
          description: "Bleed below 210 SSI to catch the registry handshake arc."
        },
        {
          id: "spine-hold",
          label: "Spine Hold",
          maxSsi: 58,
          accent: "#b9f0d1",
          description: "Settle under 58 SSI and nearly still to lock a clean sync orbit."
        }
      ]
    }
  },
  {
    id: "dust-market",
    name: "Dust Market",
    type: "station",
    x: -0.48,
    y: 0.16,
    accent: "#ffd88f",
    note: "Ring-market orbit around the giant world Khepri Dust.",
    destination: {
      totalDistance: 9.2,
      approachDistance: 2.4,
      overshootDistance: 1.5,
      services: [
        {
          id: "traffic-board",
          mode: "info",
          label: "Traffic Board",
          tag: "status",
          description: "Lane timing, berth calls, and ring halo status.",
          sender: "Dust Market Traffic",
          subject: "Traffic lane stable",
          body: "Cargo ring is clear. Market and workshop are placeholder services for now, but your orbit lane is good.",
          statusText: "Traffic board refreshed for Dust Market."
        },
        {
          id: "market-floor",
          mode: "market",
          label: "Market Floor",
          tag: "trade",
          description: "Cargo stalls and early bulk quotes from the ring market.",
          sender: "Market Clerk Mera",
          subject: "Market floor live",
          body: "The ring stalls are open. Cheap food and spice move fast here, and technical lots usually pay better somewhere else.",
          statusText: "Dust Market quotes are live."
        },
        {
          id: "ring-workshop",
          mode: "workshop",
          label: "Ring Workshop",
          tag: "fit",
          description: "Cargo retrofits and rough hold upgrades inside the inner ring.",
          sender: "Deck Tech Var",
          subject: "Cargo bay fitters ready",
          body: "Dust crews can stretch your hold right now. Engine work stays rough here, but cargo bloom retrofits are good to go.",
          statusText: "Ring Workshop is ready for cargo retrofits."
        }
      ],
      visual: {
        bodyName: "Khepri Dust",
        stationName: "Dust Market",
        bodyType: "ringed_giant",
        approachOffsetX: 118,
        approachOffsetY: 28,
        bodyColor: "#d9a861",
        shadowColor: "#5f351d",
        glowColor: "#ffd7a1",
        detailColor: "#f4d09d",
        accentColor: "#efdcb6",
        stationColor: "#9cc7ff",
        stationAccent: "#ffe9bc"
      },
      ui: {
        orbitTitle: "KHEPRI DUST // RING HALO",
        orbitSummary: "Cargo lights and half-built shops keep Khepri Dust's market halo busy before the deeper economy layer lands.",
        orbitStatusLine: "Ring lane green // traffic halo steady",
        orbitPromptLine: "Use the orbit panel to check the market ring or undock"
      },
      comms: {
        routeOpen: {
          sender: "Dust Market Traffic",
          subject: "Approach lane open",
          body: "Route is green. Ride the wake hard, then bleed into our ring bands before you reach the market halo."
        },
        arrival: {
          sender: "Dust Market Traffic",
          subject: "Orbit captured",
          body: "Clean arrival. Drift hold is green and the market halo is yours to work."
        },
        overshoot: {
          sender: "Dust Market Traffic",
          subject: "Wide loop ordered",
          body: "You came in hot. We are throwing you back to the ring edge. Bleed earlier and catch the orbit bands on the next pass."
        },
        departure: {
          sender: "Dust Market Traffic",
          subject: "Departure clear",
          body: "You are released from the ring lane. Run clean and come back when you want another market pass."
        }
      },
      approachBands: [
        {
          id: "outer",
          label: "Outer Ring",
          maxSsi: 320,
          accent: "#ffe0a8",
          description: "Bleed under 320 SSI before slipping into the ring lane."
        },
        {
          id: "inner",
          label: "Inner Lane",
          maxSsi: 180,
          accent: "#ffd08d",
          description: "Brake under 180 SSI to sit cleanly inside traffic."
        },
        {
          id: "station-keep",
          label: "Station Keep",
          maxSsi: 55,
          accent: "#b5f1d1",
          description: "Cut below 55 SSI and settle nearly still for orbit capture."
        }
      ]
    }
  },
  {
    id: "cinder-yard",
    name: "Cinder Yard",
    type: "yard",
    x: 0.54,
    y: 0.34,
    accent: "#ffae8a",
    note: "Industrial yard anchored around a scarred moon and repair gantries.",
    destination: {
      totalDistance: 6.8,
      approachDistance: 2.15,
      overshootDistance: 1.35,
      services: [
        {
          id: "yard-traffic",
          mode: "info",
          label: "Yard Traffic",
          tag: "status",
          description: "Dock queues, gantry rotation, and hull-window status for the repair yard.",
          sender: "Yardmaster Sen",
          subject: "Gantry lane clear",
          body: "Repair gantries are aligned and your lane is open. Workshop systems remain placeholders, but the yard traffic mesh is clean.",
          statusText: "Yard traffic mesh reports clear approach lanes."
        },
        {
          id: "scrap-exchange",
          mode: "market",
          label: "Scrap Exchange",
          tag: "trade",
          description: "Industrial lots, salvage trades, and yard-side bargaining built around repair traffic.",
          sender: "Broker Pell",
          subject: "Exchange bell open",
          body: "The yard exchange is moving coolant and wire cheap today. If you hauled soft goods in clean, this is where they usually pay.",
          statusText: "Scrap Exchange quotes are live."
        },
        {
          id: "workshop-bay",
          mode: "workshop",
          label: "Workshop Bay",
          tag: "fit",
          description: "Engine coils, deep-drive tuning, and the heaviest cargo retrofit work live here.",
          sender: "Forge Tech Nera",
          subject: "Workshop bay hot",
          body: "Cinder Yard is ready to fit drive hardware. If you have the credits, the bigger cores and the largest cargo bloom live here.",
          statusText: "Workshop bay is ready for hardware upgrades."
        }
      ],
      visual: {
        bodyName: "Ember Brine",
        stationName: "Cinder Yard",
        bodyType: "scarred_moon",
        approachOffsetX: -94,
        approachOffsetY: 36,
        bodyColor: "#bf7660",
        shadowColor: "#4d1f1f",
        glowColor: "#ffbf9f",
        detailColor: "#ff8c63",
        accentColor: "#f2d6a8",
        stationColor: "#c0d7f3",
        stationAccent: "#ffd7a4"
      },
      ui: {
        orbitTitle: "EMBER BRINE // CINDER YARD",
        orbitSummary: "Repair gantries orbit a scarred moon lit by ash and ember glow. This stop is the future home of upgrades, tuning, and hard-use maintenance after rough travel.",
        orbitStatusLine: "Gantry lanes hot // repair halo stable",
        orbitPromptLine: "Use the orbit panel to hail the yard, inspect the bay, or undock"
      },
      comms: {
        routeOpen: {
          sender: "Yardmaster Sen",
          subject: "Burn lane open",
          body: "Cinder Yard has a gantry lane ready. Run hot, then bleed through the ash bands before you reach the repair halo."
        },
        arrival: {
          sender: "Yardmaster Sen",
          subject: "Yard orbit secured",
          body: "You are locked over Ember Brine. The gantries have your frame in sight and the yard lane is steady."
        },
        overshoot: {
          sender: "Yardmaster Sen",
          subject: "Hot pass rejected",
          body: "You overran the gantry arc. We are throwing you back into the ash line for another setup. Brake earlier and hold the final band."
        },
        departure: {
          sender: "Yardmaster Sen",
          subject: "Departure logged",
          body: "Repair lane released. Keep your frame straight and return when you want the yard again."
        }
      },
      approachBands: [
        {
          id: "ash-line",
          label: "Ash Line",
          maxSsi: 330,
          accent: "#ffd1ba",
          description: "Drop under 330 SSI to clear the outer ash line safely."
        },
        {
          id: "gantry-arc",
          label: "Gantry Arc",
          maxSsi: 190,
          accent: "#ffbf91",
          description: "Bleed beneath 190 SSI and let the gantries bracket your hull."
        },
        {
          id: "dock-keep",
          label: "Dock Keep",
          maxSsi: 60,
          accent: "#bceccb",
          description: "Cut under 60 SSI and nearly stop to settle inside the yard halo."
        }
      ]
    }
  },
  {
    id: "null-seam",
    name: "Null Seam",
    type: "anomaly",
    x: -0.12,
    y: -0.58,
    accent: "#9af0c0",
    note: "Quiet lensing seam with a sparse anchor ring for deep exploration scans.",
    destination: {
      totalDistance: 7.6,
      approachDistance: 2.6,
      overshootDistance: 1.6,
      services: [
        {
          id: "signal-sweep",
          mode: "info",
          label: "Signal Sweep",
          tag: "scan",
          description: "A clean pass for weak anomalies, distant echoes, and future exploration leads.",
          sender: "Anchor Warden Sio",
          subject: "Sweep lattice ready",
          body: "The seam is quiet enough for a basic scan. We will route deeper exploration results and discovery rewards through this console later.",
          statusText: "Sweep lattice is staged for future exploration scans."
        },
        {
          id: "drift-exchange",
          mode: "market",
          label: "Drift Exchange",
          tag: "trade",
          description: "A sparse broker ring where seam stock and specialty cargo change hands quietly.",
          sender: "Drift Broker Hale",
          subject: "Broker ring live",
          body: "The exchange is open. Echo glass runs cheap out here, while everyday stock only clears modest margins.",
          statusText: "Drift Exchange quotes are live."
        },
        {
          id: "drift-log",
          mode: "info",
          label: "Drift Log",
          tag: "later",
          description: "A ledger for anomalies, routes, and player discoveries across the sector.",
          sender: "Seam Archive",
          subject: "Drift log scaffold",
          body: "No real discovery archive yet. When exploration expands, the seam log will hold anomalies, notes, and unlocked routes.",
          statusText: "Drift log is reserved for future discoveries."
        }
      ],
      visual: {
        bodyName: "Null Seam",
        stationName: "Anchor Ring",
        bodyType: "anomaly",
        approachOffsetX: -26,
        approachOffsetY: 20,
        bodyColor: "#10251e",
        shadowColor: "#020707",
        glowColor: "#7be2b5",
        detailColor: "#2f8f70",
        accentColor: "#b6ffd5",
        stationColor: "#97cdbd",
        stationAccent: "#d5fff0"
      },
      ui: {
        orbitTitle: "NULL SEAM // ANCHOR RING",
        orbitSummary: "A dark seam folds starlight around a sparse anchor ring. It is calm, eerie, and built for the exploration phase: scan, drift, log, and launch again.",
        orbitStatusLine: "Lensing calm // anchor ring stable",
        orbitPromptLine: "Use the orbit panel to sweep the seam, inspect the anchor, or undock"
      },
      comms: {
        routeOpen: {
          sender: "Anchor Warden Sio",
          subject: "Seam guide active",
          body: "The seam is reading quiet. Ride the wake in, then bleed through the lens bands before you touch the anchor ring."
        },
        arrival: {
          sender: "Anchor Warden Sio",
          subject: "Anchor hold secured",
          body: "Clean capture. The seam is calm and the anchor ring is holding you on a quiet exploration line."
        },
        overshoot: {
          sender: "Anchor Warden Sio",
          subject: "Seam throwback",
          body: "You crossed the lens too hot. The seam folded you wide. Set up again and bleed sooner into the final hold."
        },
        departure: {
          sender: "Anchor Warden Sio",
          subject: "Anchor released",
          body: "You are clear of the seam anchor. Keep the route in memory and return if you want another quiet drift."
        }
      },
      approachBands: [
        {
          id: "outer-lens",
          label: "Outer Lens",
          maxSsi: 305,
          accent: "#b4ffd8",
          description: "Bleed under 305 SSI before the seam starts to bend your wake."
        },
        {
          id: "anchor-line",
          label: "Anchor Line",
          maxSsi: 170,
          accent: "#8fe8bf",
          description: "Drop beneath 170 SSI to catch the anchor line cleanly."
        },
        {
          id: "quiet-hold",
          label: "Quiet Hold",
          maxSsi: 42,
          accent: "#cff8de",
          description: "Ease under 42 SSI and nearly stop to settle into the seam ring."
        }
      ]
    }
  }
] as const;

export const NAV_CONTACTS: readonly NavContact[] = [...BASE_NAV_CONTACTS, ...FRONTIER_NAV_CONTACTS];
