// A mitigation's ticket URL. It is a link only when it is http(s): anything else, such as a
// `javascript:` URL, is shown as plain text, so the UI doesn't rely on storage having rejected it
// (spec FR-013, FR-017). The link opens in a new tab that has no access to this page.
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function TicketLink({ url }: { url: string }) {
  if (!isWebUrl(url)) return <span>{url}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {url}
    </a>
  );
}
