// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { t } from "@/i18n/catalog";
import { ErrorCode, type Profiles, type WorkspaceMessage } from "@/protocol";
import { newTab, renameGroup } from "@/session/actions";
import { group, tab, win, workspace } from "@/workspace/testing";
import { renderWithOverlays } from "@ui/overlay/testing";
import { duration } from "@ui/theme";

import { createFakeSheetSession, type FakeSheetSession } from "./testing";
import { openNewTabSheet, orderProfiles, profileAccessibilityLabel, type NewTabProps } from "./NewTabSheet";

const hidden = { includeHiddenElements: true } as const;

// The default profile is not the first one the desktop lists.
const PROFILES: Profiles = {
  type: "profiles",
  list: [
    { id: "prod", name: "Production", kind: 1 },
    { id: "shell", name: "Shell", kind: 0 },
    { id: "ubuntu", name: "Ubuntu", kind: 2 },
  ],
  defaultProfile: "shell",
};

function tree(): WorkspaceMessage {
  return workspace([win(1, [tab(1)]), win(2, [tab(2), group(10, [tab(3)], { name: "Servers" })])]);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function openSheet(session: FakeSheetSession, props: Omit<NewTabProps, "session">): Promise<void> {
  const { overlay } = await renderWithOverlays(<View />);
  await act(async () => {
    openNewTabSheet(overlay, { session, ...props });
  });
}

async function finishTransition() {
  await act(async () => {
    jest.advanceTimersByTime(duration.sheet + 50);
  });
}

function session(profiles: Profiles | null = PROFILES): FakeSheetSession {
  return createFakeSheetSession({ workspace: tree(), profiles });
}

function profileOrder(): string[] {
  return screen
    .getAllByTestId(/^new-tab-profile-[a-z]+$/)
    .map((element) => String(element.props.testID).replace("new-tab-profile-", ""));
}

describe("orderProfiles", () => {
  it("puts the default first and keeps the others in the desktop's order", () => {
    expect(orderProfiles(PROFILES).map((profile) => profile.id)).toEqual(["shell", "prod", "ubuntu"]);
  });
});

describe("NewTabSheet", () => {
  it("lists the profiles with the default first and chosen, under the window context", async () => {
    await openSheet(session(), { windowId: 1 });

    expect(screen.getByTestId("new-tab-sheet-title")).toHaveTextContent(t("common.new_tab"));
    expect(screen.getByText(t("new_tab.context_window", { number: 1 }))).toBeTruthy();
    expect(screen.getByText(t("new_tab.profile_section"))).toBeTruthy();
    expect(profileOrder()).toEqual(["shell", "prod", "ubuntu"]);
    expect(screen.getByTestId("new-tab-profile-shell").props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId("new-tab-profile-prod").props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText(t("new_tab.default"))).toBeTruthy();
    expect(screen.getByText(t("new_tab.kind_ssh"))).toBeTruthy();
    expect(screen.getByText(t("new_tab.kind_wsl"))).toBeTruthy();
  });

  it("reads each profile as name, type and, on the default, Default", async () => {
    await openSheet(session(), { windowId: 1 });

    const sep = t("a11y.separator");
    expect(screen.getByTestId("new-tab-profile-shell").props.accessibilityLabel).toBe(
      ["Shell", t("new_tab.kind_local"), t("new_tab.default")].join(sep),
    );
    expect(screen.getByTestId("new-tab-profile-prod").props.accessibilityLabel).toBe(
      profileAccessibilityLabel({ id: "prod", name: "Production", kind: 1 }, false, { t }),
    );
    expect(screen.getByTestId("new-tab-profiles").props.accessibilityRole).toBe("radiogroup");
    expect(screen.getByTestId("new-tab-profile-prod").props.accessibilityRole).toBe("radio");
  });

  it("creates the tab in the window with the default profile and closes on the result", async () => {
    const fake = session();
    await openSheet(fake, { windowId: 1 });

    await fireEvent.press(screen.getByTestId("new-tab-create"));

    expect(fake.sent).toEqual([newTab(1, 1, { profile: "shell" })]);
    expect(screen.getByTestId("new-tab-create").props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByTestId("new-tab-sheet")).toBeTruthy();

    await act(async () => {
      fake.answer(1, { created: 42 });
    });
    await finishTransition();
    expect(screen.queryByTestId("new-tab-sheet")).toBeNull();
  });

  it("also closes when the desktop refuses the new tab", async () => {
    const fake = session();
    await openSheet(fake, { windowId: 1 });

    await fireEvent.press(screen.getByTestId("new-tab-create"));
    await act(async () => {
      fake.answer(1, { error: ErrorCode.unknownProfile });
    });
    await finishTransition();

    expect(screen.queryByTestId("new-tab-sheet")).toBeNull();
  });

  it("creates at the end of the group with the chosen profile", async () => {
    const fake = session();
    await openSheet(fake, { windowId: 2, groupId: 10 });

    expect(screen.getByText(t("new_tab.context_group", { group: "Servers" }))).toBeTruthy();
    await fireEvent.press(screen.getByTestId("new-tab-profile-prod"));
    expect(screen.getByTestId("new-tab-profile-prod").props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByTestId("new-tab-create"));

    expect(fake.sent).toEqual([newTab(1, 2, { group: 10, profile: "prod" })]);
  });

  it("shows a spinner until the profiles arrive", async () => {
    const fake = session(null);
    await openSheet(fake, { windowId: 1 });

    expect(screen.getByTestId("new-tab-loading")).toBeTruthy();
    expect(screen.getByText(t("new_tab.loading_profiles"))).toBeTruthy();
    expect(screen.getByTestId("new-tab-create").props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId("new-tab-create"));
    expect(fake.sent).toEqual([]);

    await act(async () => {
      fake.store.setState({ profiles: PROFILES });
    });
    expect(screen.queryByTestId("new-tab-loading")).toBeNull();
    expect(screen.getByTestId("new-tab-profile-shell").props.accessibilityState).toMatchObject({ checked: true });
  });

  it("goes back to the default when the chosen profile leaves the list", async () => {
    const fake = session();
    await openSheet(fake, { windowId: 1 });
    await fireEvent.press(screen.getByTestId("new-tab-profile-ubuntu"));

    await act(async () => {
      fake.store.setState({ profiles: { ...PROFILES, list: PROFILES.list.filter((p) => p.id !== "ubuntu") } });
    });

    expect(screen.getByTestId("new-tab-profile-shell").props.accessibilityState).toMatchObject({ checked: true });
  });

  it("waits while another action on the group is pending", async () => {
    const fake = session();
    expect(fake.sendAction((id) => renameGroup(id, 10, "x")).ok).toBe(true);
    await openSheet(fake, { windowId: 2, groupId: 10 });

    expect(screen.getByTestId("new-tab-create").props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
    expect(screen.getByTestId("new-tab-create-spinner", hidden)).toBeTruthy();
  });

  it("warns and stays open when the session refuses", async () => {
    const fake = session();
    fake.refuse("not-ready");
    await openSheet(fake, { windowId: 1 });

    await fireEvent.press(screen.getByTestId("new-tab-create"));
    await finishTransition();

    expect(fake.sent).toEqual([]);
    expect(screen.getByText(t("toast.not_connected"), hidden)).toBeTruthy();
    expect(screen.getByTestId("new-tab-sheet")).toBeTruthy();
    expect(screen.getByTestId("new-tab-create").props.accessibilityState).toMatchObject({ busy: false });
  });

  it("closes when its window leaves the tree", async () => {
    const fake = session();
    await openSheet(fake, { windowId: 2 });

    await act(async () => {
      fake.store.setState({ workspace: workspace([win(1, [tab(1)])]) });
    });
    await finishTransition();

    expect(screen.queryByTestId("new-tab-sheet")).toBeNull();
  });
});
