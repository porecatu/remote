// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen } from "@testing-library/react-native";
import { StrictMode } from "react";
import { Text } from "react-native";

import type { TerminalSession } from "@/controllers/terminalSession";
import type { Message } from "@/protocol";
import type { SessionStore } from "@/session/sessionStore";
import { createHarness, greetingHost, type ScriptedHost } from "@/session/testing";
import { pane, tab, win, workspace } from "@/workspace/testing";
import { ServicesProvider } from "@ui/services/ServicesContext";
import { createTestServices, renderWithServices } from "@ui/services/testing";

import { useTerminalSession, useTerminalView } from "./useTerminalSession";

/** The controllers the probe got, render after render. */
let seen: TerminalSession[] = [];

function Probe({ session }: { readonly session: SessionStore }) {
  const terminal = useTerminalSession(session, 1);
  const view = useTerminalView(terminal);
  seen.push(terminal);
  return <Text testID="status">{view.status}</Text>;
}

/** A ready session whose desktop shows tab 1 with pane 100. */
async function readySession(): Promise<{
  readonly session: SessionStore;
  readonly host: ScriptedHost;
  readonly services: ReturnType<typeof createTestServices>;
}> {
  const h = createHarness();
  const host = greetingHost(h, 1, workspace([win(1, [tab(1, { layout: pane(100), focused: 100 })], { active: 1 })]));
  const services = createTestServices({ deviceKey: h.device, desktops: [h.desktop], relay: h.relay, time: h.time });
  await services.start();
  await services.desktops.load();
  const session = services.desktops.open(h.desktop.id);
  if (session === undefined) {
    throw new Error("no session");
  }
  services.fakes.network.last().open();
  expect(session.getState().connection.state).toBe("ready");
  return { session, host, services };
}

function sent(host: ScriptedHost, type: Message["type"]): Message[] {
  return host.received.filter((message) => message.type === type);
}

beforeEach(() => {
  seen = [];
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useTerminalSession", () => {
  it("opens the controller on mount and closes it on unmount", async () => {
    const { session, host, services } = await readySession();
    const r = await renderWithServices(<Probe session={session} />, { services, start: false });
    expect(screen.getByTestId("status")).toHaveTextContent("waiting-snapshot");
    expect(new Set(seen).size).toBe(1);
    expect(sent(host, "subscribe")).toEqual([{ type: "subscribe", pane: 100 }]);

    await act(async () => {
      r.unmount();
    });
    expect(sent(host, "unsubscribe")).toEqual([{ type: "unsubscribe", pane: 100 }]);
    expect(seen.at(-1)?.getState().status).toBe("idle");
  });

  it("survives StrictMode: the effect run twice leaves an open controller, not a closed one", async () => {
    const { session, host, services } = await readySession();
    // StrictMode at the root: under the providers of `renderWithServices` the
    // test renderer does not run the effects twice.
    const r = await render(
      <StrictMode>
        <ServicesProvider services={services}>
          <Probe session={session} />
        </ServicesProvider>
      </StrictMode>,
    );
    // The first controller was opened and closed by the double mount; a new
    // one took its place and is subscribed.
    const current = seen.at(-1);
    expect(new Set(seen).size).toBe(2);
    expect(current?.getState().status).toBe("waiting-snapshot");
    expect(screen.getByTestId("status")).toHaveTextContent("waiting-snapshot");
    expect(sent(host, "subscribe").at(-1)).toEqual({ type: "subscribe", pane: 100 });
    expect(sent(host, "subscribe").length - sent(host, "unsubscribe").length).toBe(1);

    await act(async () => {
      r.unmount();
    });
    expect(current?.getState().status).toBe("idle");
    expect(sent(host, "subscribe").length).toBe(sent(host, "unsubscribe").length);
  });
});
