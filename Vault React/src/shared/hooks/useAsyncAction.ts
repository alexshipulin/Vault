import { useCallback, useState } from "react";

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>
): [(...args: TArgs) => Promise<TResult>, boolean] {
  const [running, setRunning] = useState(false);

  const execute = useCallback(
    async (...args: TArgs) => {
      setRunning(true);
      try {
        return await action(...args);
      } finally {
        setRunning(false);
      }
    },
    [action]
  );

  return [execute, running];
}
