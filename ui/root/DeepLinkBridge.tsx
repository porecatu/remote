// SPDX-License-Identifier: GPL-3.0-or-later
// The `porecatu://pair` deep link (PRD-001 RF-1.5, anatomy §4.1 and §4.3.2):
// the URL the system hands to the app (`getInitialURL` at a cold start, the
// `url` event after it) goes to the app shell, which holds a pairing link
// while the app is locked. Once a link is waiting and content is visible, the
// root opens the device name step (`/pair/name`) with no parameter: the
// pairing stack takes the link from the shell (`takePairingLink`) when it
// mounts. The URI carries a single-use token: it never reaches a log nor a
// route parameter (the router itself is kept off system links by
// `redirectSystemPath`, ./nativeIntent.ts).
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { selectContentVisible } from "@/controllers/appShell";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useServices } from "@ui/services/ServicesContext";

/** The route of the device name step, where a pairing link enters the flow. */
export const PAIR_NAME_ROUTE = "/pair/name";

type DeepLinkBridgeProps = {
  /**
   * The navigator is mounted (the root mounts it after the first unlock).
   * Navigation waits one turn more, so the navigator has its state.
   */
  readonly navigatorMounted: boolean;
};

/** Feeds system URLs to the app shell and opens the pairing flow for a released link. Draws nothing. */
export function DeepLinkBridge({ navigatorMounted }: DeepLinkBridgeProps) {
  const { appShell } = useServices();
  const router = useRouter();
  const [navigable, setNavigable] = useState(false);
  const linkReady = useStoreState(
    appShell.store,
    (state) => state.pendingPairingLink !== null && selectContentVisible(state),
  );

  useEffect(() => {
    let active = true;
    Linking.getInitialURL().then(
      (url) => {
        if (active && url !== null) {
          appShell.receiveLink(url);
        }
      },
      () => undefined,
    );
    const subscription = Linking.addEventListener("url", (event) => {
      appShell.receiveLink(event.url);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [appShell]);

  useEffect(() => {
    if (!navigatorMounted || navigable) {
      return undefined;
    }
    // One turn after the navigator mounted: it has its state by then.
    const timer = setTimeout(() => {
      setNavigable(true);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [navigatorMounted, navigable]);

  useEffect(() => {
    if (navigable && linkReady) {
      router.push(PAIR_NAME_ROUTE);
    }
  }, [navigable, linkReady, router]);

  return null;
}
