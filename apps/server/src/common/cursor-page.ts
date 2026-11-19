import { CursorPageDto } from './page.dto';

/** 多查一条判断是否还有下一页，不依赖被删除的游标记录。 */
export function cursorPage<T extends { id: number }>(rows: T[], page: CursorPageDto) {
  if (!page.paged) return rows;
  const items = rows.slice(0, page.limit);
  const hasMore = rows.length > page.limit;
  return { items, hasMore, nextBefore: hasMore ? items.at(-1)!.id : null };
}
