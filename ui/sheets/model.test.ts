// SPDX-License-Identifier: GPL-3.0-or-later
import { findGroup } from "./model";
import { formsWorkspace } from "./testing";

describe("findGroup", () => {
  it("finds a group and the id of its window, or nothing", () => {
    const tree = formsWorkspace();
    expect(findGroup(tree, 10)?.window).toBe(1);
    expect(findGroup(tree, 10)?.group.name).toBe("Servers");
    expect(findGroup(tree, 12)?.window).toBe(3);
    expect(findGroup(tree, 12)?.group.name).toBe("Logs");
    expect(findGroup(tree, 99)).toBeUndefined();
  });
});
