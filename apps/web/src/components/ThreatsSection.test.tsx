import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ELEMENT_ID, MODEL_ID, element, installFakeApi, json, renderWithClient, threat } from '../test-utils.js';
import { ThreatsSection } from './ThreatsSection.js';

// The Threats tab: summary, filters in the address, the count line, pages, and a row that leaves the view
// (contracts/web-ui.md §1 and §3; spec FR-019 to FR-022).
afterEach(() => {
  vi.unstubAllGlobals();
});

const OTHER_ID = '99999999-1111-4111-8111-999999999999';
const idOf = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const made = (n: number, overrides: Record<string, unknown> = {}) =>
  threat({ id: idOf(n), title: `T${n}`, created_at: `2026-10-01T10:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000Z`, ...overrides });

// What the address is, and how it last changed: a new history entry (PUSH) or the same one rewritten (REPLACE).
function LocationProbe() {
  const { search } = useLocation();
  const how = useNavigationType();
  return (
    <>
      <output data-testid="search">{search}</output>
      <output data-testid="how">{how}</output>
    </>
  );
}

interface Served {
  threats: Record<string, unknown>[];
}

// A fake server that keeps the threats it is given, so a list read after a write shows the write.
function serve(initial: Record<string, unknown>[], elements: unknown[] = [element()], heldElements?: Promise<Response>) {
  const state: Served = { threats: [...initial] };
  const api = installFakeApi({
    [`GET /api/v1/threat-models/${MODEL_ID}/threats`]: () => json(200, state.threats),
    [`GET /api/v1/threat-models/${MODEL_ID}/mitigations`]: () => json(200, []),
    [`GET /api/v1/threat-models/${MODEL_ID}/elements`]: () => heldElements ?? json(200, elements),
    'PATCH /api/v1/threats/:id': ({ params, body }) => {
      state.threats = state.threats.map((t) => (t.id === params.id ? { ...t, ...(body as Record<string, unknown>) } : t));
      return json(200, state.threats.find((t) => t.id === params.id));
    },
    'DELETE /api/v1/threats/:id': ({ params }) => {
      state.threats = state.threats.filter((t) => t.id !== params.id);
      return new Response(null, { status: 204 });
    },
  });
  return { api, state };
}

function show(query = '') {
  return renderWithClient(
    <MemoryRouter initialEntries={[`/threat-models/${MODEL_ID}${query}`]}>
      <ThreatsSection threatModelId={MODEL_ID} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

// The titles in the table, in order, read from each row's status control.
const titles = (): string[] =>
  screen.queryAllByRole('combobox', { name: /^Status of / }).map((control) => (control.getAttribute('aria-label') ?? '').replace('Status of ', ''));
const search = (): string => screen.getByTestId('search').textContent ?? '';
const how = (): string => screen.getByTestId('how').textContent ?? '';
const summaryValue = (label: string): string | null =>
  within(screen.getByRole('region', { name: 'Threat summary' })).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? null;

const MIXED = [
  made(1, { status: 'open', risk: 'Critical', element_id: ELEMENT_ID }),
  made(2, { status: 'open', risk: 'High', element_id: null }),
  made(3, { status: 'mitigated', risk: 'High', element_id: ELEMENT_ID }),
  made(4, { status: 'accepted', risk: 'Low', status_reason: 'Covered', element_id: OTHER_ID, origin: 'rule', library_ref: 'r-4' }),
  made(5, { status: 'not_applicable', risk: 'Medium', status_reason: 'Out of scope', element_id: null, stale: { reason: 'rule_unknown' }, origin: 'rule', library_ref: 'r-5' }),
];

describe('the summary (FR-021)', () => {
  it('counts the threats in each status, and the open ones at each risk level', async () => {
    serve(MIXED);
    show();
    await screen.findByText('T1');
    expect(['Open', 'Mitigated', 'Accepted', 'Not applicable'].map(summaryValue)).toEqual(['2', '1', '1', '1']);
    expect(['Critical', 'High', 'Medium', 'Low'].map(summaryValue)).toEqual(['1', '1', '0', '0']);
  });

  it('is over the whole threat model, whatever the filters', async () => {
    serve(MIXED);
    show('?status=mitigated');
    await screen.findByText('T3');
    expect(titles()).toEqual(['T3']);
    expect(['Open', 'Mitigated', 'Accepted', 'Not applicable'].map(summaryValue)).toEqual(['2', '1', '1', '1']);
  });
});

describe('the count line and the filters in the address (FR-019)', () => {
  it('says how many threats match, out of how many there are', async () => {
    serve(MIXED);
    show('?status=open');
    expect(await screen.findByText('Showing 2 of 5 threats')).toBeTruthy();
    expect(titles()).toEqual(['T1', 'T2']);
  });

  it('puts a chosen filter in the address, and applies it at once', async () => {
    serve(MIXED);
    show();
    await screen.findByText('T1');
    expect(search()).toBe('');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Open' }));

    expect(search()).toBe('?status=open');
    // A new history entry, so Back undoes the filter.
    expect(how()).toBe('PUSH');
    expect(titles()).toEqual(['T1', 'T2']);
    expect(screen.getByText('Showing 2 of 5 threats')).toBeTruthy();
  });

  it('applies every filter the address carries, so a shared link shows the same list', async () => {
    serve(MIXED);
    show('?risk=Critical&risk=High&sort=risk');
    await screen.findByText('Showing 3 of 5 threats');
    expect(titles()).toEqual(['T1', 'T2', 'T3']);
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Order' }).value).toBe('risk');
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Critical' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Low' }).checked).toBe(false);
  });

  it('filters by origin, by stale only, and by no element', async () => {
    serve(MIXED);
    show();
    await screen.findByText('T1');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Origin' }), 'rule');
    expect(titles()).toEqual(['T4', 'T5']);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Stale only' }));
    expect(titles()).toEqual(['T5']);
    expect(search()).toBe('?origin=rule&stale=1');

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Element' }), 'none');
    expect(titles()).toEqual(['T2', 'T5']);
    expect(search()).toBe('?element=none');
  });

  it('says so when nothing matches, and Clear filters brings everything back', async () => {
    serve(MIXED);
    show('?status=mitigated&origin=rule');
    expect(await screen.findByText('No threat matches these filters.')).toBeTruthy();
    expect(titles()).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(search()).toBe('');
    expect(await screen.findByText('Showing 5 of 5 threats')).toBeTruthy();
    expect(titles()).toHaveLength(5);
  });
});

describe('a filter on an element (FR-022)', () => {
  it('is not judged before the elements have arrived: a valid element is not dropped for being slow', async () => {
    let release: (response: Response) => void = () => undefined;
    serve(MIXED, [], new Promise<Response>((resolve) => (release = resolve)));
    show(`?element=${ELEMENT_ID}`);
    // The elements are still on their way: nothing is judged, and the address is left as it was.
    expect(await screen.findByText('Loading…')).toBeTruthy();
    expect(search()).toBe(`?element=${ELEMENT_ID}`);
    expect(screen.queryByText(/no longer exists/)).toBeNull();

    release(json(200, [element()]));
    await waitFor(() => expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Element' }).value).toBe(ELEMENT_ID));
    expect(search()).toBe(`?element=${ELEMENT_ID}`);
    expect(screen.queryByText(/no longer exists/)).toBeNull();
    expect(titles()).toEqual(['T1', 'T3']);
  });

  it('is dropped, with a message, once the elements show it is gone', async () => {
    serve(MIXED, [element({ id: OTHER_ID, name: 'Other' })]);
    show(`?element=${ELEMENT_ID}&status=open`);
    expect(await screen.findByText('The element in this filter no longer exists, so the filter was removed.')).toBeTruthy();
    // Only the element key goes; the rest of the filter stays.
    await waitFor(() => expect(search()).toBe('?status=open'));
    expect(titles()).toEqual(['T1', 'T2']);
  });

  it('replaces the entry in the history instead of adding one, so Back does not bring the dead filter back', async () => {
    serve(MIXED, [element({ id: OTHER_ID, name: 'Other' })]);
    show(`?element=${ELEMENT_ID}`);
    await screen.findByText('The element in this filter no longer exists, so the filter was removed.');
    expect(search()).toBe('');
    expect(how()).toBe('REPLACE');
  });
});

describe('pages of 100 (research #9)', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => made(i + 1, { risk: 'Low' }));

  it('shows 100 rows, "Page 1 of 3", and the next hundred on Next', async () => {
    serve(many(250));
    show();
    expect(await screen.findByText('Page 1 of 3')).toBeTruthy();
    expect(titles()).toHaveLength(100);
    expect(titles()[0]).toBe('T1');
    expect(screen.getByText('Showing 250 of 250 threats')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
    expect(titles()[0]).toBe('T101');
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(titles()[0]).toBe('T1');
  });

  it('shows no pager for a single page', async () => {
    serve(many(100));
    show();
    await screen.findByText('T1');
    expect(screen.queryByRole('navigation', { name: 'Threat pages' })).toBeNull();
  });

  it('goes back to page 1 when a filter changes', async () => {
    serve(many(250));
    show();
    await screen.findByText('Page 1 of 3');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Open' }));

    expect(screen.getByText('Page 1 of 3')).toBeTruthy();
    expect(titles()[0]).toBe('T1');
  });

  it('moves to the last page that still exists when edits shrink the list', async () => {
    serve(many(201));
    show();
    await screen.findByText('Page 1 of 3');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(titles()).toEqual(['T201']);

    await userEvent.click(screen.getByRole('button', { name: 'Delete threat T201' }));
    await userEvent.click(within(document.querySelector('dialog') as HTMLElement).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Page 2 of 2')).toBeTruthy();
    expect(titles()[0]).toBe('T101');
  });
});

describe('a row that leaves the view (contracts/web-ui.md §1)', () => {
  const OPEN = [made(1), made(2), made(3)];

  async function accept(title: string) {
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: `Status of ${title}` }), 'accepted');
    await userEvent.type(await screen.findByRole('textbox', { name: `Reason for accepting ${title}` }), 'Covered');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  }

  it('moves focus to the next row\'s status control, and says what happened', async () => {
    serve(OPEN);
    show('?status=open');
    await screen.findByText('Showing 3 of 3 threats');

    await accept('T1');

    await waitFor(() => expect(titles()).toEqual(['T2', 'T3']));
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Status of T2');
    expect(screen.getByText('Saved. The threat no longer matches this view.')).toBeTruthy();
  });

  it('moves to the previous row when it was the last, and to the count line when none is left', async () => {
    serve(OPEN);
    show('?status=open');
    await screen.findByText('Showing 3 of 3 threats');
    await accept('T3');
    await waitFor(() => expect(titles()).toEqual(['T1', 'T2']));
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Status of T2');

    await accept('T2');
    await waitFor(() => expect(titles()).toEqual(['T1']));
    await accept('T1');
    await waitFor(() => expect(titles()).toEqual([]));
    expect(document.activeElement).toBe(screen.getByText('No threat matches these filters.').closest('[tabindex]'));
  });

  // The region describes the latest save only (T069). It is found by its words; the words are the same each time.
  const message = (): HTMLElement | null => screen.queryByText(/no longer matches this view/);

  it('forgets the message when a later save keeps its row', async () => {
    serve(OPEN);
    show('?status=open');
    await screen.findByText('Showing 3 of 3 threats');
    await accept('T1');
    await waitFor(() => expect(message()).not.toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Edit threat T2' }));
    await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'Low');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(message()).toBeNull());
    expect(titles()).toEqual(['T2', 'T3']);
  });

  // A live region speaks when its text changes. The words are the same for a second row that leaves, so the text
  // has to differ in something that is not heard, or the second row would go unannounced.
  it('announces a second row that leaves, though the words are the same as the first', async () => {
    serve(OPEN);
    show('?status=open');
    await screen.findByText('Showing 3 of 3 threats');
    await accept('T1');
    await waitFor(() => expect(message()).not.toBeNull());
    const first = message()?.textContent;

    await accept('T2');

    await waitFor(() => expect(titles()).toEqual(['T3']));
    const second = message()?.textContent;
    expect(second).not.toBe(first);
    expect(second?.trim()).toBe(first?.trim());
  });

  it('forgets the message when the page changes', async () => {
    serve(Array.from({ length: 201 }, (_, i) => made(i + 1)));
    show('?status=open');
    await screen.findByText('Page 1 of 3');
    await accept('T1');
    await waitFor(() => expect(message()).not.toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(message()).toBeNull();
  });

  it('does not announce a row that stays in the view', async () => {
    serve(OPEN);
    show();
    await screen.findByText('Showing 3 of 3 threats');
    await accept('T1');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status of T1' }).getAttribute('aria-label')).toBeTruthy());
    expect(screen.queryByText('Saved. The threat no longer matches this view.')).toBeNull();
  });
});
