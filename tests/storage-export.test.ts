import { describe, expect, it } from "vitest";
import type { MindMap } from "@/types/graph";
import { generateMap } from "@/lib/generation";
import { computeExportGeometry, computeFrameLayout, exportFileName, graphBounds, FRAME } from "@/lib/export/geometry";
import { createMemoryDriver, type KeyValueDriver } from "@/lib/storage/driver";
import { MapRepository, parseMap, serializeMap } from "@/lib/storage/maps";

function makeMap(id: string, topic: string, updatedAt = 1000): MindMap {
  const result = generateMap("topic", topic);
  return { id, title: result.title, createdAt: 1, updatedAt, starred: false, source: { mode: "topic", input: topic }, viewport: { x: 10, y: 20, zoom: 0.8 }, ...result.graph };
}

describe("storage", () => {
  it("serialises and restores a map exactly", () => {
    const map = makeMap("m1", "How the human brain learns");
    expect(parseMap(serializeMap(map))).toEqual(map);
  });

  it("returns null for malformed data instead of throwing", () => {
    expect(parseMap(null)).toBeNull();
    expect(parseMap("{not json")).toBeNull();
    expect(parseMap(JSON.stringify({ version: 1, map: { id: 3 } }))).toBeNull();
    const partial = parseMap(JSON.stringify({ version: 1, map: { id: "x", nodes: [], edges: [], viewport: { x: "a" } } }));
    expect(partial).toMatchObject({ id: "x", title: "Untitled map", starred: false, source: { mode: "topic", input: "" } });
    expect(partial?.viewport).toBeUndefined();
  });

  it("saves, lists newest first, loads and deletes maps", () => {
    const repo = new MapRepository(createMemoryDriver());
    repo.save(makeMap("old", "Climate change", 100));
    repo.save(makeMap("new", "Space exploration", 200));
    expect(repo.list().map((m) => m.id)).toEqual(["new", "old"]);
    expect(repo.load("old")?.title).toBe("Climate change");
    repo.remove("old");
    expect(repo.list().map((m) => m.id)).toEqual(["new"]);
    expect(repo.load("old")).toBeNull();
  });

  it("rebuilds a corrupt index and skips unreadable maps", () => {
    const driver = createMemoryDriver();
    const repo = new MapRepository(driver);
    repo.save(makeMap("a", "Music theory"));
    driver.set("mindspace:v1:index", "garbage");
    driver.set("mindspace:v1:map:broken", "{oops");
    expect(repo.list().map((m) => m.id)).toEqual(["a"]);
  });

  it("clears only Mindspace keys and survives preference corruption", () => {
    const driver = createMemoryDriver({ "other-app": "keep me" });
    const repo = new MapRepository(driver);
    repo.save(makeMap("a", "Music theory"));
    repo.savePrefs({ lastMapId: "a", sidebarOpen: false, minimapOpen: true, exportFrame: false, exportBackground: "plain" });
    expect(repo.loadPrefs()).toMatchObject({ lastMapId: "a", minimapOpen: true, exportBackground: "plain" });
    driver.set("mindspace:v1:prefs", "[1,2]");
    expect(repo.loadPrefs().lastMapId).toBeNull();
    repo.clearAll();
    expect(driver.keys()).toEqual(["other-app"]);
  });

  it("reports write failures such as a full quota", () => {
    const full: KeyValueDriver = {
      ...createMemoryDriver(),
      set: () => {
        const error = new Error("exceeded");
        error.name = "QuotaExceededError";
        throw error;
      },
    };
    expect(() => new MapRepository(full).save(makeMap("a", "Music theory"))).toThrow("Local storage is full.");
  });
});

describe("export geometry", () => {
  it("has nothing to export for an empty graph", () => {
    expect(graphBounds([])).toBeNull();
  });

  it("covers every node including labels, at 1:1 for normal maps", () => {
    const { graph } = generateMap("topic", "How the human brain learns");
    const bounds = graphBounds(graph.nodes);
    expect(bounds).not.toBeNull();
    if (!bounds) return;
    const xs = graph.nodes.map((n) => n.position.x);
    expect(bounds.x).toBeLessThan(Math.min(...xs));
    expect(bounds.x + bounds.width).toBeGreaterThan(Math.max(...xs));
    const geometry = computeExportGeometry(bounds, { pixelRatio: 2 });
    expect(geometry.zoom).toBe(1);
    expect(geometry.pixelRatio).toBe(2);
    expect(geometry.width).toBeGreaterThan(bounds.width);
    expect(geometry.translateX).toBeCloseTo(80 - bounds.x);
  });

  it("scales unusually large graphs down to stay within canvas limits", () => {
    const geometry = computeExportGeometry({ x: -20000, y: -100, width: 40000, height: 2000 }, { pixelRatio: 2, maxSide: 8000 });
    expect(geometry.scaledDown).toBe(true);
    expect(geometry.pixelRatio).toBe(1);
    expect(geometry.width * geometry.pixelRatio).toBeLessThanOrEqual(8000);
    expect(Number.isFinite(geometry.translateX)).toBe(true);
  });

  it("frames small graphs with a caption band and a minimum size", () => {
    const layout = computeFrameLayout(300, 200, true);
    expect(layout.width).toBe(FRAME.minWidth);
    expect(layout.height).toBe(FRAME.minHeight);
    expect(layout.captionY).toBeGreaterThan(layout.graphY + 200);
    expect(computeFrameLayout(300, 200, false)).toMatchObject({ width: 300, height: 200, graphX: 0, graphY: 0 });
  });

  it("derives safe file names from titles", () => {
    expect(exportFileName("Why civilizations rise & fall?")).toBe("why-civilizations-rise-fall.png");
    expect(exportFileName("Café — idées")).toBe("cafe-idees.png");
    expect(exportFileName("???")).toBe("mindspace-map.png");
  });
});
