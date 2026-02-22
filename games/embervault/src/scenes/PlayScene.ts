import type { Scene } from "@playloom/engine-core";
import { SeededRng, circleVsCircle, clamp } from "@playloom/engine-core";
import { drawBar, drawPanel } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "../context";
import {
  BUNKER_TOP,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CHARACTERS,
  EFFORT_MAX,
  EFFORT_REGEN_PER_SEC,
  HUD_COLUMN_WIDTH,
  LAYER_HEIGHT,
  MAX_DEPTH,
  PLAYFIELD_RIGHT,
  PLAYFIELD_WIDTH,
  PLAYFIELD_X,
  REPAIR_COST,
  REPAIR_EFFORT_COST,
  RESOURCE_COLORS,
  RESOURCE_KEYS,
  UPGRADE_COSTS,
  UPGRADE_EFFORT_COST,
  WAVE_MAX_INTERVAL,
  WAVE_MIN_INTERVAL,
  layerAbsorption,
  layerMaxHp,
  meteorDamage,
  meteorSpawnCount,
  meteorSpeed,
  playerMoveSpeed
} from "../data/config";
import { isTutorialSeen, markTutorialSeen } from "../save";
import type {
  CharacterId,
  CharacterProfile,
  DebrisState,
  Inventory,
  LayerState,
  MeteorState,
  ResourceNodeState,
  RunSnapshot,
  WaveState
} from "../types";

interface PlaySceneOptions {
  characterId: CharacterId;
  snapshot?: RunSnapshot;
}

function copyInventory(input: Inventory): Inventory {
  return {
    scrap: input.scrap,
    stone: input.stone,
    metal: input.metal,
    wood: input.wood
  };
}

function hasCost(inventory: Inventory, cost: Inventory): boolean {
  return RESOURCE_KEYS.every((key) => inventory[key] >= cost[key]);
}

function spendCost(inventory: Inventory, cost: Inventory): void {
  for (const key of RESOURCE_KEYS) {
    inventory[key] -= cost[key];
  }
}

function cloneLayers(layers: LayerState[]): Array<Pick<LayerState, "maxHp" | "hp" | "absorption">> {
  return layers.map((layer) => ({
    maxHp: layer.maxHp,
    hp: layer.hp,
    absorption: layer.absorption
  }));
}

function createBaseLayers(): LayerState[] {
  return Array.from({ length: MAX_DEPTH }, (_, i) => ({
    maxHp: layerMaxHp(i),
    hp: layerMaxHp(i),
    absorption: layerAbsorption(i),
    flash: 0
  }));
}

function shortCostText(inventory: Inventory): string {
  return `S:${inventory.scrap} ST:${inventory.stone} M:${inventory.metal} W:${inventory.wood}`;
}

export class PlayScene implements Scene {
  private readonly character: CharacterProfile;
  private readonly rng: SeededRng;
  private readonly runSeed: number;

  private inventory: Inventory = {
    scrap: 10,
    stone: 10,
    metal: 8,
    wood: 9
  };

  private effortMax = EFFORT_MAX;
  private effort = EFFORT_MAX;

  private readonly layers: LayerState[] = createBaseLayers();
  private unlockedDepth = 1;

  private player = {
    x: PLAYFIELD_X + PLAYFIELD_WIDTH * 0.5,
    y: BUNKER_TOP + 28,
    radius: 14
  };

  private meteors: MeteorState[] = [];
  private debris: DebrisState[] = [];
  private resourceNodes: ResourceNodeState[] = [];
  private nearestNode: ResourceNodeState | null = null;

  private wave: WaveState = {
    index: 0,
    active: false,
    nextWaveIn: 35,
    spawnRemaining: 0,
    spawnCooldown: 0
  };

  private elapsed = 0;
  private paused = false;
  private gameOver = false;
  private autosaveTimer = 0;
  private nodeSpawnTimer = 2.2;
  private nextNodeId = 1;

  private statusText = "";
  private statusTime = 0;

  private tutorialVisible = false;
  private helpVisible = false;

  constructor(private readonly services: AppServices, private readonly options: PlaySceneOptions) {
    this.character = CHARACTERS[this.options.characterId];
    this.runSeed = options.snapshot?.runSeed ?? Math.floor(Math.random() * 0xffffffff);
    this.rng = new SeededRng(this.runSeed);

    if (options.snapshot) {
      this.applySnapshot(options.snapshot);
    } else {
      this.wave.nextWaveIn = this.services.phaseCap >= 2 ? this.rng.range(WAVE_MIN_INTERVAL, WAVE_MAX_INTERVAL) : 35;
    }

    if (this.services.phaseCap >= 4 && !isTutorialSeen()) {
      this.tutorialVisible = true;
      this.helpVisible = true;
    }
  }

  onExit(): void {
    if (this.services.phaseCap >= 3 && !this.gameOver) {
      this.services.saveRun(this.character.id, this.makeSnapshot());
    }
  }

  update(dt: number): void {
    this.handleGlobalInput();

    if (this.gameOver) {
      if (this.services.input.wasPressed("enter")) {
        this.services.restartFlow();
      }
      return;
    }

    if (this.paused) {
      if (this.services.input.wasPressed("enter")) {
        this.paused = false;
      }
      if (this.services.input.wasPressed("backspace")) {
        this.services.restartFlow();
      }
      return;
    }

    this.elapsed += dt;
    this.updateStatusTimer(dt);
    this.updateLayerFlashes(dt);
    this.regenEffort(dt);

    this.updatePlayerMovement(dt);

    if (this.services.phaseCap >= 2) {
      this.updateResourceNodes(dt);
    }

    this.handleActions();
    this.updateWaves(dt);
    this.updateMeteors(dt);
    this.updateDebris(dt);

    if (this.services.phaseCap >= 3) {
      this.autosaveTimer += dt;
      if (this.autosaveTimer >= 8) {
        this.autosaveTimer = 0;
        this.services.saveRun(this.character.id, this.makeSnapshot());
      }
    }
  }

  render(): void {
    const { renderer, assets } = this.services;

    renderer.clear("#0f1017");

    renderer.rect(0, 0, HUD_COLUMN_WIDTH, CANVAS_HEIGHT, "#131722");
    renderer.rect(CANVAS_WIDTH - HUD_COLUMN_WIDTH, 0, HUD_COLUMN_WIDTH, CANVAS_HEIGHT, "#131722");

    renderer.rect(PLAYFIELD_X, 0, PLAYFIELD_WIDTH, BUNKER_TOP - 2, "#1b1a2a");
    renderer.rect(PLAYFIELD_X, BUNKER_TOP - 2, PLAYFIELD_WIDTH, 4, "#8d6240");
    renderer.rect(PLAYFIELD_X, BUNKER_TOP + 2, PLAYFIELD_WIDTH, CANVAS_HEIGHT - BUNKER_TOP, "#171411");
    renderer.strokeRect(PLAYFIELD_X, 0, PLAYFIELD_WIDTH, CANVAS_HEIGHT, "rgba(255,255,255,0.15)", 2);

    for (let i = 0; i < this.unlockedDepth; i += 1) {
      const layer = this.layers[i];
      if (!layer) continue;
      const y = this.layerTopY(i) + 2;
      const ratio = layer.maxHp > 0 ? layer.hp / layer.maxHp : 0;
      const baseR = 52 + i * 18;
      const baseG = 41 + i * 12;
      const baseB = 34 + i * 8;
      let color = `rgb(${baseR},${baseG},${baseB})`;
      if (layer.flash > 0) {
        const pulse = Math.floor(80 * layer.flash);
        color = `rgb(${Math.min(255, baseR + pulse)},${Math.max(20, baseG - pulse / 2)},${Math.max(20, baseB - pulse / 2)})`;
      }
      if (layer.flash < 0) {
        const pulse = Math.floor(90 * -layer.flash);
        color = `rgb(${Math.max(20, baseR - pulse / 2)},${Math.min(255, baseG + pulse)},${Math.max(20, baseB - pulse / 3)})`;
      }

      renderer.rect(PLAYFIELD_X, y, PLAYFIELD_WIDTH, LAYER_HEIGHT - 2, color);
      renderer.strokeRect(PLAYFIELD_X, y, PLAYFIELD_WIDTH, LAYER_HEIGHT - 2, "rgba(0,0,0,0.33)");
      renderer.text(`Layer ${i + 1} ${Math.round(ratio * 100)}%`, PLAYFIELD_X + 12, y + 18, {
        color: "rgba(255,255,255,0.66)",
        font: "12px Trebuchet MS"
      });
    }

    for (const node of this.resourceNodes) {
      renderer.circle(node.x, node.y, 12, RESOURCE_COLORS[node.type]);
      renderer.strokeRect(node.x - 8, node.y - 8, 16, 16, "rgba(255,255,255,0.28)");
      const icon = assets.resourceIcons[node.type];
      if (icon.complete) {
        renderer.drawImage(icon, node.x - 10, node.y - 10, 20, 20);
      }
    }

    for (const meteor of this.meteors) {
      renderer.circle(meteor.x, meteor.y, meteor.radius, "#f09d57");
      renderer.circle(meteor.x + meteor.radius * 0.23, meteor.y - meteor.radius * 0.2, meteor.radius * 0.35, "#ffd7ac");
      renderer.line(meteor.x, meteor.y, meteor.x - meteor.vx * 0.06, meteor.y - meteor.vy * 0.06, "rgba(255,170,90,0.5)", 2);
    }

    for (const piece of this.debris) {
      const alpha = piece.maxLife > 0 ? piece.life / piece.maxLife : 0;
      renderer.rect(piece.x, piece.y, piece.size, piece.size, `rgba(255,196,120,${alpha.toFixed(2)})`);
    }

    const charImage = assets.characterIcons[this.character.id];
    if (charImage.complete) {
      renderer.drawImage(charImage, this.player.x - 17, this.player.y - 19, 34, 34);
    } else {
      renderer.circle(this.player.x, this.player.y, this.player.radius, "#9cd0ff");
    }

    this.renderHud();

    if (this.paused) {
      this.renderPauseOverlay();
    }
    if (this.gameOver) {
      this.renderGameOverOverlay();
    }
    if (this.services.phaseCap >= 4 && this.helpVisible) {
      this.renderTutorialOverlay();
    }
  }

  private renderHud(): void {
    const { renderer, assets } = this.services;
    const leftX = 12;
    const leftW = HUD_COLUMN_WIDTH - 24;
    const rightX = CANVAS_WIDTH - HUD_COLUMN_WIDTH + 12;
    const rightW = HUD_COLUMN_WIDTH - 24;

    if (assets.panel.complete) {
      renderer.drawImage(assets.panel, leftX, 10, leftW, 180);
      renderer.drawImage(assets.panel, leftX, 198, leftW, 180);
      renderer.drawImage(assets.panel, rightX, 10, rightW, 180);
      renderer.drawImage(assets.panel, rightX, 198, rightW, 180);
    }

    drawPanel(renderer, leftX, 10, leftW, 180, "Survival HUD");
    renderer.text(`Character: ${this.character.label}`, leftX + 12, 40, { color: "#f2e4bf", font: "14px Trebuchet MS" });
    renderer.text(`Time: ${this.elapsed.toFixed(1)}s`, leftX + 12, 61, { color: "#dfedf7", font: "14px Trebuchet MS" });
    renderer.text(`Depth: ${this.unlockedDepth}/${MAX_DEPTH}`, leftX + 12, 82, { color: "#d6ffd5", font: "14px Trebuchet MS" });
    renderer.text(`Wave: ${this.wave.index}`, leftX + 12, 103, { color: "#ffd8bf", font: "14px Trebuchet MS" });
    drawBar(renderer, leftX + 12, 116, leftW - 24, 14, this.effort, this.effortMax, "#7fd4ff");
    renderer.text(`Effort ${Math.round(this.effort)}/${this.effortMax}`, leftX + 12, 144, {
      color: "#cbecff",
      font: "13px Trebuchet MS"
    });
    if (this.wave.active) {
      renderer.text(`Wave active: ${this.wave.spawnRemaining}`, leftX + 12, 166, {
        color: "#ff9d8d",
        font: "13px Trebuchet MS"
      });
    } else {
      renderer.text(`Next wave ~${Math.ceil(this.wave.nextWaveIn)}s`, leftX + 12, 166, {
        color: "#ffd5a6",
        font: "13px Trebuchet MS"
      });
    }

    drawPanel(renderer, leftX, 198, leftW, 180, "Bunker Integrity");
    for (let i = 0; i < this.unlockedDepth; i += 1) {
      const layer = this.layers[i];
      if (!layer) continue;
      const y = 226 + i * 27;
      renderer.text(`L${i + 1}`, leftX + 12, y + 12, { color: "#f7e7bf", font: "13px Trebuchet MS" });
      drawBar(renderer, leftX + 34, y, leftW - 46, 14, layer.hp, layer.maxHp, "#de8f65");
    }

    drawPanel(renderer, rightX, 10, rightW, 180, "Inventory");
    RESOURCE_KEYS.forEach((key, idx) => {
      const y = 42 + idx * 24;
      const icon = assets.resourceIcons[key];
      if (icon.complete) {
        renderer.drawImage(icon, rightX + 12, y - 12, 18, 18);
      }
      renderer.text(`${key.toUpperCase()}: ${this.inventory[key]}`, rightX + 38, y + 1, {
        color: "#f2ecd3",
        font: "14px Trebuchet MS"
      });
    });

    drawPanel(renderer, rightX, 198, rightW, 180, "Actions");
    renderer.text("E gather (instant)", rightX + 12, 228, { color: "#d9e7f4", font: "14px Trebuchet MS" });
    renderer.text(`R repair (${REPAIR_EFFORT_COST} effort)`, rightX + 12, 250, { color: "#d9e7f4", font: "14px Trebuchet MS" });
    renderer.text(`U unlock (${UPGRADE_EFFORT_COST} effort)`, rightX + 12, 272, { color: "#d9e7f4", font: "14px Trebuchet MS" });
    renderer.text("Esc pause  Enter restart", rightX + 12, 294, { color: "#d9e7f4", font: "14px Trebuchet MS" });
    renderer.text(`Repair cost: ${shortCostText(REPAIR_COST)}`, rightX + 12, 320, { color: "#cbe9e8", font: "12px Trebuchet MS" });

    const upgradeCost = this.unlockedDepth < MAX_DEPTH ? UPGRADE_COSTS[this.unlockedDepth + 1] : undefined;
    if (upgradeCost) {
      renderer.text(`Next depth: ${shortCostText(upgradeCost)}`, rightX + 12, 342, {
        color: "#f5cfa9",
        font: "12px Trebuchet MS"
      });
    } else {
      renderer.text("Max depth unlocked", rightX + 12, 342, {
        color: "#bde2bb",
        font: "12px Trebuchet MS"
      });
    }

    if (this.nearestNode && !this.gameOver && !this.paused) {
      const cost = Math.ceil(this.nearestNode.gatherNeed);
      renderer.text(
        `Press E: +${Math.round(this.nearestNode.amount * this.character.gatherMultiplier)} ${this.nearestNode.type.toUpperCase()} (cost ${cost} effort)`,
        PLAYFIELD_X + PLAYFIELD_WIDTH / 2,
        CANVAS_HEIGHT - 18,
        { align: "center", color: "#fff1c8", font: "15px Trebuchet MS" }
      );
    }

    if (this.statusTime > 0) {
      renderer.text(this.statusText, PLAYFIELD_X + PLAYFIELD_WIDTH / 2, BUNKER_TOP - 24, {
        align: "center",
        color: "#ffe5bd",
        font: "bold 16px Trebuchet MS"
      });
    }
  }

  private renderPauseOverlay(): void {
    const { renderer } = this.services;
    renderer.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, "rgba(5,6,9,0.66)");
    drawPanel(renderer, CANVAS_WIDTH / 2 - 230, 190, 460, 150, "Paused");
    renderer.text("Enter: Resume", CANVAS_WIDTH / 2 - 160, 244, { color: "#f3e7c8", font: "20px Trebuchet MS" });
    renderer.text("Backspace: Restart", CANVAS_WIDTH / 2 - 160, 276, { color: "#f3e7c8", font: "20px Trebuchet MS" });
    renderer.text("H: Toggle help", CANVAS_WIDTH / 2 - 160, 308, { color: "#d6e7f8", font: "17px Trebuchet MS" });
  }

  private renderGameOverOverlay(): void {
    const { renderer } = this.services;
    renderer.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, "rgba(21,8,8,0.72)");
    drawPanel(renderer, CANVAS_WIDTH / 2 - 260, 180, 520, 180, "Run Failed");
    renderer.text("Direct meteor impact. Immediate fatality.", CANVAS_WIDTH / 2, 245, {
      align: "center",
      color: "#ffbcb2",
      font: "22px Trebuchet MS"
    });
    renderer.text(`Survival time: ${this.elapsed.toFixed(1)}s`, CANVAS_WIDTH / 2, 278, {
      align: "center",
      color: "#f6e3bf",
      font: "20px Trebuchet MS"
    });
    renderer.text("Press Enter to restart", CANVAS_WIDTH / 2, 314, {
      align: "center",
      color: "#d7ebfa",
      font: "19px Trebuchet MS"
    });
  }

  private renderTutorialOverlay(): void {
    const { renderer } = this.services;
    drawPanel(renderer, CANVAS_WIDTH / 2 - 290, 64, 580, 182, "First-run Guide");
    renderer.text("Gathering is instant now: press E near a node.", CANVAS_WIDTH / 2 - 272, 98, {
      color: "#efe4c5",
      font: "15px Trebuchet MS"
    });
    renderer.text("Each action consumes effort; effort recharges quickly.", CANVAS_WIDTH / 2 - 272, 120, {
      color: "#efe4c5",
      font: "15px Trebuchet MS"
    });
    renderer.text("Destroyed layers no longer block meteors. Keep repairing.", CANVAS_WIDTH / 2 - 272, 142, {
      color: "#efe4c5",
      font: "15px Trebuchet MS"
    });
    renderer.text("Meteor waves strike every 30-90 seconds and scale up.", CANVAS_WIDTH / 2 - 272, 164, {
      color: "#ffd7c4",
      font: "15px Trebuchet MS"
    });
    renderer.text("Press H to hide help. Press Enter once to dismiss forever.", CANVAS_WIDTH / 2 - 272, 194, {
      color: "#cde7fb",
      font: "15px Trebuchet MS"
    });
  }

  private handleGlobalInput(): void {
    const { input } = this.services;
    if (input.wasPressed("escape", "p") && !this.gameOver) {
      this.paused = !this.paused;
    }

    if (this.services.phaseCap >= 4 && input.wasPressed("h")) {
      this.helpVisible = !this.helpVisible;
    }

    if (this.services.phaseCap >= 4 && this.tutorialVisible && input.wasPressed("enter")) {
      this.tutorialVisible = false;
      markTutorialSeen();
    }
  }

  private handleActions(): void {
    const { input } = this.services;

    if (this.services.phaseCap >= 2 && input.wasPressed("e")) {
      this.tryGatherNearest();
    }

    if (this.services.phaseCap >= 2 && input.wasPressed("r")) {
      this.tryRepair();
    }

    if (this.services.phaseCap >= 3 && input.wasPressed("u")) {
      this.tryUpgradeDepth();
    }
  }

  private updatePlayerMovement(dt: number): void {
    const { input } = this.services;
    let dx = 0;
    let dy = 0;

    if (input.isDown("a", "arrowleft")) dx -= 1;
    if (input.isDown("d", "arrowright")) dx += 1;
    if (input.isDown("w", "arrowup")) dy -= 1;
    if (input.isDown("s", "arrowdown")) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const mag = Math.hypot(dx, dy);
      dx /= mag;
      dy /= mag;
    }

    const speed = playerMoveSpeed(this.character);
    this.player.x += dx * speed * dt;
    this.player.y += dy * speed * dt;

    this.player.x = clamp(this.player.x, PLAYFIELD_X + 20, PLAYFIELD_RIGHT - 20);

    const maxY = BUNKER_TOP + this.unlockedDepth * LAYER_HEIGHT - 18;
    const minY = BUNKER_TOP + 14;
    this.player.y = clamp(this.player.y, minY, maxY);
  }

  private updateResourceNodes(dt: number): void {
    this.nearestNode = null;

    this.nodeSpawnTimer -= dt;
    if (!this.wave.active && this.nodeSpawnTimer <= 0 && this.resourceNodes.length < 8) {
      this.spawnResourceNode();
      this.nodeSpawnTimer = this.rng.range(2.7, 5.4);
    }

    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of this.resourceNodes) {
      const dist = Math.hypot(node.x - this.player.x, node.y - this.player.y);
      if (dist < 34 && dist < bestDistance) {
        bestDistance = dist;
        this.nearestNode = node;
      }
    }
  }

  private tryGatherNearest(): void {
    if (!this.nearestNode) {
      this.setStatus("No resource node in reach.");
      return;
    }

    const effortCost = Math.ceil(this.nearestNode.gatherNeed);
    if (!this.consumeEffort(effortCost)) {
      this.setStatus(`Need ${effortCost} effort to gather.`);
      return;
    }

    const gain = Math.max(1, Math.round(this.nearestNode.amount * this.character.gatherMultiplier));
    const resourceType = this.nearestNode.type;
    this.inventory[resourceType] += gain;
    this.resourceNodes = this.resourceNodes.filter((node) => node.id !== this.nearestNode?.id);
    this.nearestNode = null;
    this.setStatus(`+${gain} ${resourceType}`, 0.9);
    this.services.audio.beep(670, 0.05, "sine");
  }

  private spawnResourceNode(): void {
    const type = this.rng.pick(RESOURCE_KEYS);
    const x = this.rng.range(PLAYFIELD_X + 30, PLAYFIELD_RIGHT - 30);
    const y = this.rng.range(BUNKER_TOP + 18, BUNKER_TOP + this.unlockedDepth * LAYER_HEIGHT - 16);

    this.resourceNodes.push({
      id: this.nextNodeId,
      type,
      x,
      y,
      amount: this.rng.int(3, 8),
      gatherNeed: this.rng.int(10, 24),
      gatherProgress: 0
    });

    this.nextNodeId += 1;
  }

  private updateWaves(dt: number): void {
    if (!this.wave.active) {
      this.wave.nextWaveIn -= dt;
      if (this.wave.nextWaveIn <= 0) {
        this.startWave();
      }
      return;
    }

    if (this.wave.spawnRemaining > 0) {
      this.wave.spawnCooldown -= dt;
      if (this.wave.spawnCooldown <= 0) {
        this.spawnMeteor();
        this.wave.spawnRemaining -= 1;
        const cadenceDrop = this.services.phaseCap >= 3 ? this.wave.index * 0.011 : this.wave.index * 0.003;
        this.wave.spawnCooldown = Math.max(0.08, this.rng.range(0.2, 0.58) - cadenceDrop);
      }
    } else if (this.meteors.length === 0) {
      this.wave.active = false;
      this.wave.nextWaveIn = this.services.phaseCap >= 2 ? this.rng.range(WAVE_MIN_INTERVAL, WAVE_MAX_INTERVAL) : 35;
      this.setStatus("Wave ended. Gather and repair.");
    }
  }

  private startWave(): void {
    this.wave.active = true;
    this.wave.index += 1;
    this.wave.spawnRemaining = meteorSpawnCount(this.wave.index, this.services.phaseCap);
    this.wave.spawnCooldown = 0.12;
    this.setStatus(`Meteor wave ${this.wave.index} incoming!`);
    this.services.audio.whoosh();
  }

  private spawnMeteor(): void {
    const radius = this.rng.range(8.5, 19 + this.wave.index * 0.15);
    const speed = meteorSpeed(this.wave.index, this.services.phaseCap) + this.rng.range(-26, 42);
    const meteor: MeteorState = {
      x: this.rng.range(PLAYFIELD_X + 20, PLAYFIELD_RIGHT - 20),
      y: -24 - this.rng.range(0, 120),
      vx: this.rng.range(-40, 40),
      vy: speed,
      radius,
      damage: meteorDamage(this.wave.index, this.services.phaseCap, radius)
    };
    this.meteors.push(meteor);

    if (this.services.phaseCap >= 4 && this.rng.chance(0.22)) {
      this.services.audio.whoosh();
    }
  }

  private updateMeteors(dt: number): void {
    for (let i = this.meteors.length - 1; i >= 0; i -= 1) {
      const meteor = this.meteors[i];
      if (!meteor) continue;

      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.vy += 35 * dt;

      if (circleVsCircle({ x: meteor.x, y: meteor.y, r: meteor.radius }, { x: this.player.x, y: this.player.y, r: this.player.radius })) {
        this.triggerGameOver();
        return;
      }

      const topIntactLayer = this.getTopIntactLayerIndex();
      if (topIntactLayer >= 0) {
        const impactY = this.layerTopY(topIntactLayer);
        if (meteor.y + meteor.radius >= impactY) {
          this.applyImpact(meteor.damage, meteor.x, impactY, topIntactLayer);
          this.meteors.splice(i, 1);
          continue;
        }
      }

      if (meteor.y > CANVAS_HEIGHT + 60) {
        this.meteors.splice(i, 1);
      }
    }
  }

  private applyImpact(damage: number, x: number, y: number, startLayerIndex: number): void {
    let remaining = damage;

    for (let i = startLayerIndex; i < this.unlockedDepth && remaining > 0; i += 1) {
      const layer = this.layers[i];
      if (!layer || layer.hp <= 0) continue;

      const toLayer = Math.max(2, remaining * (1 - layer.absorption));
      layer.hp -= toLayer;
      layer.flash = Math.max(layer.flash, 0.52);

      if (layer.hp > 0) {
        remaining = 0;
        break;
      }

      const overflow = -layer.hp;
      layer.hp = 0;
      remaining = overflow * 0.72;
    }

    this.spawnDebris(x, y, 11);
    this.services.audio.impact();

    if (remaining > 6 && this.getTopIntactLayerIndex() >= 0) {
      this.setStatus("Bunker strain rising.");
    }
    if (this.getTopIntactLayerIndex() === -1) {
      this.setStatus("All layers breached. Meteors can hit you directly.", 1.2);
    }
  }

  private spawnDebris(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.debris.push({
        x,
        y,
        vx: this.rng.range(-90, 90),
        vy: this.rng.range(-120, -25),
        life: this.rng.range(0.3, 0.8),
        maxLife: 0.8,
        size: this.rng.range(2, 4)
      });
    }
  }

  private updateDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i -= 1) {
      const particle = this.debris[i];
      if (!particle) continue;

      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 200 * dt;

      if (particle.life <= 0) {
        this.debris.splice(i, 1);
      }
    }
  }

  private tryRepair(): void {
    if (!this.consumeEffort(REPAIR_EFFORT_COST, false)) {
      this.setStatus(`Need ${REPAIR_EFFORT_COST} effort to repair.`);
      return;
    }

    if (!hasCost(this.inventory, REPAIR_COST)) {
      this.setStatus("Missing resources for repair.");
      return;
    }

    let target: LayerState | null = null;
    let weakestRatio = Number.POSITIVE_INFINITY;

    for (let i = 0; i < this.unlockedDepth; i += 1) {
      const layer = this.layers[i];
      if (!layer || layer.hp >= layer.maxHp) continue;
      const ratio = layer.hp / layer.maxHp;
      if (ratio < weakestRatio) {
        weakestRatio = ratio;
        target = layer;
      }
    }

    if (!target) {
      this.setStatus("Bunker already stable.");
      return;
    }

    this.consumeEffort(REPAIR_EFFORT_COST);
    spendCost(this.inventory, REPAIR_COST);

    const repairAmount = 22 * this.character.repairMultiplier;
    target.hp = Math.min(target.maxHp, target.hp + repairAmount);
    target.flash = Math.min(target.flash, -0.5);

    this.setStatus(`Repair +${Math.round(repairAmount)} HP`);
    this.services.audio.repair();
  }

  private tryUpgradeDepth(): void {
    if (!this.consumeEffort(UPGRADE_EFFORT_COST, false)) {
      this.setStatus(`Need ${UPGRADE_EFFORT_COST} effort to unlock depth.`);
      return;
    }

    if (this.unlockedDepth >= MAX_DEPTH) {
      this.setStatus("Maximum bunker depth reached.");
      return;
    }

    const nextDepth = this.unlockedDepth + 1;
    const cost = UPGRADE_COSTS[nextDepth];
    if (!cost) return;

    if (!hasCost(this.inventory, cost)) {
      this.setStatus("Not enough resources for depth unlock.");
      return;
    }

    this.consumeEffort(UPGRADE_EFFORT_COST);
    spendCost(this.inventory, cost);
    this.unlockedDepth = nextDepth;
    this.setStatus(`Depth level ${nextDepth} unlocked.`);
    this.services.audio.beep(760, 0.09, "triangle");
  }

  private updateLayerFlashes(dt: number): void {
    for (const layer of this.layers) {
      if (layer.flash > 0) {
        layer.flash = Math.max(0, layer.flash - dt * 2.3);
      } else if (layer.flash < 0) {
        layer.flash = Math.min(0, layer.flash + dt * 2.3);
      }
    }
  }

  private updateStatusTimer(dt: number): void {
    if (this.statusTime <= 0) return;
    this.statusTime = Math.max(0, this.statusTime - dt);
  }

  private setStatus(text: string, lifetime = 1.6): void {
    this.statusText = text;
    this.statusTime = lifetime;
  }

  private triggerGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.paused = false;
    this.services.audio.gameOver();
  }

  private layerTopY(index: number): number {
    return BUNKER_TOP + index * LAYER_HEIGHT;
  }

  private getTopIntactLayerIndex(): number {
    for (let i = 0; i < this.unlockedDepth; i += 1) {
      const layer = this.layers[i];
      if (layer && layer.hp > 0) return i;
    }
    return -1;
  }

  private regenEffort(dt: number): void {
    this.effort = Math.min(this.effortMax, this.effort + EFFORT_REGEN_PER_SEC * dt);
  }

  private consumeEffort(cost: number, mutate = true): boolean {
    if (this.effort < cost) return false;
    if (mutate) {
      this.effort -= cost;
    }
    return true;
  }

  private makeSnapshot(): RunSnapshot {
    return {
      runSeed: this.runSeed,
      rngState: this.rng.getState(),
      elapsed: this.elapsed,
      effort: this.effort,
      effortMax: this.effortMax,
      inventory: copyInventory(this.inventory),
      unlockedDepth: this.unlockedDepth,
      layers: cloneLayers(this.layers),
      player: {
        x: this.player.x,
        y: this.player.y,
        radius: this.player.radius
      },
      meteors: this.meteors.map((meteor) => ({ ...meteor })),
      debris: this.debris.map((piece) => ({ ...piece })),
      resourceNodes: this.resourceNodes.map((node) => ({ ...node, gatherProgress: 0 })),
      wave: {
        index: this.wave.index,
        active: this.wave.active,
        nextWaveIn: this.wave.nextWaveIn,
        spawnRemaining: this.wave.spawnRemaining,
        spawnCooldown: this.wave.spawnCooldown
      }
    };
  }

  private applySnapshot(snapshot: RunSnapshot): void {
    this.rng.setState(snapshot.rngState);

    this.elapsed = snapshot.elapsed;
    this.effortMax = snapshot.effortMax ?? EFFORT_MAX;
    this.effort = clamp(snapshot.effort ?? this.effortMax, 0, this.effortMax);
    this.inventory = copyInventory(snapshot.inventory);

    if (this.services.phaseCap >= 3) {
      this.unlockedDepth = clamp(snapshot.unlockedDepth, 1, MAX_DEPTH);
    }

    const layerCount = Math.min(snapshot.layers.length, this.layers.length);
    for (let i = 0; i < layerCount; i += 1) {
      const src = snapshot.layers[i];
      const layer = this.layers[i];
      if (!src || !layer) continue;
      layer.maxHp = src.maxHp;
      layer.hp = clamp(src.hp, 0, src.maxHp);
      layer.absorption = src.absorption;
      layer.flash = 0;
    }

    this.player.x = clamp(snapshot.player.x, PLAYFIELD_X + 20, PLAYFIELD_RIGHT - 20);
    this.player.y = snapshot.player.y;
    this.player.radius = snapshot.player.radius;

    this.meteors = snapshot.meteors.map((meteor) => ({ ...meteor }));
    this.debris = snapshot.debris.map((piece) => ({ ...piece }));
    this.resourceNodes = snapshot.resourceNodes.map((node) => ({
      ...node,
      gatherNeed: Math.max(1, Math.ceil(node.gatherNeed)),
      gatherProgress: 0
    }));

    this.wave = {
      index: snapshot.wave.index,
      active: snapshot.wave.active,
      nextWaveIn: snapshot.wave.nextWaveIn,
      spawnRemaining: snapshot.wave.spawnRemaining,
      spawnCooldown: snapshot.wave.spawnCooldown
    };

    this.nextNodeId =
      this.resourceNodes.reduce((maxId, node) => {
        return Math.max(maxId, node.id);
      }, 0) + 1;
  }
}
