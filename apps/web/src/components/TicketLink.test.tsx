import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketLink } from './TicketLink.js';

// A mitigation's ticket URL (spec FR-013, FR-017): a link only when it is http(s).
describe('TicketLink', () => {
  it('renders an http(s) URL as a link that opens in a new tab without access to this page', () => {
    render(<TicketLink url="https://tracker.example/SEC-1" />);
    const link = screen.getByRole('link', { name: 'https://tracker.example/SEC-1' });
    expect(link.getAttribute('href')).toBe('https://tracker.example/SEC-1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('accepts http as well as https', () => {
    render(<TicketLink url="http://tracker.example/SEC-2" />);
    expect(screen.getByRole('link')).toBeTruthy();
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://host/file', 'not a url', '//evil.example'])(
    'renders %j as plain text, never as a link',
    (url) => {
      const { container } = render(<TicketLink url={url} />);
      expect(screen.queryByRole('link')).toBeNull();
      expect(container.textContent).toBe(url);
    },
  );
});
