import { createFileRoute } from "@tanstack/react-router";
import { handlePartyApi } from "@/game/partyServer";

export const Route = createFileRoute("/api/party")({
  server: {
    handlers: {
      GET: ({ request }) => handlePartyApi(request),
      POST: ({ request }) => handlePartyApi(request),
    },
  },
});
