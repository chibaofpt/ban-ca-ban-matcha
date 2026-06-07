import { useState, useEffect } from "react";
import { deliveryService } from "@/src/services/deliveryService";
import type { GoongPrediction } from "@/src/lib/types/address";

export function useAddressAutocomplete() {
  const [input, setInput] = useState("");
  const [predictions, setPredictions] = useState<GoongPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(async () => {
      const value = input;
      if (!value.trim()) {
        setPredictions([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const results = await deliveryService.autocomplete(value);
        setPredictions(results);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi tìm kiếm địa chỉ");
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => {
      clearTimeout(handler);
    };
  }, [input]);

  return {
    input,
    setInput,
    predictions,
    loading,
    error,
  };
}
