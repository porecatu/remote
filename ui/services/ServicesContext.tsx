// SPDX-License-Identifier: GPL-3.0-or-later
// Hands the composition root (`createServices`) to the screens.
import { createContext, useContext, type ReactNode } from "react";

import type { Services } from "./createServices";

const ServicesContext = createContext<Services | null>(null);

type ServicesProviderProps = {
  readonly services: Services;
  readonly children: ReactNode;
};

export function ServicesProvider({ services, children }: ServicesProviderProps) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

/** The services of the app. Throws outside a `ServicesProvider` (a wiring bug). */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === null) {
    throw new Error("useServices outside ServicesProvider");
  }
  return services;
}
