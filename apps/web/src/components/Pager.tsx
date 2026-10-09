// Previous and Next for a list shown a page at a time. Nothing is drawn for a single page.
interface PagerProps {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}

export function Pager({ page, pages, onChange }: PagerProps) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Threat pages" className="pager">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
