// Crisp pixel icons rendered as SVG rects from a tiny character grid.
const ICONS: Record<string, { grid: string[]; colors: Record<string, string> }> = {
  heart: {
    grid: [
      ".KK.KK.",
      "KRRKRWK",
      "KRRRRRK",
      "KRRRRRK",
      ".KRRRK.",
      "..KRK..",
      "...K...",
    ],
    colors: { K: "#1b140f", R: "#e0362c", W: "#ffb3a8" },
  },
  apple: {
    grid: [
      "...BG..",
      "..KBK..",
      ".KRRRK.",
      "KRWRRRK",
      "KRRRRRK",
      "KRRRRRK",
      ".KRRRK.",
      "..KKK..",
    ],
    colors: { K: "#1b140f", R: "#d7362a", W: "#ff9a80", B: "#5a3a22", G: "#6fb24c" },
  },
  shroom: {
    grid: [
      "..KKKKK..",
      ".KRRWRRK.",
      "KRWRRRRRK",
      "KKKKKKKKK",
      "..KCCCK..",
      "..KCKCK..",
      "..KCCCK..",
      "...KKK...",
    ],
    colors: { K: "#1b140f", R: "#d9443a", W: "#f8f2e4", C: "#f1e4c8" },
  },
};

export function PixelIcon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  const icon = ICONS[name]!;
  const h = icon.grid.length;
  const w = icon.grid[0]?.length ?? 0;
  return (
    <svg
      width={(size * w) / h}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {icon.grid.flatMap((row, y) =>
        row.split("").map((c, x) =>
          c === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={icon.colors[c]} />,
        ),
      )}
    </svg>
  );
}
