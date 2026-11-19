import { useEffect, useState } from 'react';
import axios from 'axios';
import { api, errorMessage } from '../services/api';

/** 请求随页面卸载取消，防止旧请求覆盖新的页面状态。 */
export function useApiData<T>(url: string) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    setData(undefined);
    api
      .get<T>(url, { signal: controller.signal })
      .then((response) => setData(response.data))
      .catch((err: unknown) => {
        if (!axios.isCancel(err)) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, version]);
  return { data, loading, error, reload: () => setVersion((value) => value + 1) };
}
