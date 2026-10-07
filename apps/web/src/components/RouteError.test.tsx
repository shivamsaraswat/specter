import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteError } from './RouteError.js';

// The last resort: a page that breaks shows this, not the router's own "Unexpected Application Error!".

function Broken(): never {
  throw new Error('Minified React error #185');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('RouteError', () => {
  it('replaces the router default with a plain message, a reload and a way out, and shows no error text', () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <Broken />, errorElement: <RouteError /> }, { path: '/projects', element: <p>projects</p> }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('This page stopped working.');
    expect(alert.textContent).toContain('had not yet been saved');
    expect(document.body.textContent).not.toContain('Unexpected Application Error');
    expect(document.body.textContent).not.toContain('#185');
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to projects' }).getAttribute('href')).toBe('/projects');
  });
});
