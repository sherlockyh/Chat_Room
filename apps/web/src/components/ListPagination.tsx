import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button } from 'antd';

interface Props {
  page: number;
  pageSize: number;
  loading: boolean;
  hasMore: boolean;
  data?: unknown[];
  error?: string;
  previous: () => void;
  next: () => void;
}

export default function ListPagination(props: Props) {
  return (
    <footer className="list-pagination">
      <span>
        {props.loading
          ? '正在加载…'
          : props.error
            ? '加载失败，请重试'
            : `本页 ${props.data?.length ?? 0} 条 · 每页 ${props.pageSize} 条`}
      </span>
      <nav aria-label="列表分页">
        <Button
          aria-label="上一页"
          icon={<LeftOutlined />}
          disabled={props.loading || props.page === 1}
          onClick={props.previous}
        >
          上一页
        </Button>
        <span className="page-indicator" aria-live="polite">
          第 {props.page} 页
        </span>
        <Button
          aria-label="下一页"
          icon={<RightOutlined />}
          iconPlacement="end"
          disabled={props.loading || !props.hasMore}
          onClick={props.next}
        >
          下一页
        </Button>
      </nav>
    </footer>
  );
}
