// Game loop, physics, interactions and rendering for the mushroom sidescroller.
import { appleTreeGeom, drawAppleTree, drawBeetle, drawHouse, drawMushroomPerson, fillCircle, rect } from "./sprites";
import { sfx } from "./sfx";
import { eatApple, isDead, takeDamage, tickVitals, type Vitals } from "./vitals";
import {
  GROUND_BASE,
  WORLD_W,
  generateWorld,
  hash1,
  mulberry32,
  type GiantTree,
  type Npc,
  type Platform,
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
const BEETLE_DAMAGE = 15;
const DAY_LENGTH = 240;
const START_X = 230;

export type Key = "left" | "right" | "jump" | "down" | "act";

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
  compass: { name: string; dir: -1 | 1; steps: number } | null;
  resting: boolean;
  starving: boolean;
  applesEaten: number;
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
  kind: "leaf" | "spark" | "smoke" | "heart" | "firefly" | "dust" | "bit";
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
  private ground!: Int16Array;
  private p!: Player;
  private vitals!: Vitals;
  private keys: Record<Key, boolean> = { left: false, right: false, jump: false, down: false, act: false };
  private pressed = new Set<Key>();
  private camX = 0;
  private camY = 0;
  private time = 0;
  private particles: Particle[] = [];
  private talking: { npc: Npc; idx: number } | null = null;
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
    this.ground = new Int16Array(WORLD_W + 1);
    for (let x = 0; x <= WORLD_W; x++) this.ground[x] = groundY(x);
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
  }

  private groundAt(x: number) {
    const i = x < 0 ? 0 : x > WORLD_W ? WORLD_W : x | 0;
    return this.ground[i];
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
    this.time += dt;
    const p = this.p;
    const active = this.running && !this.dead;

    if (active) {
      const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      if (dir) {
        p.vx += dir * ACCEL * dt;
        p.facing = dir;
      } else {
        const fr = FRICTION * dt;
        p.vx = Math.abs(p.vx) <= fr ? 0 : p.vx - Math.sign(p.vx) * fr;
      }
      if (Math.abs(p.vx) > MAX_SPEED) {
        p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx) - MAX_SPEED, 500 * dt);
      }
      if (this.pressed.has("jump")) p.jumpBuf = 0.12;
      if (this.pressed.has("down") && p.plat) {
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
        sfx.jump();
        this.dust(p.x, p.y, 4);
      }
      if (!this.keys.jump && p.vy < -90) p.vy = -90;
    } else {
      p.vx *= 0.9;
    }

    p.jumpBuf -= dt;
    p.coyote -= dt;
    p.dropT -= dt;
    p.invuln -= dt;
    p.blinkT -= dt;
    if (p.blinkT < -0.12) p.blinkT = 2 + Math.random() * 3;

    p.vy = Math.min(400, p.vy + GRAVITY * dt);
    const prevY = p.y;
    p.x = clamp(p.x + p.vx * dt, 12, WORLD_W - 12);
    p.y += p.vy * dt;

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
    if (!landed && p.vy >= 0 && p.dropT <= 0) {
      for (const pl of this.world.platforms) {
        if (p.x + 3 < pl.x || p.x - 3 > pl.x + pl.w) continue;
        if (prevY <= pl.y + 0.01 && p.y >= pl.y) {
          p.y = pl.y;
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
    } else {
      p.onGround = false;
      p.plat = null;
    }
    if (p.onGround && Math.abs(p.vx) > 4) p.walkT += dt * (Math.abs(p.vx) / MAX_SPEED);

    // vitals
    this.nearFire = this.world.villages.some(
      (v) => Math.abs(p.x - v.fireX) < 26 && Math.abs(p.y - this.groundAt(v.fireX)) < 6,
    );
    if (active) {
      this.vitals = tickVitals(this.vitals, dt, { nearFire: this.nearFire });
      if (this.nearFire && this.vitals.health < 100 && Math.random() < dt * 4) {
        this.spawn({ x: p.x + (Math.random() * 10 - 5), y: p.y - 18, vx: 0, vy: -14, life: 1, color: "#ff5a6a", size: 1, grav: 0, kind: "heart" });
      }
      if (isDead(this.vitals)) this.die();
    }

    // village discovery
    for (const v of this.world.villages) {
      if (!v.discovered && Math.abs(p.x - v.x) < v.half && active) {
        v.discovered = true;
        const found = this.world.villages.filter((x) => x.discovered).length;
        const total = this.world.villages.length;
        this.banner = {
          title: v.name,
          sub: found === total ? "You found every mushroom village!" : `Village discovered · ${found}/${total}`,
          t: 4,
        };
        sfx.discover();
      }
    }
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }

    this.updateNpcs(dt);
    this.updateBeetles(dt, active);
    this.updateApples(dt);
    if (active) this.updateInteract();
    else this.prompt = null;
    this.updateParticles(dt);

    // camera
    const targetX = clamp(p.x - this.W / 2 + p.facing * 18, 0, WORLD_W - this.W);
    this.camX += (targetX - this.camX) * Math.min(1, dt * 4);
    const maxY = this.groundAt(p.x) + 38 - this.H;
    const targetY = Math.min(p.y - this.H * 0.64, maxY);
    this.camY += (targetY - this.camY) * Math.min(1, dt * 3);
    this.shakeT -= dt;

    this.pressed.clear();
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.emitHud();
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
        n.y = this.groundAt(n.x);
        if (n.vx) n.walkT += dt * 0.5;
      }
    }
  }

  private updateBeetles(dt: number, active: boolean) {
    const p = this.p;
    for (const b of this.world.beetles) {
      if (!b.alive) {
        b.respawn -= dt;
        if (b.respawn <= 0 && Math.abs(b.x - p.x) > this.W) b.alive = true;
        continue;
      }
      if (Math.abs(b.x - p.x) > this.W * 2) continue;
      b.x += b.vx * dt;
      if (b.x < b.minX) b.vx = Math.abs(b.vx);
      if (b.x > b.maxX) b.vx = -Math.abs(b.vx);
      b.y = this.groundAt(b.x);
      b.walkT += dt;
      if (!active) continue;
      if (Math.abs(b.x - p.x) < 8 && p.y > b.y - 8 && p.y - 15 < b.y) {
        if (p.vy > 20 && p.y < b.y - 2) {
          b.alive = false;
          b.respawn = 30;
          p.vy = -180;
          p.onGround = false;
          sfx.stomp();
          for (let i = 0; i < 8; i++) {
            this.spawn({ x: b.x, y: b.y - 4, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.8, color: i % 2 ? "#1f2e2b" : "#4d8a7c", size: 1, grav: 300, kind: "bit" });
          }
        } else if (p.invuln <= 0) {
          this.vitals = takeDamage(this.vitals, BEETLE_DAMAGE);
          p.invuln = 1.2;
          p.vx = (Math.sign(p.x - b.x) || 1) * 150;
          p.vy = -140;
          p.onGround = false;
          p.plat = null;
          this.shakeT = 0.25;
          sfx.hurt();
          if (isDead(this.vitals)) this.die();
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
    const p = this.p;
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
    const tree = this.world.appleTrees.find(
      (t) => Math.abs(t.x - p.x) < 16 && Math.abs(this.groundAt(t.x) - p.y) < 30 && t.apples.some((a) => a.grown),
    );

    if (this.talking && Math.abs(this.talking.npc.x - p.x) > 40) this.talking = null;

    if (this.talking) this.prompt = "E · next";
    else if (nearNpc) this.prompt = `E · talk to ${nearNpc.name}`;
    else if (tree) this.prompt = `E · eat apple (${tree.apples.filter((a) => a.grown).length} left)`;
    else if (this.nearFire) this.prompt = this.vitals.health < 100 ? "Resting by the fire…" : "A cosy campfire";
    else this.prompt = null;

    if (this.pressed.has("act")) {
      if (this.talking) {
        this.talking.idx++;
        if (this.talking.idx >= this.talking.npc.lines.length) this.talking = null;
        else sfx.talk();
      } else if (nearNpc) {
        this.talking = { npc: nearNpc, idx: 0 };
        sfx.talk();
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
      }
      this.emitHud();
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
    // falling leaves from the canopy
    if (Math.random() < dt * 2.2) {
      this.spawn({
        x: this.camX + Math.random() * (this.W + 60) - 30,
        y: this.camY - 5,
        vx: -4 + Math.random() * 10,
        vy: 9 + Math.random() * 7,
        life: 25,
        color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
        size: 1,
        grav: 0,
        kind: "leaf",
      });
    }
    // fireflies at night
    if (night > 0.3 && Math.random() < dt * 3 * night) {
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
    for (const v of this.world.villages) {
      if (Math.abs(v.fireX - this.camX - this.W / 2) > this.W) continue;
      const gy = this.groundAt(v.fireX);
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
      compass = { name: v.name, dir: v.x >= p.x ? 1 : -1, steps: Math.round(Math.abs(v.x - p.x) / 8) };
    }
    const tk = this.talking;
    this.onHud({
      health: this.vitals.health,
      hunger: this.vitals.hunger,
      found: villages.length - undiscovered.length,
      total: villages.length,
      prompt: this.dead || !this.running ? null : this.prompt,
      dialog: tk ? { name: tk.npc.name, text: tk.npc.lines[tk.idx], page: tk.idx + 1, pages: tk.npc.lines.length } : null,
      banner: this.banner ? { title: this.banner.title, sub: this.banner.sub } : null,
      dead: this.dead,
      timeOfDay: this.timeLabel(),
      compass,
      resting: this.nearFire && this.vitals.health < 100,
      starving: this.vitals.hunger <= 0,
      applesEaten: this.applesEaten,
    });
  }

  // ---------- render ----------
  private render() {
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
    for (const v of this.world.villages) this.drawVillage(v, cx, cy, night);
    for (const t of this.world.appleTrees) {
      const sx = t.x - cx;
      if (sx < -30 || sx > W + 30) continue;
      drawAppleTree(ctx, sx, this.groundAt(t.x) - cy, t.size, t.apples, Math.sin(this.time * 0.8 + t.x) * 0.6);
    }
    this.drawDecor(cx, cy);
    for (const b of this.world.beetles) {
      if (!b.alive) continue;
      const sx = Math.round(b.x - cx);
      if (sx < -20 || sx > W + 20) continue;
      drawBeetle(ctx, sx, b.y - cy, Math.sign(b.vx), b.walkT);
    }
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
      });
      ctx.globalAlpha = 1;
    }

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
  }

  private drawPlatform(pl: Platform, cx: number, cy: number) {
    const sx = Math.round(pl.x - cx);
    if (sx > this.W || sx + pl.w < 0) return;
    const sy = Math.round(pl.y - cy);
    const [base, dark, light] = FUNGUS[pl.color];
    const ctx = this.ctx;
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
    const ys = new Int16Array(W);
    for (let x = 0; x < W; x++) ys[x] = this.groundAt(cx + x) - cy;
    ctx.fillStyle = "#3a2a1f";
    for (let x = 0; x < W; x++) if (ys[x] < H) ctx.fillRect(x, ys[x], 1, H - ys[x]);
    ctx.fillStyle = "#2b1f17";
    for (let x = 0; x < W; x++) if (ys[x] + 14 < H) ctx.fillRect(x, ys[x] + 14, 1, H - ys[x] - 14);
    ctx.fillStyle = "#3d6e2e";
    for (let x = 0; x < W; x++) ctx.fillRect(x, ys[x] + 2, 1, 2 + (hash1(cx + x, 5) < 0.3 ? 1 : 0));
    ctx.fillStyle = "#5c9a3c";
    for (let x = 0; x < W; x++) ctx.fillRect(x, ys[x], 1, 2);
    ctx.fillStyle = "#86c452";
    for (let x = 0; x < W; x++) if (hash1(cx + x, 6) < 0.45) ctx.fillRect(x, ys[x], 1, 1);
    ctx.fillStyle = "#4d3828";
    for (let x = 0; x < W; x++) {
      const h = hash1(cx + x, 7);
      if (h < 0.12) ctx.fillRect(x, ys[x] + 6 + Math.floor(h * 100) % 18, 1, 1);
    }
    ctx.fillStyle = "#1f1610";
    for (let x = 0; x < W; x++) {
      const h = hash1(cx + x, 8);
      if (h < 0.05) ctx.fillRect(x, ys[x] + 9 + Math.floor(h * 400) % 20, 2, 1);
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
          rect(ctx, LEAF_COLORS[d.c], sx, gy - 1, 3, 1);
          rect(ctx, LEAF_COLORS[d.c], sx + 1, gy - 2, 1, 1);
          break;
      }
    }
  }

  private drawVillage(v: Village, cx: number, cy: number, night: number) {
    const ctx = this.ctx;
    if (Math.abs(v.x - cx - this.W / 2) > this.W / 2 + v.half + 40) return;
    const gy = this.groundAt(v.x) - cy;
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
      [v.lanterns[0], v.lanterns[1]],
      [v.lanterns[2], v.lanterns[3]],
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
          const c = flagCols[Math.floor((x - ax) / 6) % flagCols.length];
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

  private drawParticles(cx: number, cy: number, glowOnly: boolean) {
    const ctx = this.ctx;
    for (const q of this.particles) {
      if ((q.kind === "firefly") !== glowOnly) continue;
      const sx = Math.round(q.x - cx);
      const sy = Math.round(q.y - cy);
      if (sx < -4 || sx > this.W + 4) continue;
      const a = Math.min(1, q.life / Math.min(0.6, q.max));
      ctx.globalAlpha = q.kind === "smoke" ? a * 0.35 : a;
      ctx.fillStyle = q.color;
      if (q.kind === "heart") {
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
      const gy = this.groundAt(v.x) - cy;
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
    this.drawParticles(cx, cy, true);
    if (this.dead) {
      ctx.fillStyle = "rgba(20,8,8,0.35)";
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }
}
