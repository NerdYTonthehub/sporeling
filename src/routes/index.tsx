import { createFileRoute } from "@tanstack/react-router";
import { GameScreen } from "@/components/game/GameScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sporeling — play the tiny mushroom forest game" },
      {
        name: "description",
        content: "Walk a tiny mushroom through a giant pixel forest, eat apples, and discover hidden mushroom villages.",
      },
      { property: "og:title", content: "Sporeling — play the tiny mushroom forest game" },
      {
        property: "og:description",
        content: "Walk a tiny mushroom through a giant pixel forest, eat apples, and discover hidden mushroom villages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <GameScreen />;
}
