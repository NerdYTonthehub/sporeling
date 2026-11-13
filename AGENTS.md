<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- The game runs in a plain canvas engine under `src/game/` (world gen, engine loop, sprites, sfx); React (`src/components/game/`) only renders the HUD/overlays from a throttled `onHud` callback — keeps 60fps rendering out of React.
- Health/hunger rules live as pure functions in `src/game/vitals.ts` with tests in `vitals.test.ts` — change numbers there, not inside the engine.
- Fishing rules, fish species, inventory helpers and the shared fish pixel grid live in `src/game/fishing.ts` (tested in `fishing.test.ts`); the engine owns the inventory and exposes `releaseFish(id)` for the React fish bag — one source of truth for both canvas and HUD.
- All game art is drawn procedurally with integer `fillRect`s on a low-res canvas (225px tall) scaled with `image-rendering: pixelated` — keeps a consistent pixel look without sprite assets.
- Scene-specific canvas renderers draw forest, dungeon, and top-down rooms; the engine owns transitions and progression so React never simulates gameplay.
- Game controls use the shared GameButton; settings map keyboard codes through the pure settings helpers and persist only device preferences locally, keeping menus and remapped gameplay consistent.
