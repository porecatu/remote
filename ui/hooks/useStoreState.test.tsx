// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { createStore } from "zustand/vanilla";

import { shallowEqual, useStoreState } from "./useStoreState";

type State = { readonly count: number; readonly other: number; readonly items: readonly number[] };

function makeStore() {
  return createStore<State>()(() => ({ count: 0, other: 0, items: [1, 2] }));
}

describe("useStoreState", () => {
  it("re-renders only when the selected value changes", async () => {
    const store = makeStore();
    let renders = 0;
    function Count() {
      renders += 1;
      const count = useStoreState(store, (state) => state.count);
      return <Text testID="count">{String(count)}</Text>;
    }
    await render(<Count />);
    expect(screen.getByTestId("count").props.children).toBe("0");
    const initial = renders;

    await act(() => {
      store.setState({ other: 1 });
    });
    expect(renders).toBe(initial);

    await act(() => {
      store.setState({ count: 1 });
    });
    expect(screen.getByTestId("count").props.children).toBe("1");
    expect(renders).toBe(initial + 1);
  });

  it("keeps an equal derived value with an equality function", async () => {
    const store = makeStore();
    let renders = 0;
    function Items() {
      renders += 1;
      const items = useStoreState(store, (state) => state.items.map((n) => n * 2), shallowEqual);
      return <Text testID="items">{items.join(",")}</Text>;
    }
    await render(<Items />);
    const initial = renders;

    await act(() => {
      store.setState({ items: [1, 2] });
    });
    expect(renders).toBe(initial);

    await act(() => {
      store.setState({ items: [1, 3] });
    });
    expect(screen.getByTestId("items").props.children).toBe("2,6");
    expect(renders).toBe(initial + 1);
  });

  it("hands out the same value across re-renders with an inline selector", async () => {
    const store = makeStore();
    const seen: (readonly number[])[] = [];
    function Items({ tick }: { readonly tick: number }) {
      const items = useStoreState(store, (state) => [...state.items], shallowEqual);
      seen.push(items);
      return <Text>{String(tick)}</Text>;
    }
    const view = await render(<Items tick={0} />);
    await view.rerender(<Items tick={1} />);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1]).toBe(seen[0]);
  });

  it("follows a new store", async () => {
    const first = makeStore();
    const second = createStore<State>()(() => ({ count: 7, other: 0, items: [] }));
    function Count({ store }: { readonly store: typeof first }) {
      const count = useStoreState(store, (state) => state.count);
      return <Text testID="count">{String(count)}</Text>;
    }
    const view = await render(<Count store={first} />);
    await view.rerender(<Count store={second} />);
    expect(screen.getByTestId("count").props.children).toBe("7");
  });
});

describe("shallowEqual", () => {
  it("compares one level deep", () => {
    expect(shallowEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false);
    expect(shallowEqual(null, null)).toBe(true);
  });
});
