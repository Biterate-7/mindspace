import { memo } from "react";

/**
 * Tiny 1-bit pixel icons drawn from ASCII bitmaps. They render as a single SVG path
 * in `currentColor`, so they inherit text colour and stay crisp at any size.
 */

const BITMAPS = {
  star: [
    "....#....",
    "....#....",
    "...###...",
    ".#######.",
    "...###...",
    "....#....",
    "....#....",
  ],
  planet: [
    "....###....",
    "...#####...",
    "..#######..",
    "###########",
    "..#######..",
    "...#####...",
    "....###....",
  ],
  rocket: [
    "....#....",
    "...###...",
    "...#.#...",
    "...###...",
    "..#####..",
    ".##.#.##.",
    ".#..#..#.",
    "...#.#...",
  ],
  telescope: [
    "........##.",
    "......####.",
    "....####...",
    "..####.....",
    ".##..#.....",
    ".....#.....",
    "....#.#....",
    "...#...#...",
    "..#.....#..",
  ],
  comet: [
    "#.......",
    ".#......",
    "..##....",
    "...###..",
    "....####",
    "....####",
    ".....##.",
  ],
  constellation: [
    "#.........",
    ".#........",
    "..#...#...",
    "...#.#.#..",
    "....#...#.",
    ".........#",
  ],
  satellite: [
    "##.....##",
    "##.....##",
    "##.###.##",
    "#########",
    "##.###.##",
    "##..#..##",
    "##.....##",
  ],
} as const;

export type PixelIconName = keyof typeof BITMAPS;

function toPath(rows: readonly string[]): string {
  let d = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "#") {
        x++;
        continue;
      }
      let len = 1;
      while (row[x + len] === "#") len++;
      d += `M${x} ${y}h${len}v1h-${len}z`;
      x += len;
    }
  });
  return d;
}

const PATHS = Object.fromEntries(Object.entries(BITMAPS).map(([name, rows]) => [name, { d: toPath(rows), w: rows[0].length, h: rows.length }])) as Record<
  PixelIconName,
  { d: string; w: number; h: number }
>;

export const PixelIcon = memo(function PixelIcon({ name, scale = 2, className }: { name: PixelIconName; scale?: number; className?: string }) {
  const { d, w, h } = PATHS[name];
  return (
    <svg width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden="true" className={className}>
      <path d={d} fill="currentColor" />
    </svg>
  );
});

/** The Mindspace mark: a pixel star with a lavender cross, matching the favicon. */
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <path fill="#5b3fd1" d="M7 1h2v3H7zM7 12h2v3H7zM1 7h3v2H1zM12 7h3v2h-3z" />
      <path fill="#b39cff" d="M7 4h2v1H7zM7 11h2v1H7zM4 7h1v2H4zM11 7h1v2h-1zM5 5h1v1H5zM10 5h1v1h-1zM5 10h1v1H5zM10 10h1v1h-1z" />
      <path fill="#fff" d="M6 6h4v4H6z" />
      <path fill="#e9deff" d="M6 6h1v1H6z" />
    </svg>
  );
}
