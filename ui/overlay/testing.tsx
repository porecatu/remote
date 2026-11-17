// SPDX-License-Identifier: GPL-3.0-or-later
// A screen inside the overlay layer, for the tests of the overlays and of the
// screens that open them: the root's arrangement (underlay, then the host)
// over the providers of `renderWithServices`, with the store at hand. Not
// imported by app code.
import type { ReactElement } from "react";

import {
  type RenderWithServicesOptions,
  type RenderWithServicesResult,
  renderWithServices,
} from "@ui/services/testing";

import { OverlayHost } from "./OverlayHost";
import { OverlayProvider, OverlayUnderlay, createAppOverlayController, type AppOverlayController } from "./OverlayProvider";
import { type OverlayApi, overlayApi } from "./useOverlay";

export type RenderWithOverlaysResult = RenderWithServicesResult & {
  readonly overlays: AppOverlayController;
  /** The calls of `useOverlay()`, over the same store. */
  readonly overlay: OverlayApi;
};

/** Renders `ui` as the root does: in `OverlayUnderlay` (test id `underlay`), with `OverlayHost` over it. */
export async function renderWithOverlays(
  ui: ReactElement,
  options: RenderWithServicesOptions & { readonly overlays?: AppOverlayController } = {},
): Promise<RenderWithOverlaysResult> {
  const overlays = options.overlays ?? createAppOverlayController();
  const result = await renderWithServices(
    <OverlayProvider controller={overlays}>
      <OverlayUnderlay testID="underlay">{ui}</OverlayUnderlay>
      <OverlayHost />
    </OverlayProvider>,
    options,
  );
  return { ...result, overlays, overlay: overlayApi(overlays) };
}
