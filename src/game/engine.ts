// Game loop, physics, interactions and rendering for the mushroom sidescroller.
import { appleTreeGeom, drawAppleTree, drawBeetle, drawBeetleKing, drawFish, drawFlyer, drawHouse, drawLine, drawMushroomPerson, drawShellHouse, drawSnail, drawSword, fillCircle, rect } from "./sprites";
import { FISH, addFish, fishById, releaseReward, removeFish, resolveBite, rollFish, rollWait, type FishSpecies, type Inventory } from "./fishing";
import { sfx } from "./sfx";
import { eatApple, eatGlowcap, isDead, nap, takeDamage, tickVitals, type Vitals } from "./vitals";
import { ATTACK_COOLDOWN, ATTACK_TIME, BEETLE_DAMAGE, BOSS_DAMAGE, FLYER_DAMAGE, attackHits, damageFlyer, jumpsAllowed, sectionCleared, stepFlyer, type Flyer } from "./combat";
import {
  PIT_Y,
  ceilAt,
  createDungeon,
  drawDoorway,
  drawDungeonBack,
  drawDungeonFloor,
  drawDungeonLights,
  drawGate,
  drawGlowcap,
  drawShrine,
  floorAt,
  type Dungeon,
} from "./dungeon";
import { SAVE_VERSION, type SaveData } from "./save";
import { FLOOR_BOTTOM, ROOM_SPAWN, atDoor, createRoom, drawRoom, moveInRoom, nearbyFurn, type Room, type RoomPlayer } from "./interior";
import {
  GROUND_BASE,
  LAKE_EDGE,
  LAKE_MIN_X,
  LAKE_Y,
  PIER_X0,
  WORLD_W,
  generateWorld,
  hash1,
  mulberry32,
  surfaceY,
  type Beetle,
  type GiantTree,
  type House,
  type Npc,
  type Platform,
  type Puddle,
  type Village,
  type World,
} from "./world";

export const VIEW_H = 225;
const ACCEL = 520;
const FRICTION = 620;
const MAX_SPEED = 64;
const GRAVITY = 640;
const JUMP_V = 220;
const APPLE_REGROW = 25;
const DAY_LENGTH = 240;
const START_X = 960;
const RELEASE_TIME = 3.6;
const ROOM_SPEED = 46;
const FADE = 0.5;
/** Damage for falling into the dungeon's spike pit. */
const PIT_DAMAGE = 15;
const SHOCKWAVE_DAMAGE = 14;

export type Key = "left" | "right" | "up" | "down" | "jump" | "act" | "attack";
export type Scene = "forest" | "dungeon" | "room";

interface Level {
  w: number;
  ground: Int16Array;
  platforms: Platform[];
  beetles: Beetle[];
  flyers: Flyer[];
  ceil?: Int16Array;
}

interface Shockwave {
  x: number;
  dir: number;
  t: number;
}

export interface HudState {
  health: number;
  hunger: number;
  found: number;
  total: number;
  prompt: string | null;
  dialog: { name: string; text: string; page: number; pages: number } | null;
  banner: { title: string; sub: string } | null;
  dead: boolean;
  timeOfDay: string;
  compass: { name: string; dir: -1 | 1; steps: number; high: boolean } | null;
  resting: boolean;
  starving: boolean;
  applesEaten: number;
  fishing: "wait" | "bite" | null;
  releasing: boolean;
  toast: string | null;
  inventory: { id: string; name: string; count: number }[];
  fishCaught: number;
  fishReleased: number;
  coins: number;
  coinPop: { amount: number; id: number } | null;
  scene: Scene;
  doubleJump: boolean;
  boss: { hp: number; max: number } | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
  kind: "leaf" | "spark" | "smoke" | "heart" | "firefly" | "dust" | "bit" | "ripple" | "star";
  phase: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: number;
  walkT: number;
  invuln: number;
  coyote: number;
  jumpBuf: number;
  plat: Platform | null;
  blinkT: number;
  dropT: number;
}

const LEAF_COLORS = ["#c98a2e", "#a8642a", "#7fae45", "#d9b04a", "#8c4a22"];
const FUNGUS = [
  ["#e2a64a", "#a86a28", "#f6d58a"],
  ["#e9e1cc", "#b5a78c", "#fff8ea"],
  ["#c0623a", "#83391f", "#e8926a"],
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class Game {
  W = 400;
  readonly H = VIEW_H;
  private ctx: CanvasRenderingContext2D;
  private world!: World;
  private forestLvl!: Level;
  private lvl!: Level;
  private scene: Scene = "forest";
  private dungeon: Dungeon | null = null;
  private room: Room | null = null;
  private rp: RoomPlayer = { x: 0, y: 0, facing: "up", walkT: 0, moving: false };
  private returnPos = { x: 0, y: 0 };
  private p!: Player;
  private vitals!: Vitals;
  private keys: Record<Key, boolean> = { left: false, right: false, up: false, down: false, jump: false, act: false, attack: false };
  private pressed = new Set<Key>();
  private camX = 0;
  private camY = 0;
  private time = 0;
  private particles: Particle[] = [];
  private talking: { npc: Npc | null; name: string; lines: string[]; idx: number } | null = null;
  private banner: { title: string; sub: string; t: number } | null = null;
  private running = false;
  private dead = false;
  private raf = 0;
  private last = 0;
  private hudT = 0;
  private shakeT = 0;
  private nearFire = false;
  private prompt: string | null = null;
  private nearNpc: Npc | null = null;
  private applesEaten = 0;
  private mode: "walk" | "fishing" | "releasing" = "walk";
  private fishing: { puddle: Puddle; phase: "wait" | "bite"; t: number; waitFor: number; bobX: number } | null = null;
  private releasing: { fish: FishSpecies; t: number } | null = null;
  private catchAnim: { fish: FishSpecies; t: number; x0: number; y0: number } | null = null;
  private inventory: Inventory = {};
  private toast: { text: string; t: number } | null = null;
  private fishCaught = 0;
  private fishReleased = 0;
  private nearPuddle: Puddle | null = null;
  private coins = 0;
  private coinPop: { amount: number; id: number; t: number } | null = null;
  private coinPopId = 0;
  private hasDoubleJump = false;
  private airJumps = 0;
  private attackT = 0;
  private attackCd = 0;
  private swingHits = new Set<object>();
  private paused = false;
  private fade: { t: number; action: (() => void) | null } | null = null;
  private shockwaves: Shockwave[] = [];
  private lakeHintT = 0;
  private labels = { act: "E", jump: "Space", down: "S", attack: "F" };

  constructor(
    private canvas: HTMLCanvasElement,
    private onHud: (h: HudState) => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    this.ctx = ctx;
    this.reset();
  }

  // ---------- lifecycle ----------
  reset() {
    const { world, groundY } = generateWorld(1337);
    this.world = world;
    const ground = new Int16Array(WORLD_W + 1);
    for (let x = 0; x <= WORLD_W; x++) ground[x] = groundY(x);
    this.forestLvl = { w: WORLD_W, ground, platforms: world.platforms, beetles: world.beetles, flyers: world.flyers };
    this.lvl = this.forestLvl;
    this.scene = "forest";
    this.dungeon = null;
    this.room = null;
    this.p = {
      x: START_X,
      y: this.groundAt(START_X),
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
      walkT: 0,
      invuln: 0,
      coyote: 0,
      jumpBuf: 0,
      plat: null,
      blinkT: 3,
      dropT: 0,
    };
    this.vitals = { health: 100, hunger: 100 };
    this.time = 0;
    this.particles = [];
    this.talking = null;
    this.banner = null;
    this.dead = false;
    this.applesEaten = 0;
    this.mode = "walk";
    this.fishing = null;
    this.releasing = null;
    this.catchAnim = null;
    this.inventory = {};
    this.toast = null;
    this.fishCaught = 0;
    this.fishReleased = 0;
    this.coins = 0;
    this.coinPop = null;
    this.hasDoubleJump = false;
    this.airJumps = 0;
    this.attackT = 0;
    this.attackCd = 0;
    this.fade = null;
    this.shockwaves = [];
    this.paused = false;
    this.camX = clamp(this.p.x - this.W / 2, 0, WORLD_W - this.W);
    this.camY = this.groundAt(this.p.x) + 38 - this.H;
    this.emitHud();
  }

  resize(w: number) {
    this.W = w;
    this.canvas.width = w;
    this.canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;
  }

  mount() {
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  start() {
    this.running = true;
  }

  restart() {
    this.reset();
    this.running = true;
  }

  setKey(k: Key, down: boolean) {
    if (down && !this.keys[k]) this.pressed.add(k);
    this.keys[k] = down;
  }

  clearKeys() {
    (Object.keys(this.keys) as Key[]).forEach((k) => (this.keys[k] = false));
    this.pressed.clear();
  }

  /** Back to the main menu: world keeps rendering behind the menu but nothing plays. */
  stop() {
    this.running = false;
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.clearKeys();
  }

  /** Key names shown in on-screen prompts (follows the player's key bindings). */
  setLabels(l: { act: string; jump: string; down: string; attack: string }) {
    this.labels = l;
  }

  // ---------- save games ----------
  /** Progress snapshot for the save system (forest position; indoors/dungeon resume at the door). */
  snapshot(): SaveData {
    const inForest = this.scene === "forest";
    return {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      x: Math.round(inForest ? this.p.x : this.returnPos.x),
      y: Math.round(inForest ? this.p.y : this.returnPos.y),
      health: this.vitals.health,
      hunger: this.vitals.hunger,
      coins: this.coins,
      inventory: { ...this.inventory },
      fishCaught: this.fishCaught,
      fishReleased: this.fishReleased,
      applesEaten: this.applesEaten,
      time: Math.round(this.time),
      doubleJump: this.hasDoubleJump,
      dungeonCleared: !!this.dungeon?.relicTaken,
      discovered: this.world.villages.filter((v) => v.discovered).map((v) => v.name),
    };
  }

  /** Start a fresh world and apply a save on top of it. */
  loadSave(s: SaveData) {
    this.reset();
    this.vitals = { health: s.health, hunger: s.hunger };
    this.coins = s.coins;
    this.inventory = { ...s.inventory };
    this.fishCaught = s.fishCaught;
    this.fishReleased = s.fishReleased;
    this.applesEaten = s.applesEaten;
    this.time = s.time;
    this.hasDoubleJump = s.doubleJump;
    for (const v of this.world.villages) v.discovered = s.discovered.includes(v.name);
    if (s.dungeonCleared) {
      const d = createDungeon();
      d.relicTaken = true;
      for (const b of d.beetles) b.alive = false;
      for (const f of d.flyers) f.alive = false;
      for (const g of d.gates) {
        g.open = true;
        g.openT = 1;
      }
      for (const g of d.glowcaps) g.eaten = true;
      this.dungeon = d;
    }
    const p = this.p;
    p.x = clamp(s.x, LAKE_MIN_X, WORLD_W - 12);
    // land on whatever is below the saved spot (a deck, bridge or the ground)
    p.y = Math.min(s.y, this.groundAt(p.x));
    p.onGround = false;
    p.plat = null;
    this.snapCamera();
    this.camY = Math.min(p.y - this.H * 0.64, this.groundAt(p.x) + 38 - this.H);
    this.running = true;
    this.emitHud();
  }

  private villageFloor(v: Village) {
    return v.floorY ?? this.groundAt(v.x);
  }

  private groundAt(x: number) {
    const w = this.lvl.w;
    const i = x < 0 ? 0 : x > w ? w : x | 0;
    return this.lvl.ground[i] ?? GROUND_BASE;
  }

  private ceilAt(x: number) {
    const c = this.lvl.ceil;
    if (!c) return -99999;
    const i = x < 0 ? 0 : x > this.lvl.w ? this.lvl.w : x | 0;
    return c[i] ?? -99999;
  }

  private darkness() {
    const tod = (this.time / DAY_LENGTH + 0.3) % 1;
    const d = Math.cos(tod * Math.PI * 2); // 1 at midnight, -1 at noon
    return clamp((d + 0.15) / 0.95, 0, 1);
  }

  private timeLabel() {
    const tod = (this.time / DAY_LENGTH + 0.3) % 1;
    if (tod < 0.2 || tod > 0.82) return "Night";
    if (tod < 0.3) return "Dawn";
    if (tod < 0.7) return "Day";
    return "Dusk";
  }

  // ---------- update ----------
  private update(dt: number) {
    if (this.paused) {
      this.pressed.clear();
      return;
    }
    this.time += dt;
    if (this.fade) {
      const f = this.fade;
      f.t += dt;
      if (f.action && f.t >= FADE / 2) {
        const a = f.action;
        f.action = null;
        a();
      }
      if (f.t >= FADE) this.fade = null;
    }
    if (this.scene === "room") this.updateRoom(dt);
    else this.updateSide(dt);
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }
    if (this.coinPop) {
      this.coinPop.t -= dt;
      if (this.coinPop.t <= 0) this.coinPop = null;
    }
    this.pressed.clear();
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.emitHud();
    }
  }

  /** Fade to black, run `action` while the screen is dark, fade back in. */
  private transition(action: () => void) {
    if (this.fade) return;
    this.clearKeys();
    this.fade = { t: 0, action };
  }

  private snapCamera() {
    const p = this.p;
    this.camX = clamp(p.x - this.W / 2, 0, Math.max(0, this.lvl.w - this.W));
    this.camY = this.cameraTargetY();
  }

  private cameraTargetY() {
    const p = this.p;
    const g = this.groundAt(p.x);
    if (this.scene === "dungeon") return Math.max(-30, Math.min(p.y - this.H * 0.62, g + 38 - this.H));
    return Math.min(p.y - this.H * 0.64, g + 38 - this.H);
  }

  private minX() {
    return this.scene === "forest" ? LAKE_MIN_X : 12;
  }

  private maxX() {
    if (this.scene === "dungeon" && this.dungeon) {
      const g = this.dungeon.gates.find((gt) => gt.openT < 0.6);
      if (g) return g.x - 9;
    }
    return this.lvl.w - 12;
  }

  private updateSide(dt: number) {
    const p = this.p;
    const active = this.running && !this.dead;
    const locked = this.mode !== "walk" || !!this.fade;
    const jumpPressed = this.pressed.has("jump") || this.pressed.has("up");
    const prevX = p.x;

    if (active) {
      const dir = locked ? 0 : (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      const over = Math.abs(p.vx) > MAX_SPEED;
      if (dir) {
        p.vx += dir * ACCEL * dt;
        p.facing = dir;
      } else {
        const fr = FRICTION * dt;
        p.vx = Math.abs(p.vx) <= fr ? 0 : p.vx - Math.sign(p.vx) * fr;
      }
      if (over) {
        // knockback decays back to normal walking speed
        p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx) - MAX_SPEED, 900 * dt);
      } else {
        p.vx = clamp(p.vx, -MAX_SPEED, MAX_SPEED);
      }
      if (!locked && jumpPressed) p.jumpBuf = 0.12;
      if (!locked && this.pressed.has("down") && p.plat) {
        p.dropT = 0.25;
        p.plat = null;
        p.onGround = false;
      }
      if (p.jumpBuf > 0 && p.coyote > 0) {
        p.vy = -JUMP_V;
        p.onGround = false;
        p.plat = null;
        p.coyote = 0;
        p.jumpBuf = 0;
        this.airJumps = jumpsAllowed(this.hasDoubleJump) - 1;
        sfx.jump();
        this.dust(p.x, p.y, 4);
      } else if (!locked && jumpPressed && !p.onGround && this.airJumps > 0) {
        // Winged Spore double jump
        this.airJumps--;
        p.vy = -JUMP_V * 0.95;
        p.jumpBuf = 0;
        sfx.djump();
        for (let i = 0; i < 10; i++) {
          this.spawn({ x: p.x + (Math.random() - 0.5) * 10, y: p.y - 2, vx: (Math.random() - 0.5) * 50, vy: 15 + Math.random() * 30, life: 0.5, color: i % 2 ? "#e8f78a" : "#9fe0c0", size: 1, grav: 0, kind: "star" });
        }
      }
      if (!this.keys.jump && !this.keys.up && p.vy < -90) p.vy = -90;
      if (!locked && this.pressed.has("attack") && this.attackCd <= 0) this.startAttack();
    } else {
      p.vx *= 0.9;
    }

    p.jumpBuf -= dt;
    p.coyote -= dt;
    p.dropT -= dt;
    p.invuln -= dt;
    p.blinkT -= dt;
    this.attackT -= dt;
    this.attackCd -= dt;
    if (p.blinkT < -0.12) p.blinkT = 2 + Math.random() * 3;

    p.vy = Math.min(400, p.vy + GRAVITY * dt);
    const prevY = p.y;
    const nx = clamp(p.x + p.vx * dt, this.minX(), this.maxX());
    // walls: a floor step more than 6px above your feet, or a ceiling lower than your head, blocks you
    const blocked = this.groundAt(nx) < p.y - 6 || this.ceilAt(nx) > p.y - 21;
    if (blocked) p.vx = 0;
    else p.x = nx;
    if (this.scene === "forest" && p.x <= this.minX() + 0.5 && this.keys.left && this.lakeHintT <= 0 && this.running) {
      this.lakeHintT = 6;
      this.showToast("The Great Lake is far too deep to cross.");
    }
    this.lakeHintT -= dt;
    p.y += p.vy * dt;
    const ceil = this.ceilAt(p.x);
    if (p.y - 22 < ceil) {
      p.y = ceil + 22;
      if (p.vy < 0) p.vy = 0;
    }

    let landed = false;
    const g = this.groundAt(p.x);
    if (p.y >= g) {
      p.y = g;
      landed = true;
      p.plat = null;
    } else if (p.onGround && !p.plat && p.vy >= 0 && g - p.y < 4) {
      p.y = g;
      landed = true;
    }
    // stay glued to the platform you stand on (bridges sag and slope)
    const cur = p.plat;
    if (!landed && cur && p.vy >= 0 && p.dropT <= 0 && p.x + 3 >= cur.x && p.x - 3 <= cur.x + cur.w) {
      const sy = surfaceY(cur, p.x);
      if (Math.abs(p.y - sy) < 4) {
        p.y = sy;
        landed = true;
      }
    }
    if (!landed && p.vy >= 0 && p.dropT <= 0) {
      for (const pl of this.lvl.platforms) {
        if (p.x + 3 < pl.x || p.x - 3 > pl.x + pl.w) continue;
        const sy = surfaceY(pl, p.x);
        if (prevY <= surfaceY(pl, prevX) + 0.01 && p.y >= sy) {
          p.y = sy;
          landed = true;
          p.plat = pl;
          break;
        }
      }
    }
    if (landed) {
      if (!p.onGround && p.vy > 160) this.dust(p.x, p.y, 5);
      p.vy = 0;
      p.onGround = true;
      p.coyote = 0.1;
      this.airJumps = jumpsAllowed(this.hasDoubleJump) - 1;
    } else {
      p.onGround = false;
      p.plat = null;
    }
    if (p.onGround && Math.abs(p.vx) > 4) p.walkT += dt * (Math.abs(p.vx) / MAX_SPEED);
    // fell off the pier into the lake: splash back onto the shore
    if (this.scene === "forest" && p.x < LAKE_EDGE && !p.plat && p.y >= LAKE_Y - 0.5 && active && !this.fade) {
      sfx.splash();
      for (let i = 0; i < 12; i++) this.spawn({ x: p.x, y: LAKE_Y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 50, life: 0.6, color: i % 2 ? "#cfe9f0" : "#6fa3b8", size: 1, grav: 260, kind: "spark" });
      this.transition(() => {
        p.x = LAKE_EDGE + 40;
        p.y = this.groundAt(p.x);
        p.vx = 0;
        p.vy = 0;
        this.snapCamera();
        this.showToast("Brrr! The lake is far too deep to swim.");
      });
    }
    // fell into the spike pit: ouch, back to the start of the jumps
    if (this.scene === "dungeon" && this.dungeon && landed && !p.plat && p.y >= PIT_Y - 1 && active && !this.fade) {
      const d = this.dungeon;
      this.hurt(PIT_DAMAGE, p.x);
      if (!this.dead) {
        this.transition(() => {
          p.x = d.checkpointX;
          p.y = this.groundAt(p.x);
          p.vx = 0;
          p.vy = 0;
          p.invuln = 1;
          this.snapCamera();
        });
      }
    }

    // vitals
    this.nearFire =
      this.scene === "forest" &&
      this.world.villages.some((v) => Math.abs(p.x - v.fireX) < 26 && Math.abs(p.y - this.villageFloor(v)) < 6);
    if (active) {
      this.vitals = tickVitals(this.vitals, dt, { nearFire: this.nearFire });
      if (this.nearFire && this.vitals.health < 100 && Math.random() < dt * 4) {
        this.spawn({ x: p.x + (Math.random() * 10 - 5), y: p.y - 18, vx: 0, vy: -14, life: 1, color: "#ff5a6a", size: 1, grav: 0, kind: "heart" });
      }
      if (isDead(this.vitals)) this.die();
    }

    // village discovery
    if (this.scene === "forest") {
      for (const v of this.world.villages) {
        if (!v.discovered && Math.abs(p.x - v.x) < v.half && Math.abs(p.y - this.villageFloor(v)) < 40 && active) {
          v.discovered = true;
          const found = this.world.villages.filter((x) => x.discovered).length;
          const total = this.world.villages.length;
          this.banner = {
            title: v.name,
            sub: found === total ? "You found every mushroom village!" : `${v.floorY !== undefined ? "Treetop village" : "Village"} discovered · ${found}/${total}`,
            t: 4,
          };
          sfx.discover();
        }
      }
    }
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }

    if (this.scene === "forest") this.updateNpcs(dt);
    this.updateBeetles(dt, active);
    this.updateFlyers(dt, active);
    this.updateApples(dt);
    if (this.scene === "dungeon") this.updateDungeon(dt);
    if (active && this.attackT > 0) this.resolveAttack();
    if (active && this.mode === "fishing") this.updateFishing(dt);
    if (active && this.mode === "releasing") this.updateRelease(dt);
    if (active && this.mode === "walk" && !this.fade) this.updateInteract();
    else if (!active || this.fade) this.prompt = null;
    if (this.catchAnim) {
      this.catchAnim.t += dt;
      if (this.catchAnim.t > 0.6) this.catchAnim = null;
    }
    this.updateParticles(dt);

    // camera
    const targetX = clamp(p.x - this.W / 2 + p.facing * 18, 0, Math.max(0, this.lvl.w - this.W));
    this.camX += (targetX - this.camX) * Math.min(1, dt * 4);
    this.camY += (this.cameraTargetY() - this.camY) * Math.min(1, dt * 3);
    this.shakeT -= dt;
  }

  // ---------- house interiors (top-down) ----------
  private enterHouse(v: Village, h: House) {
    sfx.door();
    this.transition(() => {
      this.returnPos = { x: this.p.x, y: this.p.y };
      this.room = createRoom(h, v.name, Math.round(h.x * 13 + v.x * 7));
      this.scene = "room";
      this.talking = null;
      this.rp = { x: ROOM_SPAWN.x, y: ROOM_SPAWN.y - 4, facing: "up", walkT: 0, moving: false };
    });
  }

  private exitRoom() {
    sfx.door();
    this.transition(() => {
      this.scene = "forest";
      this.room = null;
      this.talking = null;
      const p = this.p;
      p.x = this.returnPos.x;
      p.y = this.returnPos.y;
      p.vx = 0;
      p.vy = 0;
      this.snapCamera();
    });
  }

  private advanceTalk() {
    const tk = this.talking;
    if (!tk) return;
    tk.idx++;
    if (tk.idx >= tk.lines.length) this.talking = null;
    else sfx.talk();
  }

  private updateRoom(dt: number) {
    const room = this.room;
    if (!room) return;
    const rp = this.rp;
    const active = this.running && !this.dead;
    const furn = nearbyFurn(room, rp.x, rp.y);
    this.nearFire = furn?.kind === "fireplace";
    if (active) {
      this.vitals = tickVitals(this.vitals, dt, { nearFire: this.nearFire });
      if (isDead(this.vitals)) this.die();
    }
    const canMove = active && !this.fade && !this.talking;
    let dx = 0;
    let dy = 0;
    if (canMove) {
      dx = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      dy = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
    }
    rp.moving = dx !== 0 || dy !== 0;
    if (rp.moving) {
      const len = Math.hypot(dx, dy);
      const n = moveInRoom(room, rp.x, rp.y, (dx / len) * ROOM_SPEED * dt, (dy / len) * ROOM_SPEED * dt);
      rp.x = n.x;
      rp.y = n.y;
      rp.walkT += dt * 0.9;
      rp.facing = dx ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      if (rp.y >= FLOOR_BOTTOM + 7) {
        this.exitRoom();
        return;
      }
    }
    const A = this.labels.act;
    const door = atDoor(rp.x, rp.y);
    if (!active || this.fade) this.prompt = null;
    else if (this.talking) this.prompt = `${A} · next`;
    else if (door) this.prompt = `${this.labels.down} · go outside`;
    else if (furn?.kind === "bed") this.prompt = `${A} · take a nap`;
    else if (furn?.kind === "bookshelf") this.prompt = `${A} · read a book`;
    else if (furn?.kind === "fireplace") this.prompt = this.vitals.health < 100 ? "Warming up by the fire…" : "A crackling fireplace";
    else this.prompt = null;

    if (active && !this.fade && this.pressed.has("act")) {
      if (this.talking) this.advanceTalk();
      else if (door) this.exitRoom();
      else if (furn?.kind === "bed") {
        sfx.nap();
        this.transition(() => {
          this.vitals = nap(this.vitals);
          this.showToast("Zzz… You wake up fully rested.");
        });
      } else if (furn?.kind === "bookshelf") {
        this.talking = { npc: null, name: "Bookshelf", lines: [room.lore, "You put the book back carefully."], idx: 0 };
        sfx.talk();
      }
      this.emitHud();
    }
  }

  // ---------- Elder Tree dungeon ----------
  private enterDungeon() {
    sfx.door();
    this.transition(() => {
      this.returnPos = { x: this.p.x, y: this.p.y };
      if (!this.dungeon) this.dungeon = createDungeon();
      const d = this.dungeon;
      this.lvl = d;
      this.scene = "dungeon";
      this.talking = null;
      const p = this.p;
      p.x = d.entryX + 24;
      p.y = this.groundAt(p.x);
      p.vx = 0;
      p.vy = 0;
      p.plat = null;
      p.facing = 1;
      this.particles = [];
      this.snapCamera();
      if (!d.relicTaken) this.banner = { title: "The Elder Tree", sub: "Beat the beetles to open the root gates", t: 4 };
    });
  }

  private exitDungeon() {
    sfx.door();
    this.transition(() => {
      this.scene = "forest";
      this.lvl = this.forestLvl;
      this.talking = null;
      const p = this.p;
      p.x = this.returnPos.x;
      p.y = this.groundAt(p.x);
      p.vx = 0;
      p.vy = 0;
      p.plat = null;
      p.facing = -1;
      this.particles = [];
      this.snapCamera();
    });
  }

  private updateDungeon(dt: number) {
    const d = this.dungeon;
    if (!d) return;
    const enemies = [...d.beetles, ...d.flyers];
    for (const g of d.gates) {
      if (!g.open && sectionCleared(enemies, g.section)) {
        g.open = true;
        this.shakeT = 0.4;
        sfx.gate();
        this.showToast(g.section === d.sections - 1 ? "The Beetle King is beaten! The last roots pull back…" : "The roots pull back. The way is open!");
      }
      if (g.open && g.openT < 1) g.openT = Math.min(1, g.openT + dt * 0.9);
    }
    if (Math.random() < dt * 3) {
      const fx = this.camX + Math.random() * this.W;
      const top = ceilAt(d, fx);
      this.spawn({ x: fx, y: top + 10 + Math.random() * Math.max(10, floorAt(d, fx) - top - 20), vx: (Math.random() - 0.5) * 4, vy: -2, life: 4 + Math.random() * 3, color: "#a8fff0", size: 1, grav: 0, kind: "firefly" });
    }
  }

  private updateDungeonInteract() {
    const d = this.dungeon;
    if (!d) return;
    const p = this.p;
    const A = this.labels.act;
    const onFloor = p.onGround && !p.plat;
    const cap = onFloor ? d.glowcaps.find((gc) => !gc.eaten && Math.abs(gc.x - p.x) < 9) : undefined;
    const shrine = onFloor && !d.relicTaken && Math.abs(p.x - d.shrineX) < 14;
    const door = onFloor && (Math.abs(p.x - d.entryX) < 14 || Math.abs(p.x - d.exitX) < 14);
    if (this.talking) this.prompt = `${A} · next`;
    else if (shrine) this.prompt = `${A} · take the Winged Spore`;
    else if (cap) this.prompt = `${A} · eat the glowcap`;
    else if (door) this.prompt = `${A} · go outside`;
    else this.prompt = null;
    if (!this.pressed.has("act")) return;
    if (this.talking) this.advanceTalk();
    else if (shrine) this.takeRelic(d);
    else if (cap) {
      cap.eaten = true;
      this.vitals = eatGlowcap(this.vitals);
      sfx.eat();
      for (let i = 0; i < 3; i++) {
        this.spawn({ x: p.x + (i - 1) * 4, y: p.y - 20, vx: 0, vy: -18, life: 0.9, color: "#5fd6c4", size: 1, grav: 0, kind: "heart" });
      }
    } else if (door) this.exitDungeon();
    this.emitHud();
  }

  private takeRelic(d: Dungeon) {
    d.relicTaken = true;
    this.hasDoubleJump = true;
    this.airJumps = 1;
    sfx.discover();
    this.shakeT = 0.3;
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      this.spawn({ x: d.shrineX, y: floorAt(d, d.shrineX) - 24, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 1.2, color: i % 2 ? "#e8f78a" : "#9fe0c0", size: 1, grav: 0, kind: "star" });
    }
    this.banner = { title: "Double jump!", sub: `Press ${this.labels.jump} again in mid-air`, t: 5 };
    this.talking = {
      npc: null,
      name: "Winged Spore",
      lines: [
        "The Winged Spore settles on your cap. You feel as light as a dandelion seed!",
        `Now you can jump a second time in mid-air. Press ${this.labels.jump} twice to climb the shelf mushrooms up the giant trees.`,
        "Rope bridges tie every treetop together. Two villages are hidden up there!",
      ],
      idx: 0,
    };
  }

  // ---------- combat ----------
  private startAttack() {
    const p = this.p;
    this.attackT = ATTACK_TIME;
    this.attackCd = ATTACK_COOLDOWN;
    this.swingHits = new Set();
    sfx.puff();
    const f = p.facing >= 0 ? 1 : -1;
    for (let i = 0; i < 10; i++) {
      this.spawn({ x: p.x + f * 6, y: p.y - 10 + (Math.random() - 0.5) * 8, vx: f * (60 + Math.random() * 90), vy: (Math.random() - 0.5) * 30, life: 0.2 + Math.random() * 0.15, color: i % 3 ? "#efe8c4" : "#b8d870", size: i % 2 ? 2 : 1, grav: -20, kind: "bit" });
    }
  }

  private resolveAttack() {
    const p = this.p;
    for (const b of this.lvl.beetles) {
      if (!b.alive || this.swingHits.has(b)) continue;
      if (attackHits(p.x, p.y, p.facing, b.x, b.y - (b.big ? 8 : 4), b.big ? 12 : 5, b.big ? 8 : 5)) {
        this.swingHits.add(b);
        this.hitBeetle(b);
      }
    }
    for (const f of this.lvl.flyers) {
      if (!f.alive || this.swingHits.has(f)) continue;
      if (attackHits(p.x, p.y, p.facing, f.x, f.y)) {
        this.swingHits.add(f);
        this.killFlyer(f);
      }
    }
  }

  private bits(x: number, y: number, n: number, a: string, b: string) {
    for (let i = 0; i < n; i++) {
      this.spawn({ x, y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.8, color: i % 2 ? a : b, size: 1, grav: 300, kind: "bit" });
    }
  }

  private hitBeetle(b: Beetle) {
    if ((b.hitT ?? 0) > 0) return;
    const hp = (b.hp ?? 1) - 1;
    b.hp = hp;
    if (hp > 0) {
      b.hitT = 0.5;
      const away = Math.sign(b.x - this.p.x) || 1;
      b.x = clamp(b.x + away * 8, b.minX, b.maxX);
      b.vx = away * Math.abs(b.vx || 30);
      this.shakeT = 0.15;
      sfx.bossHit();
      this.bits(b.x, b.y - 10, 6, "#1f2e2b", "#f2c84b");
      return;
    }
    b.alive = false;
    b.respawn = this.scene === "dungeon" ? Infinity : 30;
    sfx.stomp();
    this.bits(b.x, b.y - 4, b.big ? 30 : 8, "#1f2e2b", "#4d8a7c");
    if (b.big) {
      this.shakeT = 0.5;
      this.banner = { title: "Beetle King defeated!", sub: "The Winged Spore is waiting at the shrine", t: 4 };
    }
  }

  private killFlyer(f: Flyer) {
    f.alive = false;
    f.respawn = this.scene === "dungeon" ? Infinity : 40;
    sfx.stomp();
    this.bits(f.x, f.y, 8, "#4a2f5e", "#bfdbe4");
  }

  private hurt(amount: number, fromX: number) {
    const p = this.p;
    this.vitals = takeDamage(this.vitals, amount);
    if (this.mode === "fishing") this.endFishing("Ouch! You dropped your rod.");
    p.invuln = 1.2;
    p.vx = (Math.sign(p.x - fromX) || 1) * 150;
    p.vy = -140;
    p.onGround = false;
    p.plat = null;
    this.shakeT = 0.25;
    sfx.hurt();
    if (isDead(this.vitals)) this.die();
  }

  private updateFlyers(dt: number, active: boolean) {
    const p = this.p;
    const canFight = active && this.mode !== "releasing" && !this.fade;
    for (const f of this.lvl.flyers) {
      if (!f.alive) {
        f.respawn -= dt;
        if (f.respawn <= 0 && Math.abs(f.homeX - p.x) > this.W) {
          f.alive = true;
          f.x = f.homeX;
          f.y = f.baseY;
          f.state = "hover";
          f.cd = 2;
        }
        continue;
      }
      if (Math.abs(f.x - p.x) > this.W * 1.5) continue;
      stepFlyer(f, dt, canFight ? p.x : -99999, p.y, this.groundAt(f.x));
      if (!canFight) continue;
      if (Math.abs(f.x - p.x) < 7 && f.y > p.y - 24 && f.y < p.y + 4) {
        if (p.vy > 20 && p.y <= f.y - 1) {
          this.killFlyer(f);
          p.vy = -190;
          p.onGround = false;
        } else if (p.invuln <= 0) this.hurt(FLYER_DAMAGE, f.x);
      }
    }
  }

  private die() {
    this.dead = true;
    this.talking = null;
    sfx.die();
    this.emitHud();
  }

  private updateNpcs(dt: number) {
    const p = this.p;
    for (const v of this.world.villages) {
      if (Math.abs(v.x - p.x) > this.W + 300) continue;
      for (const n of v.npcs) {
        const talkingTo = this.talking?.npc === n;
        const near = Math.abs(n.x - p.x) < 26 && this.running;
        if (talkingTo || near) {
          n.vx = 0;
          n.facing = Math.sign(p.x - n.x) || 1;
        } else {
          n.wanderT -= dt;
          if (n.wanderT <= 0) {
            if (Math.random() < 0.45) {
              n.vx = 0;
              n.wanderT = 1 + Math.random() * 2.5;
            } else {
              n.vx = (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 7);
              n.facing = Math.sign(n.vx);
              n.wanderT = 1 + Math.random() * 2;
            }
          }
        }
        n.x += n.vx * dt;
        if (n.x < n.minX) {
          n.x = n.minX;
          n.vx = Math.abs(n.vx);
          n.facing = 1;
        } else if (n.x > n.maxX) {
          n.x = n.maxX;
          n.vx = -Math.abs(n.vx);
          n.facing = -1;
        }
        n.y = v.floorY ?? this.groundAt(n.x);
        if (n.vx) n.walkT += dt * 0.5;
      }
    }
  }

  private updateBeetles(dt: number, active: boolean) {
    const p = this.p;
    const canFight = active && this.mode !== "releasing" && !this.fade;
    for (const b of this.lvl.beetles) {
      if (!b.alive) {
        b.respawn -= dt;
        if (b.respawn <= 0 && Math.abs(b.x - p.x) > this.W) b.alive = true;
        continue;
      }
      if (Math.abs(b.x - p.x) > this.W * 2) continue;
      if (b.big) {
        b.hitT = (b.hitT ?? 0) - dt;
        if (this.scene === "dungeon" && p.x > BOSS_ARENA_X && canFight) {
          const before = b.chargeT ?? 2;
          b.chargeT = before - dt;
          if (before > 0 && b.chargeT <= 0) {
            b.vx = (Math.sign(p.x - b.x) || 1) * 95;
            sfx.bossHit();
          }
          if (b.chargeT <= -1.1) {
            b.chargeT = 1.4 + Math.random() * 1.2;
            b.vx = Math.sign(b.vx || 1) * 30;
          }
        }
      }
      b.x += b.vx * dt;
      if (b.x < b.minX) b.vx = Math.abs(b.vx);
      if (b.x > b.maxX) b.vx = -Math.abs(b.vx);
      b.y = this.groundAt(b.x);
      b.walkT += dt * (b.big ? 0.7 : 1);
      if (!canFight) continue;
      const hw = b.big ? 14 : 8;
      const top = b.big ? 16 : 8;
      if (Math.abs(b.x - p.x) < hw && p.y > b.y - top && p.y - 15 < b.y) {
        if (p.vy > 20 && p.y < b.y - top + 6) {
          this.hitBeetle(b);
          p.vy = b.big ? -230 : -180;
          p.onGround = false;
        } else if (p.invuln <= 0) {
          this.hurt(b.big ? BOSS_DAMAGE : BEETLE_DAMAGE, b.x);
        }
      }
    }
  }

  private updateApples(dt: number) {
    for (const t of this.world.appleTrees) {
      for (const a of t.apples) {
        if (!a.grown) {
          a.timer -= dt;
          if (a.timer <= 0) a.grown = true;
        }
      }
    }
  }

  private updateInteract() {
    if (this.scene === "dungeon") {
      this.updateDungeonInteract();
      return;
    }
    const p = this.p;
    const A = this.labels.act;
    let nearNpc: Npc | null = null;
    let nd = 18;
    for (const v of this.world.villages) {
      if (Math.abs(p.x - v.x) > v.half + 40) continue;
      for (const n of v.npcs) {
        const d = Math.abs(n.x - p.x);
        if (d < nd && Math.abs(n.y - p.y) < 12) {
          nearNpc = n;
          nd = d;
        }
      }
    }
    this.nearNpc = nearNpc;
    let house: { v: Village; h: House } | null = null;
    if (p.onGround) {
      for (const v of this.world.villages) {
        if (Math.abs(p.x - v.x) > v.half + 20 || Math.abs(p.y - this.villageFloor(v)) > 3) continue;
        for (const h of v.houses) if (Math.abs(p.x - h.x) < 6) house = { v, h };
      }
    }
    const elder = this.world.elder;
    const ex = elder.x + elder.w / 2;
    const atElder = p.onGround && !p.plat && Math.abs(p.x - ex) < 14;
    const tree = this.world.appleTrees.find(
      (t) => Math.abs(t.x - p.x) < 16 && Math.abs(this.groundAt(t.x) - p.y) < 30 && t.apples.some((a) => a.grown),
    );
    const puddle =
      p.onGround && !p.plat
        ? this.world.puddles.find((pd) => Math.abs(p.x - pd.x) < pd.half + 12) ?? null
        : null;
    this.nearPuddle = puddle;

    if (this.talking?.npc && Math.abs(this.talking.npc.x - p.x) > 40) this.talking = null;

    if (this.talking) this.prompt = `${A} · next`;
    else if (nearNpc) this.prompt = `${A} · talk to ${nearNpc.name}`;
    else if (house) this.prompt = `${A} · go inside`;
    else if (atElder) this.prompt = this.hasDoubleJump ? `${A} · enter the Elder Tree (cleared)` : `${A} · enter the Elder Tree`;
    else if (tree) this.prompt = `${A} · eat apple (${tree.apples.filter((a) => a.grown).length} left)`;
    else if (puddle) this.prompt = `${A} · fish in the puddle`;
    else if (this.nearFire) this.prompt = this.vitals.health < 100 ? "Resting by the fire…" : "A cosy campfire";
    else this.prompt = null;

    if (this.pressed.has("act")) {
      if (this.talking) {
        this.advanceTalk();
      } else if (nearNpc) {
        this.talking = { npc: nearNpc, name: nearNpc.name, lines: nearNpc.lines, idx: 0 };
        sfx.talk();
      } else if (house) {
        this.enterHouse(house.v, house.h);
      } else if (atElder) {
        this.enterDungeon();
      } else if (tree) {
        const a = tree.apples.find((x) => x.grown)!;
        a.grown = false;
        a.timer = APPLE_REGROW;
        this.vitals = eatApple(this.vitals);
        this.applesEaten++;
        sfx.eat();
        const { cyOff } = appleTreeGeom(tree.size);
        const ax = tree.x + a.ox;
        const ay = this.groundAt(tree.x) - cyOff + a.oy;
        for (let i = 0; i < 10; i++) {
          this.spawn({ x: ax, y: ay, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, life: 0.7, color: i % 3 ? "#d7362a" : "#f3e7b5", size: 1, grav: 200, kind: "spark" });
        }
        for (let i = 0; i < 3; i++) {
          this.spawn({ x: p.x + (i - 1) * 4, y: p.y - 20, vx: 0, vy: -18, life: 0.9, color: "#ff5a6a", size: 1, grav: 0, kind: "heart" });
        }
      } else if (puddle) {
        this.startFishing(puddle);
      }
      this.emitHud();
    }
  }

  // ---------- fishing ----------
  private startFishing(pd: Puddle) {
    const p = this.p;
    if (Math.abs(p.x - pd.x) > pd.half - 2) p.facing = pd.x >= p.x ? 1 : -1;
    const bobX = clamp(p.x + p.facing * 16, pd.x - pd.half + 3, pd.x + pd.half - 3);
    p.vx = 0;
    this.mode = "fishing";
    this.talking = null;
    this.fishing = { puddle: pd, phase: "wait", t: 0, waitFor: rollWait(Math.random()), bobX };
    this.ripple(bobX, this.groundAt(pd.x));
    sfx.cast();
  }

  private endFishing(msg: string | null) {
    this.mode = "walk";
    this.fishing = null;
    if (msg) this.showToast(msg);
  }

  private showToast(text: string) {
    this.toast = { text, t: 2.6 };
    this.emitHud();
  }

  private ripple(x: number, y: number) {
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.9, color: "#cfe9f0", size: 1, grav: 0, kind: "ripple" });
  }

  private updateFishing(dt: number) {
    const f = this.fishing;
    if (!f) return;
    f.t += dt;
    const wy = this.groundAt(f.puddle.x);
    if (this.keys.left || this.keys.right || this.pressed.has("act")) {
      this.pressed.delete("act");
      this.endFishing("You reeled in your line.");
      return;
    }
    const res = resolveBite(f.phase, f.t, this.pressed.has("jump") || this.pressed.has("up"));
    if (f.phase === "wait") {
      this.prompt = "Waiting for a bite…";
      if (res === "early") {
        sfx.splash();
        this.ripple(f.bobX, wy);
        this.endFishing("Too early! The fish swam away.");
        return;
      }
      if (Math.random() < dt * 0.8) this.ripple(f.bobX + (Math.random() - 0.5) * 6, wy);
      if (f.t >= f.waitFor) {
        f.phase = "bite";
        f.t = 0;
        sfx.bite();
        this.ripple(f.bobX, wy);
        this.ripple(f.bobX, wy);
        this.emitHud();
      }
      return;
    }
    this.prompt = `${this.labels.jump}!`;
    if (res === "caught") {
      const fish = rollFish(Math.random());
      this.inventory = addFish(this.inventory, fish.id);
      this.fishCaught++;
      sfx.caught();
      for (let i = 0; i < 10; i++) {
        this.spawn({ x: f.bobX, y: wy, vx: (Math.random() - 0.5) * 50, vy: -40 - Math.random() * 50, life: 0.6, color: i % 2 ? "#cfe9f0" : "#6fa3b8", size: 1, grav: 260, kind: "spark" });
      }
      this.catchAnim = { fish, t: 0, x0: f.bobX, y0: wy };
      this.endFishing(`You caught a ${fish.name}!`);
    } else if (res === "missed") {
      sfx.splash();
      this.endFishing("It got away…");
    }
  }

  /** Called from the inventory: hold the fish up and let the light carry it away. */
  releaseFish(id: string) {
    const fish = fishById(id);
    if (!fish || !this.running || this.dead || (this.inventory[id] ?? 0) <= 0) return false;
    if (this.mode === "releasing" || this.scene !== "forest" || this.fade) return false;
    if (this.mode === "fishing") this.endFishing(null);
    this.inventory = removeFish(this.inventory, id);
    this.mode = "releasing";
    this.talking = null;
    this.p.vx = 0;
    this.releasing = { fish, t: 0 };
    sfx.release();
    this.emitHud();
    return true;
  }

  private releaseFishPos() {
    const r = this.releasing;
    if (!r) return null;
    const p = this.p;
    const t = r.t;
    const hold = { x: p.x, y: p.y - 21 };
    if (t < 1.2) return { ...hold, y: hold.y + (t < 0.3 ? Math.round((0.3 - t) * 30) : 0), a: 1 };
    const k = t - 1.2;
    return {
      x: hold.x + Math.sin(k * 5) * 3,
      y: hold.y - k * 14 - k * k * 32,
      a: t > RELEASE_TIME - 0.6 ? Math.max(0, (RELEASE_TIME - t) / 0.6) : 1,
    };
  }

  private updateRelease(dt: number) {
    const r = this.releasing;
    if (!r) return;
    r.t += dt;
    this.prompt = null;
    const p = this.p;
    if (r.t > 0.4 && Math.random() < dt * 22) {
      this.spawn({ x: p.x + (Math.random() - 0.5) * 16, y: p.y - Math.random() * 12, vx: (Math.random() - 0.5) * 4, vy: -30 - Math.random() * 40, life: 1.6, color: Math.random() < 0.5 ? "#fff3a0" : "#ffd84a", size: 1, grav: -10, kind: "star" });
    }
    const fp = this.releaseFishPos();
    if (fp && r.t > 1.2 && Math.random() < dt * 30) {
      this.spawn({ x: fp.x + (Math.random() - 0.5) * 6, y: fp.y + 3, vx: (Math.random() - 0.5) * 8, vy: 10, life: 0.8, color: "#fff3a0", size: 1, grav: 0, kind: "star" });
    }
    if (r.t >= RELEASE_TIME) {
      this.fishReleased++;
      this.mode = "walk";
      this.releasing = null;
      const reward = releaseReward(r.fish.id);
      this.coins += reward;
      this.coinPop = { amount: reward, id: ++this.coinPopId, t: 2.2 };
      sfx.coin();
      for (let i = 0; i < 8; i++) {
        this.spawn({ x: p.x + (Math.random() - 0.5) * 8, y: p.y - 26, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 30, life: 0.8, color: i % 2 ? "#ffd84a" : "#fff3a0", size: 1, grav: 180, kind: "spark" });
      }
      this.showToast(`The ${r.fish.name} floated up into the light. +${reward} coins!`);
    }
  }

  private spawn(o: Omit<Particle, "max" | "phase"> & { phase?: number }) {
    if (this.particles.length > 400) return;
    this.particles.push({ ...o, max: o.life, phase: o.phase ?? Math.random() * 10 });
  }

  private dust(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.spawn({ x: x + (Math.random() - 0.5) * 6, y: y - 1, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 15, life: 0.4, color: "#c9b48a", size: 1, grav: 20, kind: "dust" });
    }
  }

  private updateParticles(dt: number) {
    const night = this.darkness();
    const forest = this.scene === "forest";
    // falling leaves from the canopy
    if (forest && Math.random() < dt * 2.2) {
      this.spawn({
        x: this.camX + Math.random() * (this.W + 60) - 30,
        y: this.camY - 5,
        vx: -4 + Math.random() * 10,
        vy: 9 + Math.random() * 7,
        life: 25,
        color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)] ?? "#c98a2e",
        size: 1,
        grav: 0,
        kind: "leaf",
      });
    }
    // fireflies at night
    if (forest && night > 0.3 && Math.random() < dt * 3 * night) {
      this.spawn({
        x: this.camX + Math.random() * this.W,
        y: this.camY + this.H * (0.35 + Math.random() * 0.5),
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 4,
        life: 5 + Math.random() * 4,
        color: "#d8ff7a",
        size: 1,
        grav: 0,
        kind: "firefly",
      });
    }
    // campfire sparks + smoke
    for (const v of forest ? this.world.villages : []) {
      if (Math.abs(v.fireX - this.camX - this.W / 2) > this.W) continue;
      const gy = this.villageFloor(v);
      if (Math.random() < dt * 6) {
        this.spawn({ x: v.fireX + (Math.random() - 0.5) * 4, y: gy - 5, vx: (Math.random() - 0.5) * 8, vy: -20 - Math.random() * 15, life: 1 + Math.random(), color: "#ffb347", size: 1, grav: -5, kind: "spark" });
      }
      if (Math.random() < dt * 3) {
        this.spawn({ x: v.fireX, y: gy - 8, vx: 3 + Math.random() * 3, vy: -10, life: 3, color: "#9aa59a", size: 2, grav: -1, kind: "smoke" });
      }
    }
    const t = this.time;
    this.particles = this.particles.filter((q) => {
      q.life -= dt;
      if (q.kind === "leaf") {
        q.x += (q.vx + Math.sin(t * 1.8 + q.phase) * 10) * dt;
        q.y += q.vy * dt;
        const gy = this.groundAt(q.x);
        if (q.y >= gy - 1) {
          q.y = gy - 1;
          q.vx = 0;
          q.vy = 0;
          if (q.life > 3) q.life = 3;
        }
      } else if (q.kind === "firefly") {
        q.x += (q.vx + Math.sin(t * 2 + q.phase) * 6) * dt;
        q.y += (q.vy + Math.cos(t * 1.7 + q.phase) * 5) * dt;
      } else {
        q.vy += q.grav * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      return q.life > 0 && q.y < this.camY + this.H + 40;
    });
  }

  private emitHud() {
    const p = this.p;
    const villages = this.world.villages;
    const undiscovered = villages.filter((v) => !v.discovered);
    let compass: HudState["compass"] = null;
    if (undiscovered.length) {
      const v = undiscovered.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
      compass = { name: v.name, dir: v.x >= p.x ? 1 : -1, steps: Math.round(Math.abs(v.x - p.x) / 8), high: v.floorY !== undefined };
    }
    const tk = this.talking;
    const boss = this.scene === "dungeon" && this.dungeon ? this.dungeon.beetles.find((b) => b.big && b.alive) : undefined;
    this.onHud({
      health: this.vitals.health,
      hunger: this.vitals.hunger,
      found: villages.length - undiscovered.length,
      total: villages.length,
      prompt: this.dead || !this.running ? null : this.prompt,
      dialog: tk ? { name: tk.name, text: tk.lines[tk.idx] ?? "", page: tk.idx + 1, pages: tk.lines.length } : null,
      banner: this.banner ? { title: this.banner.title, sub: this.banner.sub } : null,
      dead: this.dead,
      timeOfDay: this.timeLabel(),
      compass,
      resting: this.nearFire && this.vitals.health < 100,
      starving: this.vitals.hunger <= 0,
      applesEaten: this.applesEaten,
      fishing: this.mode === "fishing" && this.fishing ? this.fishing.phase : null,
      releasing: this.mode === "releasing",
      toast: this.toast?.text ?? null,
      inventory: FISH.filter((f) => (this.inventory[f.id] ?? 0) > 0).map((f) => ({ id: f.id, name: f.name, count: this.inventory[f.id] ?? 0 })),
      fishCaught: this.fishCaught,
      fishReleased: this.fishReleased,
      coins: this.coins,
      coinPop: this.coinPop ? { amount: this.coinPop.amount, id: this.coinPop.id } : null,
      scene: this.scene,
      doubleJump: this.hasDoubleJump,
      boss: boss && p.x > BOSS_ARENA_X ? { hp: boss.hp ?? 0, max: boss.maxHp ?? 1 } : null,
    });
  }

  // ---------- render ----------
  private render() {
    if (this.scene === "room" && this.room) {
      drawRoom(this.ctx, this.room, this.W, this.H, this.rp, this.time, this.darkness());
    } else if (this.scene === "dungeon" && this.dungeon) {
      this.renderDungeon(this.dungeon);
    } else {
      this.renderForest();
    }
    if (this.fade) {
      this.ctx.globalAlpha = Math.max(0, 1 - Math.abs(this.fade.t / FADE * 2 - 1));
      rect(this.ctx, "#080c09", 0, 0, this.W, this.H);
      this.ctx.globalAlpha = 1;
    }
  }

  private renderDungeon(d: Dungeon) {
    const ctx = this.ctx;
    const cx = Math.round(this.camX);
    const cy = Math.round(this.camY);
    drawDungeonBack(ctx, d, cx, cy, this.W, this.H, this.time);
    drawDoorway(ctx, d.entryX, cx, cy, this.darkness() > 0.5);
    drawDoorway(ctx, d.exitX, cx, cy, this.darkness() > 0.5);
    for (const pl of d.platforms) this.drawPlatform(pl, cx, cy);
    drawDungeonFloor(ctx, d, cx, cy, this.W, this.H);
    for (const g of d.glowcaps) drawGlowcap(ctx, g, cx, cy);
    drawShrine(ctx, d, cx, cy, this.time);
    this.drawEnemies(cx, cy);
    const p = this.p;
    if (p.invuln <= 0 || Math.floor(this.time * 18) % 2 !== 0) {
      drawMushroomPerson(ctx, Math.round(p.x - cx), Math.round(p.y - cy), { facing: p.facing, walk: p.walkT, moving: Math.abs(p.vx) > 4, air: !p.onGround, cap: "#d9443a", spots: true, scale: 1, blink: this.dead || p.blinkT < 0 });
    }
    this.drawAttack(cx, cy);
    this.drawParticles(cx, cy, false);
    this.drawParticles(cx, cy, true);
    for (const g of d.gates) drawGate(ctx, g, cx, cy, this.time);
  }

  private drawEnemies(cx: number, cy: number) {
    const ctx = this.ctx;
    for (const b of this.lvl.beetles) {
      if (!b.alive || b.x - cx < -30 || b.x - cx > this.W + 30) continue;
      if ((b.hitT ?? 0) > 0 && Math.floor(this.time * 20) % 2 === 0) continue;
      if (b.big) {
        ctx.save();
        ctx.translate(Math.round(b.x - cx), Math.round(b.y - cy));
        ctx.scale(2, 2);
        drawBeetle(ctx, 0, 0, Math.sign(b.vx), b.walkT);
        rect(ctx, "#f2c84b", -4, -12, 8, 2);
        for (const x of [-4, 0, 3]) rect(ctx, "#f2c84b", x, -15, 1, 3);
        ctx.restore();
      } else drawBeetle(ctx, Math.round(b.x - cx), Math.round(b.y - cy), Math.sign(b.vx), b.walkT);
    }
    for (const f of this.lvl.flyers) {
      if (!f.alive || f.x - cx < -20 || f.x - cx > this.W + 20) continue;
      drawFlyer(ctx, Math.round(f.x - cx), Math.round(f.y - cy), Math.sign(f.vx), f.flap, f.state === "dive");
    }
  }

  private drawAttack(cx: number, cy: number) {
    if (this.attackT <= 0) return;
    const f = this.p.facing;
    for (let i = 0; i < 8; i++) {
      const progress = 1 - this.attackT / ATTACK_TIME;
      rect(this.ctx, i % 2 ? "#efe8c4" : "#b8d870", Math.round(this.p.x - cx + f * (8 + progress * 12 + i % 3)), Math.round(this.p.y - cy - 8 - i * 2), 2, 2);
    }
  }

  private renderForest() {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    let cx = Math.round(this.camX);
    let cy = Math.round(this.camY);
    if (this.shakeT > 0) {
      cx += Math.round((Math.random() - 0.5) * 3);
      cy += Math.round((Math.random() - 0.5) * 3);
    }
    const night = this.darkness();
    const day = 1 - night;

    // sky / deep forest haze
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#10241b");
    grad.addColorStop(0.45, "#2c5646");
    grad.addColorStop(1, "#9cc3a6");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    this.drawTrunkLayer(cx, cy, 0.12, 70, 22, 46, "#7aa58e", "#6d9883", "#6f9a82", 1, 34);
    this.drawShafts(cx, day);
    this.drawTrunkLayer(cx, cy, 0.3, 140, 44, 80, "#507c69", "#456f5d", "#4a7662", 2, 20);
    this.drawCanopy(cx, cy, 0.3, "#163126", 2);
    this.drawTrunkLayer(cx, cy, 0.55, 240, 70, 120, "#33554a", "#2a483e", "#2f5240", 3, 9);
    this.drawBushes(cx, cy, 0.75);
    this.drawCanopy(cx, cy, 0.6, "#0e2018", 3);

    // play layer
    for (const t of this.world.trees) this.drawGiantTree(t, cx, cy);
    for (const pl of this.world.platforms) this.drawPlatform(pl, cx, cy);
    this.drawGround(cx, cy);
    for (const pd of this.world.puddles) this.drawPuddle(pd, cx, cy);
    for (const v of this.world.villages) this.drawVillage(v, cx, cy, night);
    for (const t of this.world.appleTrees) {
      const sx = t.x - cx;
      if (sx < -30 || sx > W + 30) continue;
      drawAppleTree(ctx, sx, this.groundAt(t.x) - cy, t.size, t.apples, Math.sin(this.time * 0.8 + t.x) * 0.6);
    }
    this.drawDecor(cx, cy);
    this.drawEnemies(cx, cy);
    for (const v of this.world.villages) {
      for (const n of v.npcs) {
        const sx = Math.round(n.x - cx);
        if (sx < -20 || sx > W + 20) continue;
        drawMushroomPerson(ctx, sx, n.y - cy, {
          facing: n.facing,
          walk: n.walkT,
          moving: n.vx !== 0,
          air: false,
          cap: n.cap,
          spots: n.spots,
          scale: n.scale,
          blink: (this.time + n.x * 0.37) % 4 < 0.13,
        });
        if (n === this.nearNpc && this.talking?.npc !== n && !this.dead) this.drawBubble(sx, n.y - cy - Math.round(18 * n.scale) - 6);
      }
    }

    // player
    const p = this.p;
    const blinkHurt = p.invuln > 0 && Math.floor(this.time * 18) % 2 === 0;
    if (!blinkHurt) {
      const px = Math.round(p.x - cx);
      const py = Math.round(p.y - cy);
      if (this.dead) {
        ctx.globalAlpha = 0.7;
      }
      drawMushroomPerson(ctx, px, py, {
        facing: p.facing,
        walk: p.walkT,
        moving: Math.abs(p.vx) > 4,
        air: !p.onGround,
        cap: "#d9443a",
        spots: true,
        scale: 1,
        blink: this.dead || p.blinkT < 0,
        armsUp: this.mode === "releasing" && (this.releasing?.t ?? 0) > 0.15,
      });
      ctx.globalAlpha = 1;
    }
    this.drawFishingGear(cx, cy);
    this.drawAttack(cx, cy);

    this.drawParticles(cx, cy, false);
    this.drawFgGrass(cx, cy);
    this.drawFgLeaves(cx, cy);

    // night
    if (night > 0.01) {
      ctx.fillStyle = `rgba(8,14,36,${(night * 0.66).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.drawLights(cx, cy, night);
  }

  private drawTrunkLayer(
    cx: number,
    cy: number,
    factor: number,
    spacing: number,
    minW: number,
    maxW: number,
    color: string,
    stripe: string,
    groundColor: string,
    salt: number,
    horizon: number,
  ) {
    const ctx = this.ctx;
    const cam = cx * factor;
    const baseY = Math.round(GROUND_BASE - horizon - (cy * factor));
    const i0 = Math.floor((cam - maxW * 2) / spacing);
    const i1 = Math.ceil((cam + this.W + maxW) / spacing);
    for (let i = i0; i <= i1; i++) {
      if (hash1(i, salt) < 0.12) continue;
      const w = Math.round(minW + hash1(i, salt + 10) * (maxW - minW));
      const x = Math.round(i * spacing + hash1(i, salt + 20) * spacing * 0.4 - cam);
      ctx.fillStyle = color;
      ctx.fillRect(x, 0, w, baseY);
      for (let r = 0; r < 12; r++) {
        const e = Math.round(Math.pow(r / 12, 2.2) * w * 0.25);
        ctx.fillRect(x - e, baseY - 12 + r, w + e * 2, 1);
      }
      ctx.fillStyle = stripe;
      const n = Math.max(2, Math.floor(w / 14));
      for (let k = 0; k < n; k++) {
        const sx = x + 3 + Math.floor(hash1(i * 7 + k, salt + 30) * (w - 6));
        ctx.fillRect(sx, 0, hash1(i + k, salt + 40) < 0.4 ? 2 : 1, baseY - 4);
      }
      ctx.fillRect(x + w - Math.max(2, Math.round(w * 0.18)), 0, Math.max(2, Math.round(w * 0.18)), baseY - 6);
    }
    // ground band for this layer
    ctx.fillStyle = groundColor;
    for (let x = 0; x < this.W; x += 4) {
      const wx = x + cam;
      const y = baseY + Math.round(Math.sin(wx / 60 + salt) * 3 + Math.sin(wx / 23) * 1.5);
      ctx.fillRect(x, y, 4, this.H - y);
    }
  }

  private drawShafts(cx: number, day: number) {
    const ctx = this.ctx;
    const a = 0.05 + day * 0.07;
    ctx.fillStyle = `rgba(255,238,180,${a.toFixed(3)})`;
    const cam = cx * 0.08;
    for (let i = -1; i < Math.ceil(this.W / 150) + 2; i++) {
      const idx = i + Math.floor(cam / 150);
      const x = idx * 150 - cam + hash1(idx, 77) * 60;
      const w = 10 + hash1(idx, 78) * 22;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w, 0);
      ctx.lineTo(x + w + 70, this.H);
      ctx.lineTo(x + 40, this.H);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawCanopy(cx: number, cy: number, factor: number, color: string, salt: number) {
    const ctx = this.ctx;
    const cam = cx * factor;
    const top = Math.round(-cy * factor) - 30 + salt * 4;
    ctx.fillStyle = color;
    const step = 14;
    const i0 = Math.floor(cam / step) - 2;
    const i1 = Math.ceil((cam + this.W) / step) + 2;
    ctx.fillRect(0, 0, this.W, Math.max(0, top));
    for (let i = i0; i <= i1; i++) {
      const x = Math.round(i * step - cam);
      const r = 8 + Math.floor(hash1(i, salt + 50) * 10);
      fillCircle(ctx, x, top + Math.floor(hash1(i, salt + 51) * 8), r);
      if (hash1(i, salt + 52) < 0.35) {
        // hanging vine
        const len = 10 + Math.floor(hash1(i, salt + 53) * 50);
        ctx.fillRect(x, top, 1, len);
        ctx.fillRect(x - 1, top + len - 2, 3, 2);
      }
    }
  }

  private drawBushes(cx: number, cy: number, factor: number) {
    const ctx = this.ctx;
    const cam = cx * factor;
    const base = Math.round(GROUND_BASE - 2 - cy * factor);
    const step = 22;
    const i0 = Math.floor(cam / step) - 2;
    const i1 = Math.ceil((cam + this.W) / step) + 2;
    ctx.fillStyle = "#24443a";
    for (let i = i0; i <= i1; i++) {
      if (hash1(i, 90) < 0.35) continue;
      const x = Math.round(i * step - cam);
      const r = 6 + Math.floor(hash1(i, 91) * 9);
      fillCircle(ctx, x, base, r);
    }
    ctx.fillRect(0, base, this.W, this.H - base);
  }

  private drawGiantTree(t: GiantTree, cx: number, cy: number) {
    const ctx = this.ctx;
    const sx = Math.round(t.x - cx);
    if (sx > this.W + 40 || sx + t.w < -40) return;
    const g = this.groundAt(t.x + t.w / 2) - cy;
    const flareH = 40;
    const trunkBottom = g - flareH;
    // body
    ctx.fillStyle = "#5a4230";
    ctx.fillRect(sx, 0, t.w, trunkBottom + 1);
    for (let r = 0; r < flareH + 8; r++) {
      const k = Math.min(1, r / flareH);
      const e = Math.round(Math.pow(k, 2.4) * 30);
      ctx.fillRect(sx - e, trunkBottom + r, t.w + e * 2, 1);
    }
    // root ridges
    ctx.fillStyle = "#47331f";
    for (let r = 0; r < flareH + 8; r += 1) {
      const k = Math.min(1, r / flareH);
      const e = Math.round(Math.pow(k, 2.4) * 30);
      ctx.fillRect(sx - e, trunkBottom + r, 2, 1);
      ctx.fillRect(sx + t.w + e - 4, trunkBottom + r, 4, 1);
      ctx.fillRect(sx + Math.round(t.w * 0.3) - Math.round(e * 0.4), trunkBottom + r, 2, 1);
      ctx.fillRect(sx + Math.round(t.w * 0.68) + Math.round(e * 0.4), trunkBottom + r, 2, 1);
    }
    // light & shadow sides
    ctx.fillStyle = "#7a5a3e";
    ctx.fillRect(sx, 0, 3, trunkBottom + 4);
    ctx.fillStyle = "#3e2d21";
    ctx.fillRect(sx + t.w - 6, 0, 6, trunkBottom + 2);
    // grooves
    const rnd = mulberry32(t.seed);
    const n = Math.floor(t.w / 8);
    const off = ((cy % 6) + 6) % 6;
    for (let i = 0; i < n; i++) {
      const gx = sx + 5 + Math.floor(rnd() * (t.w - 12));
      const gw = rnd() < 0.4 ? 2 : 1;
      const ph = rnd() * 10;
      ctx.fillStyle = rnd() < 0.3 ? "#6b4e36" : "#3e2d21";
      for (let y = -off; y < trunkBottom; y += 6) {
        const wobble = Math.round(Math.sin((y + cy) / 23 + ph) * 1.2);
        ctx.fillRect(gx + wobble, y, gw, 6);
      }
    }
    // moss patches
    for (let i = 0; i < 6; i++) {
      const my = Math.round(g - 30 - rnd() * 260);
      const mx = sx + Math.floor(rnd() * (t.w - 14));
      const mw = 6 + Math.floor(rnd() * 12);
      ctx.fillStyle = "#3f6b30";
      ctx.fillRect(mx, my, mw, 3);
      ctx.fillRect(mx + 2, my + 3, mw - 4, 2);
      ctx.fillStyle = "#6a9a45";
      ctx.fillRect(mx + 1, my, mw - 3, 1);
    }
    // knot hole
    const ky = Math.round(g - 90 - rnd() * 60);
    const kx = sx + Math.round(t.w * (0.3 + rnd() * 0.3));
    ctx.fillStyle = "#2a1d14";
    fillCircle(ctx, kx, ky, 4);
    ctx.fillStyle = "#130d09";
    fillCircle(ctx, kx, ky + 1, 2);
    if (t.elder) {
      const dx = sx + Math.round(t.w / 2);
      rect(ctx, "#1b140f", dx - 15, g - 35, 30, 35);
      rect(ctx, "#5fd6c4", dx - 12, g - 32, 24, 2);
      rect(ctx, "#080c09", dx - 12, g - 30, 24, 30);
      rect(ctx, "#5fd6c4", dx - 2, g - 24, 4, 3);
      rect(ctx, "#a8fff0", dx - 1, g - 23, 2, 1);
      rect(ctx, "#7a5536", dx - 18, g - 2, 36, 2);
    }
  }

  private drawPlatform(pl: Platform, cx: number, cy: number) {
    const sx = Math.round(pl.x - cx);
    if (sx > this.W || sx + pl.w < 0) return;
    const sy = Math.round(pl.y - cy);
    const ctx = this.ctx;
    if (pl.kind === "bridge") {
      for (let wx = Math.max(pl.x, cx - 2); wx < Math.min(pl.x + pl.w, cx + this.W + 2); wx += 1) {
        const x = Math.round(wx - cx);
        const y = Math.round(surfaceY(pl, wx) - cy);
        rect(ctx, "#3a281c", x, y, 1, 4);
        if ((Math.floor(wx - pl.x) % 5) !== 4) rect(ctx, "#b38a54", x, y, 1, 2);
        rect(ctx, "#d5bd83", x, y - 14, 1, 1);
        if (Math.floor(wx - pl.x) % 24 === 0) rect(ctx, "#8a6342", x, y - 14, 1, 18);
      }
      return;
    }
    if (pl.kind === "deck") {
      rect(ctx, "#3a281c", sx - 1, sy, pl.w + 2, 7);
      rect(ctx, "#b38a54", sx, sy, pl.w, 2);
      for (let x = 3; x < pl.w; x += 8) rect(ctx, "#6b4a30", sx + x, sy + 2, 1, 4);
      for (const x of [sx + 6, sx + pl.w - 9]) {
        rect(ctx, "#6b4a30", x, sy + 7, 3, 14);
        rect(ctx, "#8a6342", x, sy - 16, 2, 16);
      }
      return;
    }
    const [base, dark, light] = (FUNGUS[pl.color] ?? FUNGUS[0]) as [string, string, string];
    rect(ctx, "#1b140f", sx - 1, sy - 1, pl.w + 2, 3);
    rect(ctx, "#1b140f", sx, sy + 2, pl.w, 2);
    rect(ctx, "#1b140f", sx + 2, sy + 4, pl.w - 4, 2);
    rect(ctx, light, sx, sy, pl.w, 1);
    rect(ctx, base, sx, sy + 1, pl.w, 2);
    rect(ctx, base, sx + 1, sy + 3, pl.w - 2, 1);
    rect(ctx, dark, sx + 3, sy + 4, pl.w - 6, 1);
    for (let i = 3; i < pl.w - 3; i += 5) rect(ctx, dark, sx + i, sy + 2, 2, 1);
  }

  private drawGround(cx: number, cy: number) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const ys: number[] = new Array<number>(W);
    for (let x = 0; x < W; x++) ys[x] = this.groundAt(cx + x) - cy;
    ctx.fillStyle = "#3a2a1f";
    for (let x = 0; x < W; x++) if (ys[x]! < H) ctx.fillRect(x, ys[x]!, 1, H - ys[x]!);
    ctx.fillStyle = "#2b1f17";
    for (let x = 0; x < W; x++) if (ys[x]! + 14 < H) ctx.fillRect(x, ys[x]! + 14, 1, H - ys[x]! - 14);
    ctx.fillStyle = "#3d6e2e";
    for (let x = 0; x < W; x++) ctx.fillRect(x, ys[x]! + 2, 1, 2 + (hash1(cx + x, 5) < 0.3 ? 1 : 0));
    ctx.fillStyle = "#5c9a3c";
    for (let x = 0; x < W; x++) ctx.fillRect(x, ys[x]!, 1, 2);
    ctx.fillStyle = "#86c452";
    for (let x = 0; x < W; x++) if (hash1(cx + x, 6) < 0.45) ctx.fillRect(x, ys[x]!, 1, 1);
    ctx.fillStyle = "#4d3828";
    for (let x = 0; x < W; x++) {
      const h = hash1(cx + x, 7);
      if (h < 0.12) ctx.fillRect(x, ys[x]! + 6 + Math.floor(h * 100) % 18, 1, 1);
    }
    ctx.fillStyle = "#1f1610";
    for (let x = 0; x < W; x++) {
      const h = hash1(cx + x, 8);
      if (h < 0.05) ctx.fillRect(x, ys[x]! + 9 + Math.floor(h * 400) % 20, 2, 1);
    }
  }

  private drawDecor(cx: number, cy: number) {
    const ctx = this.ctx;
    const t = this.time;
    for (const d of this.world.decor) {
      const sx = d.x - cx;
      if (sx < -6 || sx > this.W + 6) continue;
      const gy = this.groundAt(d.x) - cy;
      switch (d.kind) {
        case "grass": {
          const h = 2 + Math.floor(d.v * 4);
          const sway = Math.round(Math.sin(t * 1.6 + d.x * 0.3) * 0.7);
          ctx.fillStyle = d.c === 0 ? "#8cc85a" : d.c === 1 ? "#4f8c36" : "#6fae46";
          ctx.fillRect(sx, gy - h + 1, 1, h - 1);
          ctx.fillRect(sx + sway, gy - h, 1, 1);
          ctx.fillRect(sx + 1, gy - h + 2, 1, h - 2);
          ctx.fillRect(sx - 1, gy - 2, 1, 2);
          break;
        }
        case "flower": {
          const h = 3 + Math.floor(d.v * 3);
          if (d.c === 3) {
            // tiny glowcap mushroom
            rect(ctx, "#d8d0b8", sx, gy - 2, 1, 2);
            rect(ctx, "#5fd6c4", sx - 1, gy - 3, 3, 1);
            rect(ctx, "#a8fff0", sx, gy - 4, 1, 1);
            break;
          }
          rect(ctx, "#4f8c36", sx, gy - h, 1, h);
          const col = d.c === 0 ? "#f2efe0" : d.c === 1 ? "#f2c84b" : "#ea8fa6";
          rect(ctx, col, sx - 1, gy - h - 1, 3, 1);
          rect(ctx, col, sx, gy - h - 2, 1, 3);
          rect(ctx, "#f2c84b", sx, gy - h - 1, 1, 1);
          break;
        }
        case "fern": {
          const h = 6 + Math.floor(d.v * 6);
          ctx.fillStyle = "#3f7f3a";
          for (let i = 0; i < h; i++) {
            const lean = Math.round((i * i) / (h * 2));
            ctx.fillRect(sx + lean, gy - i, 1, 1);
            ctx.fillRect(sx - lean, gy - i, 1, 1);
            if (i % 2 === 0 && i > 1) {
              ctx.fillRect(sx + lean + 1, gy - i, 2, 1);
              ctx.fillRect(sx - lean - 2, gy - i, 2, 1);
            }
          }
          rect(ctx, "#5f9f48", sx, gy - h, 1, h);
          break;
        }
        case "pebble":
          rect(ctx, "#5e5a52", sx, gy - 1, 3, 1);
          rect(ctx, "#8d887c", sx + 1, gy - 2, 2, 1);
          break;
        case "clover":
          rect(ctx, "#4f9a3a", sx, gy - 2, 1, 1);
          rect(ctx, "#4f9a3a", sx + 2, gy - 2, 1, 1);
          rect(ctx, "#4f9a3a", sx + 1, gy - 3, 1, 1);
          rect(ctx, "#3d7a2e", sx + 1, gy - 1, 1, 1);
          break;
        case "leaf":
          rect(ctx, LEAF_COLORS[d.c] ?? "#a8642a", sx, gy - 1, 3, 1);
          rect(ctx, LEAF_COLORS[d.c] ?? "#a8642a", sx + 1, gy - 2, 1, 1);
          break;
      }
    }
  }

  private drawVillage(v: Village, cx: number, cy: number, night: number) {
    const ctx = this.ctx;
    if (Math.abs(v.x - cx - this.W / 2) > this.W / 2 + v.half + 40) return;
    const gy = this.villageFloor(v) - cy;
    // sign post at both entrances
    for (const side of [-1, 1]) {
      const sx = Math.round(v.x + side * (v.half + 10) - cx);
      rect(ctx, "#1b140f", sx - 1, gy - 14, 3, 14);
      rect(ctx, "#7a5536", sx, gy - 14, 1, 14);
      rect(ctx, "#1b140f", sx - 7, gy - 15, 15, 7);
      rect(ctx, "#a87a4c", sx - 6, gy - 14, 13, 5);
      rect(ctx, "#5a3c26", sx - 4, gy - 12, 9, 1);
      rect(ctx, "#5a3c26", sx - 4, gy - 10, 6, 1);
    }
    for (const h of v.houses) {
      const sx = Math.round(h.x - cx);
      drawHouse(ctx, h, sx, gy, night);
    }
    // bunting between lanterns
    const pairs: [number, number][] = [
      [v.lanterns[0]!, v.lanterns[1]!],
      [v.lanterns[2]!, v.lanterns[3]!],
    ];
    const flagCols = ["#d9443a", "#f2c84b", "#5fae8a", "#efe6d2"];
    for (const [a, b] of pairs) {
      const ax = a - cx;
      const bx = b - cx;
      for (let x = Math.ceil(ax); x <= bx; x++) {
        const k = (x - ax) / (bx - ax);
        const y = Math.round(gy - 24 + Math.sin(k * Math.PI) * 6);
        rect(ctx, "#3a2a1f", x, y, 1, 1);
        if ((x - Math.ceil(ax)) % 6 === 3) {
          const c = flagCols[Math.floor((x - ax) / 6) % flagCols.length] ?? "#d9443a";
          rect(ctx, c, x - 1, y + 1, 3, 2);
          rect(ctx, c, x, y + 3, 1, 1);
        }
      }
    }
    // lanterns
    for (const lx of v.lanterns) {
      const sx = Math.round(lx - cx);
      rect(ctx, "#1b140f", sx, gy - 25, 1, 25);
      rect(ctx, "#1b140f", sx - 2, gy - 29, 5, 5);
      rect(ctx, night > 0.2 ? "#ffd56a" : "#e0b45a", sx - 1, gy - 28, 3, 3);
    }
    // campfire
    const fx = Math.round(v.fireX - cx);
    rect(ctx, "#6b6559", fx - 6, gy - 1, 2, 1);
    rect(ctx, "#6b6559", fx + 5, gy - 1, 2, 1);
    rect(ctx, "#8d887c", fx - 5, gy - 2, 2, 2);
    rect(ctx, "#8d887c", fx + 4, gy - 2, 2, 2);
    rect(ctx, "#5a3c26", fx - 4, gy - 2, 9, 1);
    rect(ctx, "#7a5536", fx - 3, gy - 3, 7, 1);
    for (let i = 0; i < 5; i++) {
      const h = 2 + Math.floor(Math.abs(Math.sin(this.time * 11 + i * 1.9)) * 5) + (i === 2 ? 2 : 0);
      rect(ctx, "#e8582a", fx - 2 + i, gy - 3 - h, 1, h);
      rect(ctx, "#ffc24a", fx - 2 + i, gy - 3 - Math.floor(h / 2), 1, Math.floor(h / 2));
    }
    rect(ctx, "#fff1a8", fx, gy - 5, 1, 2);
    // log benches
    rect(ctx, "#5a3c26", fx - 20, gy - 3, 9, 3);
    rect(ctx, "#8a6342", fx - 20, gy - 3, 9, 1);
    rect(ctx, "#5a3c26", fx + 12, gy - 3, 9, 3);
    rect(ctx, "#8a6342", fx + 12, gy - 3, 9, 1);
  }

  private drawBubble(x: number, y: number) {
    const ctx = this.ctx;
    const bob = Math.round(Math.sin(this.time * 4));
    rect(ctx, "#1b140f", x - 5, y - 4 + bob, 11, 7);
    rect(ctx, "#f8f2e4", x - 4, y - 3 + bob, 9, 5);
    rect(ctx, "#f8f2e4", x - 1, y + 2 + bob, 2, 1);
    rect(ctx, "#1b140f", x - 2, y - 1 + bob, 1, 1);
    rect(ctx, "#1b140f", x, y - 1 + bob, 1, 1);
    rect(ctx, "#1b140f", x + 2, y - 1 + bob, 1, 1);
  }

  private drawPuddle(pd: Puddle, cx: number, cy: number) {
    const ctx = this.ctx;
    const sx = Math.round(pd.x - cx);
    if (sx + pd.half < -4 || sx - pd.half > this.W + 4) return;
    const gy = this.groundAt(pd.x) - cy;
    const tick = Math.floor(this.time * 2);
    for (let dx = -pd.half - 2; dx <= pd.half + 2; dx++) {
      const x = sx + dx;
      if (Math.abs(dx) > pd.half) {
        rect(ctx, "#4a3626", x, gy, 1, 2);
        rect(ctx, "#3d6e2e", x, gy - 1, 1, 1);
        continue;
      }
      const k = dx / pd.half;
      const depth = Math.max(1, Math.round(3.4 * Math.sqrt(1 - k * k)));
      rect(ctx, "#2a1f17", x, gy, 1, depth + 2);
      rect(ctx, "#2f5a70", x, gy, 1, depth + 1);
      rect(ctx, "#4f86a0", x, gy, 1, 1);
      if (hash1(pd.x + dx * 13, tick) < 0.1) rect(ctx, "#cfe9f0", x, gy, 1, 1);
    }
    // little reeds at the edges
    rect(ctx, "#4f8c36", sx - pd.half - 3, gy - 6, 1, 6);
    rect(ctx, "#6b4a30", sx - pd.half - 3, gy - 8, 1, 2);
    rect(ctx, "#4f8c36", sx + pd.half + 3, gy - 5, 1, 5);
    rect(ctx, "#4f8c36", sx + pd.half + 4, gy - 3, 1, 3);
    // lily pad
    rect(ctx, "#5fa04a", sx + Math.round(pd.half * 0.4), gy, 3, 1);
  }

  private drawFishingGear(cx: number, cy: number) {
    const ctx = this.ctx;
    const p = this.p;
    const px = Math.round(p.x - cx);
    const py = Math.round(p.y - cy);
    const f = p.facing >= 0 ? 1 : -1;
    const fish = this.fishing;
    if (this.mode === "fishing" && fish) {
      const hx = px + f * 5;
      const hy = py - 6;
      const tx = px + f * 14;
      const ty = py - 18;
      drawLine(ctx, hx, hy, tx, ty, "#2a1d14");
      drawLine(ctx, hx, hy - 1, tx - f, ty, "#8a6342");
      const wy = this.groundAt(fish.puddle.x) - cy;
      const bx = Math.round(fish.bobX - cx);
      const dip = fish.phase === "bite" ? (Math.floor(this.time * 16) % 2) + 1 : Math.round(Math.sin(this.time * 3)) > 0 ? 0 : 1;
      drawLine(ctx, tx, ty, bx, wy - 2 + dip, "#d9d2c0");
      rect(ctx, "#1b140f", bx - 1, wy - 3 + dip, 3, 3);
      rect(ctx, "#e0362c", bx, wy - 3 + dip, 1, 1);
      rect(ctx, "#f8f2e4", bx, wy - 2 + dip, 1, 1);
      if (fish.phase === "bite") {
        const bob = Math.floor(this.time * 10) % 2;
        const ex = px - 1;
        const ey = py - 31 - bob;
        rect(ctx, "#1b140f", ex - 1, ey - 1, 4, 8);
        rect(ctx, "#1b140f", ex - 1, ey + 8, 4, 4);
        rect(ctx, "#ffd84a", ex, ey, 2, 6);
        rect(ctx, "#fff3a0", ex, ey, 1, 3);
        rect(ctx, "#ffd84a", ex, ey + 9, 2, 2);
      }
    }
    const c = this.catchAnim;
    if (c) {
      const k = Math.min(1, c.t / 0.6);
      const x = c.x0 + (p.x - c.x0) * k - cx;
      const y = c.y0 + (p.y - 20 - c.y0) * k - Math.sin(k * Math.PI) * 22 - cy;
      drawFish(ctx, x, y, c.fish, c.x0 < p.x ? -1 : 1);
    }
  }

  private drawReleaseLight(
    cx: number,
    cy: number,
    glow: (x: number, y: number, r: number, rgb: string, a: number) => void,
  ) {
    const r = this.releasing;
    if (!r) return;
    const ctx = this.ctx;
    const t = r.t;
    const inA = clamp((t - 0.25) / 0.6, 0, 1);
    const outA = t > RELEASE_TIME - 0.7 ? clamp((RELEASE_TIME - t) / 0.7, 0, 1) : 1;
    const a = inA * outA * (0.9 + Math.sin(this.time * 9) * 0.1);
    if (a <= 0) return;
    const px = Math.round(this.p.x - cx);
    const py = Math.round(this.p.y - cy);
    ctx.globalCompositeOperation = "lighter";
    for (const [w, al] of [[30, 0.16], [18, 0.24], [8, 0.34]] as const) {
      const g = ctx.createLinearGradient(px - w / 2, 0, px + w / 2, 0);
      g.addColorStop(0, "rgba(255,215,80,0)");
      g.addColorStop(0.5, `rgba(255,225,110,${(al * a).toFixed(3)})`);
      g.addColorStop(1, "rgba(255,215,80,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - w / 2, 0, w, py + 2);
    }
    glow(px, py - 8, 34, "255,210,90", 0.22 * a);
    glow(px, py + 2, 18, "255,230,140", 0.15 * a);
    const fp = this.releaseFishPos();
    if (fp) glow(fp.x - cx, fp.y - cy, 16, "255,240,170", 0.7 * a * fp.a);
    ctx.globalCompositeOperation = "source-over";
  }

  private drawReleaseFish(cx: number, cy: number) {
    const r = this.releasing;
    const fp = this.releaseFishPos();
    if (!r || !fp || fp.a <= 0) return;
    this.ctx.globalAlpha = fp.a;
    const flip = r.t > 1.2 && Math.floor(r.t * 4) % 2 === 0 ? -1 : 1;
    drawFish(this.ctx, fp.x - cx, fp.y - cy, r.fish, flip);
    this.ctx.globalAlpha = 1;
  }

  private drawParticles(cx: number, cy: number, glowOnly: boolean) {
    const ctx = this.ctx;
    for (const q of this.particles) {
      if ((q.kind === "firefly" || q.kind === "star") !== glowOnly) continue;
      const sx = Math.round(q.x - cx);
      const sy = Math.round(q.y - cy);
      if (sx < -4 || sx > this.W + 4) continue;
      const a = Math.min(1, q.life / Math.min(0.6, q.max));
      ctx.globalAlpha = q.kind === "smoke" ? a * 0.35 : a;
      ctx.fillStyle = q.color;
      if (q.kind === "ripple") {
        const sp = Math.round((1 - q.life / q.max) * 7);
        ctx.fillRect(sx - sp - 1, sy, 2, 1);
        ctx.fillRect(sx + sp, sy, 2, 1);
      } else if (q.kind === "star") {
        ctx.fillRect(sx, sy, 1, 1);
        if (q.life > q.max * 0.5) {
          ctx.globalAlpha = a * 0.5;
          ctx.fillRect(sx - 1, sy, 3, 1);
          ctx.fillRect(sx, sy - 1, 1, 3);
        }
      } else if (q.kind === "heart") {
        ctx.fillRect(sx - 1, sy, 1, 1);
        ctx.fillRect(sx + 1, sy, 1, 1);
        ctx.fillRect(sx - 1, sy + 1, 3, 1);
        ctx.fillRect(sx, sy + 2, 1, 1);
      } else if (q.kind === "leaf") {
        const flip = Math.sin(this.time * 3 + q.phase) > 0;
        ctx.fillRect(sx, sy, flip ? 2 : 1, 1);
      } else if (q.kind === "smoke") {
        const s = q.size + Math.floor((1 - q.life / q.max) * 3);
        ctx.fillRect(sx - (s >> 1), sy - (s >> 1), s, s);
      } else {
        ctx.fillRect(sx, sy, q.size, q.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawFgGrass(cx: number, cy: number) {
    const ctx = this.ctx;
    for (const d of this.world.fgGrass) {
      const sx = d.x - cx;
      if (sx < -10 || sx > this.W + 10) continue;
      const gy = this.groundAt(d.x) - cy + 2;
      const blades = 3 + Math.floor(d.v * 4);
      for (let b = 0; b < blades; b++) {
        const h = 7 + Math.floor(hash1(d.x + b, 11) * 10);
        const lean = (hash1(d.x + b, 12) - 0.5) * 1.6 + Math.sin(this.time * 1.3 + d.x * 0.1) * 0.25;
        ctx.fillStyle = b % 2 ? "#1f3d24" : "#2a5230";
        for (let i = 0; i < h; i++) {
          const ox = Math.round(lean * (i * i) / h);
          ctx.fillRect(sx + b * 2 - blades + ox, gy - i, i < h * 0.6 ? 2 : 1, 1);
        }
      }
    }
  }

  private drawFgLeaves(cx: number, cy: number) {
    const ctx = this.ctx;
    const f = 1.35;
    const cam = cx * f;
    const step = 260;
    const base = this.H + 6 - Math.max(0, Math.round((this.groundAt(cx + this.W / 2) - cy - (this.H - 38)) * 0.3));
    ctx.fillStyle = "#0c1c14";
    const i0 = Math.floor(cam / step) - 1;
    const i1 = Math.ceil((cam + this.W) / step) + 1;
    for (let i = i0; i <= i1; i++) {
      if (hash1(i, 200) < 0.4) continue;
      const x = Math.round(i * step + hash1(i, 201) * 120 - cam);
      const r = 10 + Math.floor(hash1(i, 202) * 10);
      fillCircle(ctx, x, base, r);
      fillCircle(ctx, x + r, base + 4, Math.round(r * 0.7));
      // a tall blade
      for (let k = 0; k < 26; k++) ctx.fillRect(x - 4 + Math.round((k * k) / 60), base - r - k, 2, 1);
    }
  }

  private drawLights(cx: number, cy: number, night: number) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "lighter";
    const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
      if (x < -r || x > this.W + r || a <= 0.01) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const v of this.world.villages) {
      if (Math.abs(v.x - cx - this.W / 2) > this.W + v.half) continue;
      const gy = this.villageFloor(v) - cy;
      const flick = 0.85 + Math.sin(this.time * 13) * 0.08 + Math.sin(this.time * 7.3) * 0.07;
      glow(v.fireX - cx, gy - 6, 50, "255,150,60", (0.18 + night * 0.4) * flick);
      for (const lx of v.lanterns) glow(lx - cx, gy - 27, 26, "255,200,100", night * 0.45);
      for (const h of v.houses) if (h.stemH > 22) glow(h.x - h.stemW / 2 + 4 - cx, gy - h.stemH + 6, 10, "255,210,110", night * 0.5);
    }
    if (night > 0.05) {
      for (const d of this.world.decor) {
        if (d.kind !== "flower" || d.c !== 3) continue;
        const sx = d.x - cx;
        if (sx < -10 || sx > this.W + 10) continue;
        glow(sx, this.groundAt(d.x) - cy - 3, 7, "90,230,210", night * 0.55);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    for (const q of this.particles) {
      if (q.kind !== "firefly") continue;
      const a = Math.min(1, q.life / 1.2) * (0.6 + Math.sin(this.time * 5 + q.phase) * 0.4);
      ctx.globalCompositeOperation = "lighter";
      glow(q.x - cx, q.y - cy, 5, "200,255,120", a * 0.5);
      ctx.globalCompositeOperation = "source-over";
    }
    this.drawReleaseLight(cx, cy, glow);
    this.drawParticles(cx, cy, true);
    this.drawReleaseFish(cx, cy);
    if (this.dead) {
      ctx.fillStyle = "rgba(20,8,8,0.35)";
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }
}
