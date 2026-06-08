import { useState, useEffect, useCallback } from "react";
import OrderBus, { type BusStore, type BusRecord } from "./orderBus";

/**
 * A hook that subscribes to a specific OrderBus store and returns its data
 * along with modifier methods (push, patch, remove, setAll, clear).
 *
 * Automatically triggers a component re-render when the store changes.
 *
 * @param store The name of the store in the OrderBus
 */
export function useOrderBusStore<T extends BusRecord = BusRecord>(
  store: BusStore
): [
  T[],
  {
    push: (item: Omit<T, "id"> & { id?: string }) => string;
    patch: (id: string, updates: Partial<T>) => void;
    remove: (id: string) => void;
    setAll: (items: T[]) => void;
    clear: () => void;
  }
] {
  const [data, setData] = useState<T[]>(() => OrderBus.getAll<T>(store));

  useEffect(() => {
    // Subscribe to store updates
    const unsubscribe = OrderBus.subscribe(store, (newData) => {
      setData(newData as T[]);
    });

    // Handle initial mount race condition or state sync
    setData(OrderBus.getAll<T>(store));

    return () => {
      unsubscribe();
    };
  }, [store]);

  const push = useCallback(
    (item: Omit<T, "id"> & { id?: string }) => {
      return OrderBus.push(store, item as BusRecord);
    },
    [store]
  );

  const patch = useCallback(
    (id: string, updates: Partial<T>) => {
      OrderBus.patch(store, id, updates as Record<string, unknown>);
    },
    [store]
  );

  const remove = useCallback(
    (id: string) => {
      OrderBus.remove(store, id);
    },
    [store]
  );

  const setAll = useCallback(
    (items: T[]) => {
      OrderBus.setAll(store, items);
    },
    [store]
  );

  const clear = useCallback(() => {
    OrderBus.clear(store);
  }, [store]);

  return [
    data,
    {
      push,
      patch,
      remove,
      setAll,
      clear,
    },
  ];
}

/**
 * A low-level hook that registers a callback listener to a specific OrderBus store.
 * Useful when you want to handle updates imperatively rather than state-fully.
 *
 * @param store The store name to subscribe to
 * @param callback The callback to execute when the store changes
 */
export function useBusSubscription<T extends BusRecord = BusRecord>(
  store: BusStore,
  callback: (data: T[]) => void
): void {
  useEffect(() => {
    const unsubscribe = OrderBus.subscribe(store, (newData) => {
      callback(newData as T[]);
    });
    return () => {
      unsubscribe();
    };
  }, [store, callback]);
}
