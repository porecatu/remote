// SPDX-License-Identifier: GPL-3.0-or-later

// The only logger of the app. It records events (connected, dropped, error
// code), never content: no grid, scrollback, keys, pasted text, titles,
// directories or key material. The closed event union and the primitive-only
// fields exist so a caller cannot slip free text or a payload in.

export type EventName =
  | "app_start"
  | "secure_random_ready"
  | "relay_connecting"
  | "relay_connected"
  | "relay_dropped"
  | "handshake_ok"
  | "handshake_failed"
  | "pair_ok"
  | "pair_rejected"
  | "session_ready"
  | "session_closed"
  | "protocol_error"
  | "app_background"
  | "app_foreground"
  | "storage_invalid"
  | "relay_retry_scheduled"
  | "session_background_closed"
  | "host_instance_changed"
  | "subscription_started"
  | "subscription_ended"
  | "grid_gap";

export type EventFields = Record<string, string | number | boolean>;

export function logEvent(name: EventName, fields?: EventFields): void {
  if (!__DEV__) {
    return;
  }
  if (fields === undefined) {
    console.info(name);
  } else {
    console.info(name, fields);
  }
}
