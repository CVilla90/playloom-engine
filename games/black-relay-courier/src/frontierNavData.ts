import type { NavContact } from "./navData";

export const FRONTIER_NAV_CONTACTS = [
  {
    id: "helix-crown",
    name: "Helix Crown",
    type: "magnetar",
    x: 0.08,
    y: -0.92,
    accent: "#8fc6ff",
    note: "Polar crown station skimming a violent magnetar and its aurora arcs.",
    destination: {
      totalDistance: 20.2,
      approachDistance: 3.6,
      overshootDistance: 2.2,
      services: [
        {
          id: "field-exchange",
          mode: "market",
          label: "Field Exchange",
          tag: "trade",
          description: "Charged coolant, magnet coils, and dangerous specialty lots move through the crown fast.",
          sender: "Exchange Factor Lio",
          subject: "Polar exchange live",
          body: "Coolant and coil lots are moving hot today. If you brought clean instruments or rare glass, the crown will pay for them.",
          statusText: "Field Exchange quotes are live."
        },
        {
          id: "aurora-lab",
          mode: "info",
          label: "Aurora Lab",
          tag: "science",
          description: "Magnetar sweep timings, field noise, and beam diagnostics for pilots who like living.",
          sender: "Dr. Kessa Rho",
          subject: "Beam lattice stable",
          body: "The crown is riding a tame sweep window for once. We are logging charged curtains and a clean polar hiss.",
          statusText: "Aurora Lab pushes a fresh crown-field report."
        },
        {
          id: "coil-gallery",
          mode: "workshop",
          label: "Coil Gallery",
          tag: "fit",
          description: "High-stress engine balancing and crown-rated relay tuning for serious courier frames.",
          sender: "Forge Pilot Rane",
          subject: "Coil gallery hot",
          body: "We balance hot drives here, not gentle ones. If your frame can take it, the crown can push your engine farther.",
          statusText: "Coil Gallery is ready for engine work."
        }
      ],
      visual: {
        bodyName: "Helix Crown",
        stationName: "Polar Crown",
        bodyType: "magnetar",
        approachOffsetX: 42,
        approachOffsetY: 6,
        bodyColor: "#8fc0ff",
        shadowColor: "#0b1224",
        glowColor: "#d8eeff",
        detailColor: "#7be0ff",
        accentColor: "#d5f2ff",
        stationColor: "#b9dcff",
        stationAccent: "#fff0ad"
      },
      ui: {
        orbitTitle: "HELIX CROWN // POLAR ORBIT",
        orbitSummary: "A crown station hangs beside a magnetar while electric ribbons walk the dark. It feels brilliant, technical, and one mistake away from lethal.",
        orbitStatusLine: "Beam sweep green // crown lattice steady",
        orbitPromptLine: "Use the orbit panel to trade, inspect the lab, or undock"
      },
      comms: {
        routeOpen: {
          sender: "Crown Traffic",
          subject: "Polar lane open",
          body: "Helix Crown is holding a clean sweep gap. Run hard, then bleed under the field brackets before the aurora closes."
        },
        arrival: {
          sender: "Crown Traffic",
          subject: "Polar hold secured",
          body: "You are inside the crown and the beam wash is behind you. Exchange, lab, and gallery are live."
        },
        overshoot: {
          sender: "Crown Traffic",
          subject: "Sweep missed",
          body: "You crossed the crown too hot. We are looping you beyond the field skin for another pass. Brake earlier into the beam arc."
        },
        departure: {
          sender: "Crown Traffic",
          subject: "Crown departure clear",
          body: "Polar hold released. Keep clear of the beam sweep and call again on your next crown run."
        }
      },
      approachBands: [
        {
          id: "field-skin",
          label: "Field Skin",
          maxSsi: 340,
          accent: "#cce7ff",
          description: "Drop under 340 SSI before the crown field starts to rake your wake."
        },
        {
          id: "beam-arc",
          label: "Beam Arc",
          maxSsi: 205,
          accent: "#a4ebff",
          description: "Bleed beneath 205 SSI to catch a clean beam arc into polar traffic."
        },
        {
          id: "polar-hold",
          label: "Polar Hold",
          maxSsi: 52,
          accent: "#c9f5d6",
          description: "Settle under 52 SSI and nearly still to lock the crown safely."
        }
      ]
    }
  },
  {
    id: "glass-maw",
    name: "Glass Maw",
    type: "gravity well",
    x: 0.94,
    y: -0.06,
    accent: "#c4b6ff",
    note: "Photon-ring harbor built on the rim of a black well and its lens scars.",
    destination: {
      totalDistance: 20.5,
      approachDistance: 3.9,
      overshootDistance: 2.4,
      services: [
        {
          id: "lens-bourse",
          mode: "market",
          label: "Lens Bourse",
          tag: "trade",
          description: "Optics, echo glass, and quietly illegal data lots move through the Maw under bent starlight.",
          sender: "Broker Vale Senn",
          subject: "Lens market live",
          body: "Glass and sensor stock are cheap by the ring today. If you brought luxury cargo, the Maw usually pays for the risk.",
          statusText: "Lens Bourse quotes are live."
        },
        {
          id: "well-control",
          mode: "info",
          label: "Well Control",
          tag: "traffic",
          description: "Vector control, lensing forecasts, and survival notices for anyone flirting with the photon ring.",
          sender: "Well Control",
          subject: "Lensing forecast stable",
          body: "The ring is bright and the lens scars are shallow enough for traffic. Do not trust that to last.",
          statusText: "Well Control pushes a fresh lensing forecast."
        },
        {
          id: "eventide-stack",
          mode: "info",
          label: "Eventide Stack",
          tag: "archive",
          description: "A dark archive of folded telemetry, court-sealed debris logs, and redacted deep-route records.",
          sender: "Archivist Nox",
          subject: "Stack receiving",
          body: "The Eventide Stack is taking lens logs and void telemetry. The expensive files stay sealed, but the stack is listening.",
          statusText: "Eventide Stack opens a telemetry intake window."
        }
      ],
      visual: {
        bodyName: "Glass Maw",
        stationName: "Photon Ring",
        bodyType: "black_hole",
        approachOffsetX: -12,
        approachOffsetY: 8,
        bodyColor: "#0b0716",
        shadowColor: "#020207",
        glowColor: "#d9d0ff",
        detailColor: "#8bd7ff",
        accentColor: "#c9bbff",
        stationColor: "#b8d0ff",
        stationAccent: "#f8dcff"
      },
      ui: {
        orbitTitle: "GLASS MAW // PHOTON RING",
        orbitSummary: "A black well erases the center of the sky while a harbor clings to the light-bent rim. Everything here feels expensive, unstable, and slightly forbidden.",
        orbitStatusLine: "Photon ring bright // lens scars readable",
        orbitPromptLine: "Use the orbit panel to trade, inspect control, or undock"
      },
      comms: {
        routeOpen: {
          sender: "Well Control",
          subject: "Maw corridor open",
          body: "The Maw is readable for now. Keep the lens scars under control and do not cross the ring too hot."
        },
        arrival: {
          sender: "Well Control",
          subject: "Ring hold secured",
          body: "Photon ring has your frame. Bourse and telemetry stack are live while the well stays quiet."
        },
        overshoot: {
          sender: "Well Control",
          subject: "Lensing reset",
          body: "You overran the ring brackets and the well folded your line wide. Reset and bleed sooner into the final hold."
        },
        departure: {
          sender: "Well Control",
          subject: "Ring release logged",
          body: "You are clear of the photon ring. Watch the lens scars on the way out and come back only if you mean it."
        }
      },
      approachBands: [
        {
          id: "lens-wall",
          label: "Lens Wall",
          maxSsi: 360,
          accent: "#daccff",
          description: "Bleed under 360 SSI before the photon ring starts to fold your vector."
        },
        {
          id: "scar-band",
          label: "Scar Band",
          maxSsi: 220,
          accent: "#b4d6ff",
          description: "Drop beneath 220 SSI and ride the lens scar inward without tearing wide."
        },
        {
          id: "ring-hold",
          label: "Ring Hold",
          maxSsi: 56,
          accent: "#edd6ff",
          description: "Ease under 56 SSI and nearly stop to settle beside the photon ring."
        }
      ]
    }
  },
  {
    id: "bloom-ossuary",
    name: "Bloom Ossuary",
    type: "nebula",
    x: -0.04,
    y: 0.92,
    accent: "#ff9fc6",
    note: "Shrine docks and harvest petals suspended inside a dead star's flowering shell.",
    destination: {
      totalDistance: 20,
      approachDistance: 4.1,
      overshootDistance: 2.5,
      services: [
        {
          id: "petal-exchange",
          mode: "market",
          label: "Petal Exchange",
          tag: "trade",
          description: "Perfumed resins, sealed gas lots, and shrine cargo move slowly but profitably through the bloom.",
          sender: "Exchange Sister Oren",
          subject: "Petal market open",
          body: "Resin and ceremonial stock are running cheap through the shell. Fine glass and rare components still command a premium here.",
          statusText: "Petal Exchange quotes are live."
        },
        {
          id: "ossuary-cloister",
          mode: "info",
          label: "Ossuary Cloister",
          tag: "records",
          description: "Quiet monks, shell charts, and memorial route logs kept under rose nebula light.",
          sender: "Canon Ila Voss",
          subject: "Cloister open",
          body: "The shell is calm and the cloister is receiving route notes. Pilots come here when they want silence to mean something.",
          statusText: "Ossuary Cloister opens its memorial logs."
        },
        {
          id: "bloom-rig",
          mode: "workshop",
          label: "Bloom Rig",
          tag: "fit",
          description: "Petal harvest rigs and spacious ceremonial cargo retrofits built for slow, careful freight.",
          sender: "Rigger Tal Morn",
          subject: "Bloom rig ready",
          body: "We stretch holds, not tempers. If you want more room without leaving the shell, the bloom rig can do it.",
          statusText: "Bloom Rig is ready for cargo upgrades."
        }
      ],
      visual: {
        bodyName: "Bloom Ossuary",
        stationName: "Petal Ring",
        bodyType: "nebula_shell",
        approachOffsetX: 16,
        approachOffsetY: 22,
        bodyColor: "#a33f67",
        shadowColor: "#2d0a18",
        glowColor: "#ffc3da",
        detailColor: "#ff8db9",
        accentColor: "#ffd4ea",
        stationColor: "#f2d7ff",
        stationAccent: "#fff1bd"
      },
      ui: {
        orbitTitle: "BLOOM OSSUARY // PETAL RING",
        orbitSummary: "A dead star's shell flowers across the sky while shrine docks drift between gas petals. It is beautiful, mournful, and almost perfectly still.",
        orbitStatusLine: "Shell petals steady // shrine ring quiet",
        orbitPromptLine: "Use the orbit panel to trade, inspect the cloister, or undock"
      },
      comms: {
        routeOpen: {
          sender: "Petal Traffic",
          subject: "Shell lane open",
          body: "The bloom is calm. Ride the shell edge in and bleed beneath the petal brackets before you touch the ring."
        },
        arrival: {
          sender: "Petal Traffic",
          subject: "Petal hold secured",
          body: "You are nested inside the shell and the shrine ring has your frame. Exchange, cloister, and rig are live."
        },
        overshoot: {
          sender: "Petal Traffic",
          subject: "Shell throwback",
          body: "You crossed the bloom too hot and tore past the ring. We are widening your line for another patient pass."
        },
        departure: {
          sender: "Petal Traffic",
          subject: "Shell departure logged",
          body: "Petal hold released. Keep your wake soft on the way out and return when you need the shell again."
        }
      },
      approachBands: [
        {
          id: "petal-edge",
          label: "Petal Edge",
          maxSsi: 330,
          accent: "#ffd1e5",
          description: "Drop under 330 SSI before the outer petals start to buffet your wake."
        },
        {
          id: "choir-lane",
          label: "Choir Lane",
          maxSsi: 190,
          accent: "#ffbad7",
          description: "Bleed beneath 190 SSI and slip into the shrine lane cleanly."
        },
        {
          id: "hush-hold",
          label: "Hush Hold",
          maxSsi: 48,
          accent: "#d9f4dd",
          description: "Settle under 48 SSI and nearly still to hold quietly in the bloom."
        }
      ]
    }
  },
  {
    id: "tidal-choir",
    name: "Tidal Choir",
    type: "bridge",
    x: -0.96,
    y: 0.04,
    accent: "#ffd8a8",
    note: "A station in the tidal light bridge of two warped galactic masses.",
    destination: {
      totalDistance: 20.6,
      approachDistance: 4,
      overshootDistance: 2.4,
      services: [
        {
          id: "span-market",
          mode: "market",
          label: "Span Market",
          tag: "trade",
          description: "Old-light luxuries, preserved food, and bridgework salvage pass through the Choir with patient margins.",
          sender: "Broker Sael",
          subject: "Span market live",
          body: "The bridge is bright and the market is taking fragrant cargo fast. Technical lots usually clear better elsewhere.",
          statusText: "Span Market quotes are live."
        },
        {
          id: "choral-office",
          mode: "info",
          label: "Choral Office",
          tag: "records",
          description: "Bridge timings, old route hymns, and careful office notices under ancient light.",
          sender: "Office Warden Mire",
          subject: "Bridge office open",
          body: "Tidal Choir keeps long memory. The light bridge is calm enough for traffic and the office has no objection to your presence.",
          statusText: "Choral Office updates the bridge ledger."
        },
        {
          id: "cantor-deck",
          mode: "info",
          label: "Cantor Deck",
          tag: "view",
          description: "A panoramic deck built for watching two bent galaxies hold each other across the dark.",
          sender: "Cantor Deck",
          subject: "Observation deck clear",
          body: "The deck is open and the bridge is singing properly tonight. There are worse places to waste a few minutes of a long run.",
          statusText: "Cantor Deck opens a clear view across the bridge."
        }
      ],
      visual: {
        bodyName: "Tidal Choir",
        stationName: "Bridge Spire",
        bodyType: "galaxy_bridge",
        approachOffsetX: -34,
        approachOffsetY: 18,
        bodyColor: "#f1c37b",
        shadowColor: "#2a1607",
        glowColor: "#ffe7b8",
        detailColor: "#ffd59a",
        accentColor: "#fff0cc",
        stationColor: "#e6d4ff",
        stationAccent: "#fff3c3"
      },
      ui: {
        orbitTitle: "TIDAL CHOIR // BRIDGE SPIRE",
        orbitSummary: "Two distant galactic bodies pull a river of old light between them while a spire station hangs inside the glow. The scale feels impossible and calm.",
        orbitStatusLine: "Bridge lane clear // old-light chorus steady",
        orbitPromptLine: "Use the orbit panel to trade, inspect the office, or undock"
      },
      comms: {
        routeOpen: {
          sender: "Choral Office",
          subject: "Bridge lane green",
          body: "Tidal Choir is holding a quiet bridge. Burn in, then bleed cleanly under the old-light brackets before you reach the spire."
        },
        arrival: {
          sender: "Choral Office",
          subject: "Choir hold secured",
          body: "Bridge Spire has your frame and the old-light river is steady. Market and office are open."
        },
        overshoot: {
          sender: "Choral Office",
          subject: "Bridge pass missed",
          body: "You overran the bridge brackets. We are widening your line along the light stream for another, slower pass."
        },
        departure: {
          sender: "Choral Office",
          subject: "Bridge departure clear",
          body: "Spire hold released. Keep the bridge on your flank and return when you need old-light company again."
        }
      },
      approachBands: [
        {
          id: "span-edge",
          label: "Span Edge",
          maxSsi: 350,
          accent: "#ffe2b8",
          description: "Drop under 350 SSI before the bridge glare starts to wash your vector."
        },
        {
          id: "choir-band",
          label: "Choir Band",
          maxSsi: 210,
          accent: "#ffd4a1",
          description: "Bleed beneath 210 SSI to settle inside the old-light lane."
        },
        {
          id: "spire-hold",
          label: "Spire Hold",
          maxSsi: 58,
          accent: "#def3d0",
          description: "Settle under 58 SSI and nearly stop to hold against Bridge Spire."
        }
      ]
    }
  },
  {
    id: "lantern-vault",
    name: "Lantern Vault",
    type: "archive",
    x: 0.72,
    y: -0.76,
    accent: "#ffe18a",
    note: "Deep archive suspended in an old globular cluster and its lantern swarm.",
    destination: {
      totalDistance: 22.7,
      approachDistance: 4.4,
      overshootDistance: 2.7,
      services: [
        {
          id: "vault-exchange",
          mode: "market",
          label: "Vault Exchange",
          tag: "trade",
          description: "Old archive lots, precision tools, and preserved luxury stock move through the cluster slowly and dearly.",
          sender: "Factor Ell",
          subject: "Vault exchange live",
          body: "Precision stock is moving and the lantern brokers are willing to pay for clean specialty lots. Cheap bulk is not their favorite language.",
          statusText: "Vault Exchange quotes are live."
        },
        {
          id: "archive-spine",
          mode: "info",
          label: "Archive Spine",
          tag: "records",
          description: "Old courier records, sealed route histories, and cluster memory stacked into a deep relay spine.",
          sender: "Archivist Chane",
          subject: "Archive spine open",
          body: "Lantern Vault keeps too much history and not enough daylight. If you bring clean route data, the spine will remember it.",
          statusText: "Archive Spine accepts route telemetry."
        },
        {
          id: "precision-bay",
          mode: "workshop",
          label: "Precision Bay",
          tag: "fit",
          description: "Measured engine balancing and archive-grade cargo fitting under very old supervision.",
          sender: "Baymaster Olin",
          subject: "Precision bay ready",
          body: "We do not work fast here. We work exactly once. If you need a careful fit, the bay is open.",
          statusText: "Precision Bay is ready for controlled refits."
        }
      ],
      visual: {
        bodyName: "Lantern Vault",
        stationName: "Archive Crown",
        bodyType: "star_cluster",
        approachOffsetX: 58,
        approachOffsetY: 14,
        bodyColor: "#f1d98b",
        shadowColor: "#2d2206",
        glowColor: "#fff2c5",
        detailColor: "#ffe3a3",
        accentColor: "#fff4d3",
        stationColor: "#d9e3ff",
        stationAccent: "#fff0b0"
      },
      ui: {
        orbitTitle: "LANTERN VAULT // ARCHIVE CROWN",
        orbitSummary: "A crown station sits inside a dense swarm of ancient stars. The light feels old, expensive, and impossibly patient.",
        orbitStatusLine: "Lantern swarm bright // archive crown steady",
        orbitPromptLine: "Use the orbit panel to trade, inspect the spine, or undock"
      },
      comms: {
        routeOpen: {
          sender: "Archive Crown",
          subject: "Lantern lane open",
          body: "Lantern Vault is readable. Burn through the old swarm, then bleed beneath the crown bands before you cross the archive line."
        },
        arrival: {
          sender: "Archive Crown",
          subject: "Lantern hold secured",
          body: "Archive Crown has your frame. Exchange, spine, and precision bay are live under the lantern swarm."
        },
        overshoot: {
          sender: "Archive Crown",
          subject: "Lantern reset",
          body: "You crossed the crown too hot and the archive line widened you out. Reset and take a slower lantern pass."
        },
        departure: {
          sender: "Archive Crown",
          subject: "Lantern departure logged",
          body: "Archive hold released. Leave the old swarm cleanly and come back when you want the vault again."
        }
      },
      approachBands: [
        {
          id: "swarm-edge",
          label: "Swarm Edge",
          maxSsi: 355,
          accent: "#ffe6ba",
          description: "Drop under 355 SSI before the lantern swarm starts to stack around your frame."
        },
        {
          id: "archive-line",
          label: "Archive Line",
          maxSsi: 215,
          accent: "#ffe3a0",
          description: "Bleed beneath 215 SSI to catch the archive line into crown traffic."
        },
        {
          id: "crown-hold",
          label: "Crown Hold",
          maxSsi: 58,
          accent: "#dff4cf",
          description: "Settle under 58 SSI and nearly still to lock the archive crown."
        }
      ]
    }
  },
  {
    id: "mute-reach",
    name: "Mute Reach",
    type: "void",
    x: 0.86,
    y: 0.88,
    accent: "#98a6b8",
    note: "An almost starless void marked by a skeletal anchor and too much empty dark.",
    destination: {
      totalDistance: 28.8,
      approachDistance: 4.8,
      overshootDistance: 3.1,
      services: [
        {
          id: "last-marker",
          mode: "info",
          label: "Last Marker",
          tag: "marker",
          description: "A skeletal beacon repeating old route numbers into an empty sector edge.",
          sender: "Last Marker",
          subject: "Marker repeating",
          body: "No active port. No active market. Last Marker is still broadcasting the old sector edge code and nothing else worth trusting.",
          statusText: "Last Marker repeats a dead route code."
        },
        {
          id: "quiet-rack",
          mode: "info",
          label: "Quiet Rack",
          tag: "scan",
          description: "A silent instrument rack for reading how much of the sky has simply gone away.",
          sender: "Quiet Rack",
          subject: "Signal floor low",
          body: "Background noise is minimal. Light loss is high. There is very little here and that is the entire problem.",
          statusText: "Quiet Rack logs an unnaturally low signal floor."
        }
      ],
      visual: {
        bodyName: "Mute Reach",
        stationName: "Last Marker",
        bodyType: "void_anchor",
        approachOffsetX: -18,
        approachOffsetY: 10,
        bodyColor: "#090d13",
        shadowColor: "#010203",
        glowColor: "#9db0c5",
        detailColor: "#405161",
        accentColor: "#cad6e2",
        stationColor: "#b8c7d8",
        stationAccent: "#eef3f8"
      },
      ui: {
        orbitTitle: "MUTE REACH // LAST MARKER",
        orbitSummary: "A skeletal marker hangs in a volume of space that refuses spectacle. The stars thin out, the color drains away, and the silence starts to feel intentional.",
        orbitStatusLine: "Signal floor low // anchor code repeating",
        orbitPromptLine: "Use the orbit panel to inspect the marker, log the quiet, or undock"
      },
      comms: {
        routeOpen: {
          sender: "Last Marker",
          subject: "Marker line active",
          body: "Mute Reach is still there, if that helps. Burn in, bleed early, and do not expect the dark to look back."
        },
        arrival: {
          sender: "Last Marker",
          subject: "Marker hold secured",
          body: "You are holding beside Last Marker. The void is stable in the way empty things usually are."
        },
        overshoot: {
          sender: "Last Marker",
          subject: "Marker reacquire",
          body: "You passed the marker too hot and the dark gave you nothing to grab. Reset and take a slower line into the hold."
        },
        departure: {
          sender: "Last Marker",
          subject: "Marker departure logged",
          body: "You are clear of Last Marker. The void will still be here when you decide to regret coming back."
        }
      },
      approachBands: [
        {
          id: "quiet-edge",
          label: "Quiet Edge",
          maxSsi: 300,
          accent: "#c4d1de",
          description: "Bleed under 300 SSI before the marker disappears into the dark again."
        },
        {
          id: "marker-line",
          label: "Marker Line",
          maxSsi: 160,
          accent: "#b4c3d3",
          description: "Drop beneath 160 SSI to keep the skeletal anchor readable."
        },
        {
          id: "dead-hold",
          label: "Dead Hold",
          maxSsi: 36,
          accent: "#dde6ee",
          description: "Ease under 36 SSI and nearly stop to lock beside the marker."
        }
      ]
    }
  }
] satisfies readonly NavContact[];
