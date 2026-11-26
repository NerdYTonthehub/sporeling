import { describe, expect, it } from "vitest";
import { PartyStore, handlePartyApi } from "./partyServer";
import { MUSHROOM_COLORS, PARTY_MAX } from "./partyShared";

describe("party crossplay & colors", () => {
  it("provides 10 distinct mushroom colors for up to 10 players", () => {
    expect(PARTY_MAX).toBe(10);
    expect(MUSHROOM_COLORS).toHaveLength(10);
    expect(new Set(MUSHROOM_COLORS.map((c) => c.id)).size).toBe(10);
    expect(new Set(MUSHROOM_COLORS.map((c) => c.hex)).size).toBe(10);
  });

  it("lets admin create a party with a code, enforces unique colors, and caps at 10 players", () => {
    const store = new PartyStore();
    const created = store.create({
      playerId: "admin-1",
      name: "HostShroom",
      colorId: "red",
      worldState: { worldSeed: 777, doorTreeIdx: 2, discovered: ["Mossbottom"], dungeonCleared: false, godDefeated: false },
    });
    expect(created.status).toBe(200);
    const party = created.body["party"] as { code: string; adminId: string; worldState: { worldSeed: number } };
    expect(party.code.length).toBeGreaterThanOrEqual(4);
    expect(party.adminId).toBe("admin-1");
    expect(party.worldState.worldSeed).toBe(777);

    // Same color as admin is rejected
    const dup = store.join({ code: party.code, playerId: "guest-1", name: "G1", colorId: "red" });
    expect(dup.status).toBe(409);

    // Fill remaining 9 slots with the other 9 unique colors (10 total)
    for (let i = 1; i <= 9; i++) {
      const col = MUSHROOM_COLORS[i]!.id;
      const joined = store.join({ code: party.code, playerId: `guest-${i}`, name: `Guest${i}`, colorId: col });
      expect(joined.status).toBe(200);
    }

    const preview = store.preview(party.code);
    expect(preview?.memberCount).toBe(10);
    expect(preview?.takenColorIds).toHaveLength(10);

    // 11th player rejected
    const overflow = store.join({ code: party.code, playerId: "guest-11", name: "Extra", colorId: "blue" });
    expect(overflow.status).toBe(409);
  });

  it("keeps admin world authoritative and blocks non-member signaling", () => {
    const store = new PartyStore();
    const created = store.create({
      playerId: "admin-1",
      colorId: "red",
      worldState: { worldSeed: 42, doorTreeIdx: 1, discovered: ["Mossbottom"], dungeonCleared: false, godDefeated: false },
    });
    const code = (created.body["party"] as { code: string }).code;
    store.join({ code, playerId: "guest-1", colorId: "blue" });

    // Guest cannot overwrite admin worldSeed with malicious/stale worldState
    const res = store.sync({
      code,
      playerId: "guest-1",
      pose: { scene: "forest", x: 920, y: 180, vx: 12, facing: 1, walkT: 1, onGround: true },
      worldState: { worldSeed: 999999, doorTreeIdx: 0, discovered: [], dungeonCleared: true, godDefeated: true },
    });
    expect(res.status).toBe(200);
    expect((res.body["party"] as { worldState: { worldSeed: number } }).worldState.worldSeed).toBe(42);

    // Outsider cannot send WebRTC signal into room
    const badSig = store.signal({ code, playerId: "outsider", to: "admin-1", kind: "offer", payload: {} });
    expect(badSig.status).toBe(404);
  });

  it("serves GET previews and rejects invalid POST JSON safely", async () => {
    const store = new PartyStore();
    const createReq = new Request("http://localhost/api/party", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", playerId: "hostA", colorId: "green" }),
    });
    const createRes = await handlePartyApi(createReq, store);
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { party: { code: string } };

    const getRes = await handlePartyApi(new Request(`http://localhost/api/party?code=${created.party.code}`), store);
    expect(getRes.status).toBe(200);
    const previewData = (await getRes.json()) as { preview: { takenColorIds: string[] } };
    expect(previewData.preview.takenColorIds).toEqual(["green"]);

    const badRes = await handlePartyApi(
      new Request("http://localhost/api/party", { method: "POST", body: "not-json" }),
      store,
    );
    expect(badRes.status).toBe(400);
  });
});
