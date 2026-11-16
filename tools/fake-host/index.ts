// SPDX-License-Identifier: GPL-3.0-or-later

/// <reference types="node" />

/**
 * Fake desktop for developing the app on a connected device, without a real
 * Porecatu desktop or relay: relay and host in one Node process on
 * `ws://localhost:<port>`. For development only (the keys are predictable and
 * any device may connect); nothing here ships in the app.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/fake-host/index.ts [options]
 *
 * The app accepts `ws://` only for loopback (spec 01 §1), so a phone reaches
 * this process through `adb reverse tcp:<port> tcp:<port>` (Android), and an
 * iOS simulator sees `localhost` as is.
 *
 * Options: `--port <n>` (default 8787), `--relay-url <ws url>` (default
 * `ws://localhost:<port>`), `--seed <n>` (host key seed, default 1),
 * `--strict` (refuse devices not paired in this run), `--decline-pairing`
 * (answer pairings with `user-declined`), `--no-qr`. Commands on stdin:
 * `p` new pairing, `b` bell, `q` quit.
 */
import { createInterface } from "node:readline";
import { formatPairingUri, isSecureRelayUrl, normalizeRelayUrl } from "../../src/protocol/index.ts";
import { createMemoryRelay, testKeypair } from "../../src/protocol/testing.ts";
import { startBridge } from "./bridge.ts";
import { createScenarioHost } from "./host.ts";
import { renderQr } from "./qr.ts";

/** How often the host looks for work; frames themselves are paced by the host (30/s). */
const TICK_INTERVAL_MS = 5;

interface Args {
  port: number;
  relayUrl: string | null;
  seed: number;
  strict: boolean;
  declinePairing: boolean;
  qr: boolean;
}

function parseArgs(argv: readonly string[]): Args | string {
  const args: Args = { port: 8787, relayUrl: null, seed: 1, strict: false, declinePairing: false, qr: true };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    const number = (): number => Number(argv[++i]);
    switch (name) {
      case "--port":
        args.port = number();
        if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) {
          return "--port needs an integer from 0 to 65535";
        }
        break;
      case "--relay-url":
        args.relayUrl = argv[++i] ?? "";
        break;
      case "--seed":
        args.seed = number();
        if (!Number.isSafeInteger(args.seed) || args.seed < 0) {
          return "--seed needs a non-negative integer";
        }
        break;
      case "--strict":
        args.strict = true;
        break;
      case "--decline-pairing":
        args.declinePairing = true;
        break;
      case "--no-qr":
        args.qr = false;
        break;
      default:
        return `unknown option ${String(name)}`;
    }
  }
  return args;
}

const out = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

/** The QR is a courtesy: `toqr` is optional, and without it only the URI is printed. */
async function qrText(uri: string): Promise<string | null> {
  try {
    const { toQR } = await import("toqr");
    return renderQr(toQR(uri));
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (typeof parsed === "string") {
    process.stderr.write(`fake-host: ${parsed}\n`);
    return 2;
  }
  const args = parsed;

  const relay = createMemoryRelay();
  const started = performance.now();
  const now = (): number => Math.trunc(performance.now() - started);
  const host = createScenarioHost({
    relay,
    now,
    hostKey: testKeypair(args.seed),
    hostName: "Fake Desktop",
    strict: args.strict,
    declinePairing: args.declinePairing,
  });
  const bridge = await startBridge({
    relay,
    port: args.port,
    onEvent: (event) => out(`[fake-host] ${event}`),
  });

  const relayUrl = normalizeRelayUrl(args.relayUrl ?? `ws://localhost:${bridge.port}`);
  if (relayUrl === null || !isSecureRelayUrl(relayUrl)) {
    process.stderr.write("fake-host: --relay-url must be wss://, or ws:// to localhost\n");
    await bridge.close();
    return 2;
  }

  const timer = setInterval(() => {
    host.tick(now());
  }, TICK_INTERVAL_MS);

  const showPairing = async (): Promise<void> => {
    const uri = formatPairingUri(host.startPairing(relayUrl));
    out("");
    out("Pairing URI (valid for 5 minutes, single use):");
    out(uri);
    if (args.qr) {
      const qr = await qrText(uri);
      out(qr === null ? "(no QR: the `toqr` package is not installed)" : `\n${qr}`);
    }
    out("");
  };

  out(`fake-host listening on ws://127.0.0.1:${bridge.port} (host id ${host.hostId})`);
  out(`Android device: adb reverse tcp:${bridge.port} tcp:${bridge.port}`);
  out("Commands: p = new pairing, b = bell, q = quit");
  await showPairing();

  return new Promise<number>((resolve) => {
    let closing = false;
    const quit = (): void => {
      if (closing) {
        return;
      }
      closing = true;
      clearInterval(timer);
      host.shutdown();
      void bridge.close().then(() => {
        resolve(0);
      });
    };
    process.once("SIGINT", quit);
    process.once("SIGTERM", quit);
    const input = createInterface({ input: process.stdin });
    input.on("line", (text) => {
      switch (text.trim()) {
        case "p":
          void showPairing();
          break;
        case "b":
          host.ringBell();
          out("[fake-host] bell sent");
          break;
        case "q":
          quit();
          break;
        default:
          break;
      }
    });
  });
}

main().then(
  (code) => {
    process.exit(code);
  },
  (error: unknown) => {
    process.stderr.write(`fake-host: ${error instanceof Error ? error.message : "failed"}\n`);
    process.exit(1);
  },
);
