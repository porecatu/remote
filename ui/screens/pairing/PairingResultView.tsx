// SPDX-License-Identifier: GPL-3.0-or-later
// The results of the pairing (anatomy §4.3.4, §4.14; PRD-001 RF-1.8, RF-1.10):
// "Paired with Home" with `circle-check` in `success`, or the state screen of
// a failure: its icon, title, body and buttons (the primary first, then text
// buttons). The identity error is a security screen: `shield-alert` in
// `error` and only "Close", never a way to go on with that code.
import { AccessibilityInfo } from "react-native";
import { useEffect } from "react";

import { Button } from "@ui/components/Button";
import { StateView } from "@ui/components/StateView";
import { useT } from "@ui/i18n/LocaleProvider";

import type { FailureView, ResultAction } from "./pairingModel";

export type PairingResult =
  | { readonly kind: "paired"; readonly name: string }
  | { readonly kind: "failed"; readonly view: FailureView };

export type PairingResultViewProps = {
  readonly result: PairingResult;
  /** A button of a failure was pressed. */
  readonly onAction?: (action: ResultAction) => void;
};

const ACTION_LABEL = {
  "scan-another": "pairing.scan_another",
  retry: "common.retry",
  close: "common.close",
} as const;

export function PairingResultView({ result, onAction }: PairingResultViewProps) {
  const { t } = useT();
  const title =
    result.kind === "paired"
      ? t("pairing.paired", { name: result.name })
      : t(result.view.title.key, result.view.title.params);
  const body = result.kind === "failed" ? t(result.view.body.key, result.view.body.params) : undefined;

  // The result replaces the wait: the screen reader hears it at once.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(body === undefined ? title : `${title}${t("a11y.separator")}${body}`);
  }, [body, t, title]);

  if (result.kind === "paired") {
    return <StateView icon="circle-check" iconColor="success" title={title} testID="pairing-result" />;
  }

  const { view } = result;
  return (
    <StateView
      icon={view.icon}
      iconColor={view.iconColor}
      title={title}
      {...(body === undefined ? {} : { body })}
      actions={view.actions.map((action, index) => (
        <Button
          key={action}
          label={t(ACTION_LABEL[action])}
          variant={index === 0 ? "primary" : "text"}
          width="wide"
          onPress={() => onAction?.(action)}
          testID={`pairing-result-${action}`}
        />
      ))}
      testID={view.security ? "pairing-security-error" : "pairing-result"}
    />
  );
}
