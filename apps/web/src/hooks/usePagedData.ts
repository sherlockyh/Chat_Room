import { useEffect, useState } from 'react';
import axios from 'axios';
import type { CursorPage } from '@chat/shared';
import { api, errorMessage } from '../services/api';

/** 保存已访问页的游标，筛选变化时回到第一页，离开页面取消请求。 */
export function usePagedData<T>(url: string | undefined, pageSize = 12) {
  const [scope, setScope] = useState(url);
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: CursorPage<T>;
    error?: string;
  }>();
  if (scope !== url) {
    setScope(url);
    setCursors([undefined]);
  }
  const before = cursors.at(-1);
  const key = JSON.stringify([url, before, pageSize, version]);
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    api
      .get<CursorPage<T>>(url, {
        params: { paged: true, limit: pageSize, before },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        // 删除当前页最后一条或其他终端删除数据后，退回仍有内容的上一页。
        if (data.items.length === 0 && before !== undefined) {
          setCursors((values) => values.slice(0, -1));
        } else {
          setResult({ key, data });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !axios.isCancel(error)) {
          setResult({ key, error: errorMessage(error) });
        }
      });
    return () => controller.abort();
  }, [url, before, pageSize, key]);
  return {
    data: current?.data?.items,
    error: current?.error,
    loading: !!url && !current,
    page: cursors.length,
    pageSize,
    hasMore: current?.data?.hasMore ?? false,
    previous: () => setCursors((values) => (values.length > 1 ? values.slice(0, -1) : values)),
    next: () => {
      if (current?.data?.nextBefore != null) {
        setCursors((values) => [...values, current.data!.nextBefore!]);
      }
    },
    reload: () => setVersion((value) => value + 1),
    reset: () => {
      setCursors([undefined]);
      setVersion((value) => value + 1);
    },
  };
}
