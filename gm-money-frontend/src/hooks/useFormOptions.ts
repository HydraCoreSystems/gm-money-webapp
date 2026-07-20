import { useEffect, useState } from "react";
import { callApi } from "../api/client";
import type { FormOptions } from "../api/types";

type Status = "loading" | "ready" | "error";

export function useFormOptions(onAuthFailure: () => void) {
  const [status, setStatus] = useState<Status>("loading");
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await callApi<FormOptions>("getFormOptions");

      if (cancelled) return;

      if (!result.ok) {
        if (result.code === "BAD_PASSWORD") {
          onAuthFailure();
          return;
        }
        setError(result.error);
        setStatus("error");
        return;
      }

      setOptions(result.data);
      setStatus("ready");
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, options, error };
}
