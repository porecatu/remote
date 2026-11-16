// SPDX-License-Identifier: GPL-3.0-or-later

import { SplitDir } from "../protocol";
import { normalizeForSearch, searchTabIds, searchTabs, searchTerms } from "./search";
import { group, pane, split, tab, win, workspace } from "./testing";

const ws = workspace([
  win(
    1,
    [
      tab(1, { title: "Servidor API" }),
      group(10, [tab(2, { title: "logs" }), tab(3, { title: "shell" })], { name: "Produção" }),
    ],
    { pinned: [tab(9, { title: "notas", remote: "deploy@Prod-01.example.com" })] },
  ),
  win(2, [
    tab(4, {
      title: "build",
      layout: split(
        SplitDir.sideBySide,
        32768,
        pane(41, { cwd: "C:\\Users\\Ana\\Projetos\\Café" }),
        pane(42, { cwd: "/srv/www" }),
      ),
      focused: 41,
    }),
  ]),
]);

const ids = (query: string) => searchTabs(ws, query).map((h) => h.tab);

describe("normalizeForSearch", () => {
  it("drops case and accents", () => {
    expect(normalizeForSearch("PRODUÇÃO")).toBe("producao");
    expect(normalizeForSearch("Café")).toBe("cafe");
    expect(normalizeForSearch("cafe\u0301")).toBe("cafe");
  });
});

describe("searchTerms", () => {
  it("splits on whitespace and drops empty terms", () => {
    expect(searchTerms("  api   PROD ")).toEqual(["api", "prod"]);
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("searchTabs", () => {
  it("matches the title ignoring case", () => {
    expect(ids("api")).toEqual([1]);
    expect(ids("SERVIDOR")).toEqual([1]);
  });

  it("matches the group name ignoring accents and brings every tab of the group", () => {
    expect(ids("producao")).toEqual([2, 3]);
    expect(searchTabs(ws, "producao")[0]).toMatchObject({ group: 10, fields: ["group"] });
  });

  it("matches the cwd of any pane of the tab", () => {
    expect(ids("cafe")).toEqual([4]);
    expect(ids("/srv/www")).toEqual([4]);
    expect(searchTabs(ws, "srv")[0]?.fields).toEqual(["cwd"]);
  });

  it("matches user@host in an SSH tab, in the pinned zone too", () => {
    expect(ids("deploy@prod-01")).toEqual([9]);
    expect(searchTabs(ws, "example.com")[0]).toMatchObject({ window: 1, group: null });
  });

  it("searches every window", () => {
    expect(ids("build")).toEqual([4]);
    expect(searchTabs(ws, "build")[0]?.window).toBe(2);
  });

  it("requires every term, each in any field", () => {
    expect(ids("logs producao")).toEqual([2]);
    expect(ids("logs api")).toEqual([]);
  });

  it("returns hits in visual order", () => {
    expect(ids("o")).toEqual([9, 1, 2, 3, 4]);
  });

  it("matches nothing for an empty query", () => {
    expect(ids("")).toEqual([]);
    expect(searchTabIds(ws, "  ")).toBeNull();
  });

  it("gives a set of ids for the rows", () => {
    expect(searchTabIds(ws, "logs")).toEqual(new Set([2]));
  });

  it("ignores a null cwd and a null remote", () => {
    expect(ids("null")).toEqual([]);
  });
});
