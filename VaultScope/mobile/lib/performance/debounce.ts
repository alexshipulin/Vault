export type DebouncedFunction<TArgs extends unknown[], TResult> = ((
  ...args: TArgs
) => Promise<TResult>) & {
  cancel: () => void;
};

export function debouncePromise<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => Promise<TResult> | TResult,
  waitMs = 300,
): DebouncedFunction<TArgs, TResult> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let rejectPending: ((reason?: unknown) => void) | null = null;

  const debounced = (...args: TArgs) =>
    new Promise<TResult>((resolve, reject) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      if (rejectPending) {
        rejectPending(new Error("Debounced call superseded by a newer request."));
      }

      rejectPending = reject;
      timeout = setTimeout(async () => {
        timeout = null;
        rejectPending = null;

        try {
          resolve(await callback(...args));
        } catch (error) {
          reject(error);
        }
      }, waitMs);
    });

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    if (rejectPending) {
      rejectPending(new Error("Debounced call cancelled."));
      rejectPending = null;
    }
  };

  return debounced;
}
