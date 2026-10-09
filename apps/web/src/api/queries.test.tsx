import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MITIGATION_ID, MITIGATION_ID_2, MODEL_ID, THREAT_ID, THREAT_ID_2, installFakeApi, json, mitigation, threat } from '../test-utils.js';
import {
  useCreateMitigation,
  useCreateThreat,
  useDeleteMitigation,
  useDeleteThreat,
  useModelMitigations,
  useThreats,
  useUpdateMitigation,
  useUpdateThreat,
} from './queries.js';

// Research #10: a write puts the record the server returned into the lists the page holds, instead of reading a
// list of up to 15,000 threats and 49,000 mitigations again after every change. What is shown is still what the
// server confirmed, so nothing here is optimistic.

afterEach(() => {
  vi.unstubAllGlobals();
});

const THREATS = `/api/v1/threat-models/${MODEL_ID}/threats`;
const MITIGATIONS = `/api/v1/threat-models/${MODEL_ID}/mitigations`;

function mount(handlers: Parameters<typeof installFakeApi>[0] = {}, lists: { threats?: unknown[]; mitigations?: unknown[] } = {}) {
  const api = installFakeApi({
    [`GET ${THREATS}`]: () => json(200, lists.threats ?? [threat(), threat({ id: THREAT_ID_2, title: 'Other' })]),
    [`GET ${MITIGATIONS}`]: () => json(200, lists.mitigations ?? [mitigation(), mitigation({ id: MITIGATION_ID_2, threat_id: THREAT_ID_2 })]),
    ...handlers,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(
    () => ({
      threats: useThreats(MODEL_ID),
      mitigations: useModelMitigations(MODEL_ID),
      createThreat: useCreateThreat(MODEL_ID),
      updateThreat: useUpdateThreat(MODEL_ID),
      deleteThreat: useDeleteThreat(MODEL_ID),
      createMitigation: useCreateMitigation(MODEL_ID),
      updateMitigation: useUpdateMitigation(MODEL_ID),
      deleteMitigation: useDeleteMitigation(MODEL_ID),
    }),
    { wrapper },
  );
  return { api, client, view };
}

const threatReads = (api: ReturnType<typeof installFakeApi>) => api.callsTo('GET', THREATS).length;
const mitigationReads = (api: ReturnType<typeof installFakeApi>) => api.callsTo('GET', MITIGATIONS).length;
const ready = (view: ReturnType<typeof mount>['view']) =>
  waitFor(() => expect(view.result.current.threats.data && view.result.current.mitigations.data).toBeTruthy());

describe('threat writes', () => {
  it('create appends the returned threat to the cached list, with no new read', async () => {
    const created = threat({ id: '10000000-0000-4000-8000-0000000000aa', title: 'New one' });
    const { api, view } = mount({ 'POST /api/v1/threats': () => json(201, created) });
    await ready(view);

    await act(() => view.result.current.createThreat.mutateAsync({ threat_model_id: MODEL_ID, element_id: null, category: 'Spoofing', title: 'New one', description: '', likelihood: 'High', impact: 'High', status: 'open', origin: 'manual', library_ref: null, status_reason: null }));

    await waitFor(() => expect(view.result.current.threats.data?.map((t) => t.title)).toEqual(['Session token theft', 'Other', 'New one']));
    expect(threatReads(api)).toBe(1);
  });

  it('update replaces the threat by id, keeping the order, with no new read', async () => {
    const { api, view } = mount({ [`PATCH /api/v1/threats/${THREAT_ID}`]: () => json(200, threat({ title: 'Renamed', status: 'accepted', status_reason: 'Covered' })) });
    await ready(view);

    await act(() => view.result.current.updateThreat.mutateAsync({ id: THREAT_ID, input: { title: 'Renamed' } }));

    await waitFor(() => expect(view.result.current.threats.data?.map((t) => [t.title, t.status])).toEqual([['Renamed', 'accepted'], ['Other', 'open']]));
    expect(threatReads(api)).toBe(1);
  });

  it('delete removes the threat, and its mitigations from the mitigation list, with no new read of either', async () => {
    const { api, view } = mount({ [`DELETE /api/v1/threats/${THREAT_ID}`]: () => new Response(null, { status: 204 }) });
    await ready(view);

    await act(() => view.result.current.deleteThreat.mutateAsync(THREAT_ID));

    await waitFor(() => expect(view.result.current.threats.data?.map((t) => t.id)).toEqual([THREAT_ID_2]));
    await waitFor(() => expect(view.result.current.mitigations.data?.map((m) => m.id)).toEqual([MITIGATION_ID_2]));
    expect([threatReads(api), mitigationReads(api)]).toEqual([1, 1]);
  });

  it('does nothing to a list the page has not loaded', async () => {
    installFakeApi({ 'POST /api/v1/threats': () => json(201, threat()) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useCreateThreat(MODEL_ID), { wrapper });

    await act(() => result.current.mutateAsync({ threat_model_id: MODEL_ID, element_id: null, category: 'Spoofing', title: 'x', description: '', likelihood: 'High', impact: 'High', status: 'open', origin: 'manual', library_ref: null, status_reason: null }));

    expect(client.getQueryData(['threats', MODEL_ID])).toBeUndefined();
  });
});

describe('mitigation writes', () => {
  it('create appends, update replaces and delete removes, each with no new read', async () => {
    const added = mitigation({ id: '20000000-0000-4000-8000-0000000000bb', description: 'Added' });
    const { api, view } = mount({
      'POST /api/v1/mitigations': () => json(201, added),
      [`PATCH /api/v1/mitigations/${MITIGATION_ID}`]: () => json(200, mitigation({ status: 'implemented' })),
      [`DELETE /api/v1/mitigations/${MITIGATION_ID_2}`]: () => new Response(null, { status: 204 }),
    });
    await ready(view);

    await act(() => view.result.current.createMitigation.mutateAsync({ threat_id: THREAT_ID, description: 'Added', status: 'proposed', external_ref: null }));
    await waitFor(() => expect(view.result.current.mitigations.data?.map((m) => m.description)).toEqual(['Rotate refresh credentials', 'Rotate refresh credentials', 'Added']));

    await act(() => view.result.current.updateMitigation.mutateAsync({ id: MITIGATION_ID, input: { status: 'implemented' } }));
    await waitFor(() => expect(view.result.current.mitigations.data?.find((m) => m.id === MITIGATION_ID)?.status).toBe('implemented'));

    await act(() => view.result.current.deleteMitigation.mutateAsync(MITIGATION_ID_2));
    await waitFor(() => expect(view.result.current.mitigations.data?.map((m) => m.id)).toEqual([MITIGATION_ID, added.id]));

    expect(mitigationReads(api)).toBe(1);
    expect(threatReads(api)).toBe(1);
  });
});

describe('a write that finds its record gone', () => {
  it('still reads the list again, so the page shows what the server has', async () => {
    const { api, view } = mount({ [`PATCH /api/v1/threats/${THREAT_ID}`]: () => json(404, { error: 'Threat not found' }) });
    await ready(view);

    await act(async () => {
      await view.result.current.updateThreat.mutateAsync({ id: THREAT_ID, input: { title: 'x' } }).catch(() => undefined);
    });

    await waitFor(() => expect(threatReads(api)).toBe(2));
  });
});

describe('a read that is already on its way', () => {
  it('is followed by another when a write lands, so older data cannot undo the write', async () => {
    let hold: (response: Response) => void = () => undefined;
    let reads = 0;
    const { api, client, view } = mount({
      [`GET ${THREATS}`]: () => {
        reads += 1;
        if (reads === 2) return new Promise<Response>((resolve) => (hold = resolve));
        return json(200, [threat(), threat({ id: THREAT_ID_2, title: 'Other' })]);
      },
      [`PATCH /api/v1/threats/${THREAT_ID}`]: () => json(200, threat({ title: 'Renamed' })),
    });
    await ready(view);

    // A second read of the threats starts and does not finish: the page is part-way through reading them again.
    void client.refetchQueries({ queryKey: ['threats', MODEL_ID] });
    await waitFor(() => expect(threatReads(api)).toBe(2));

    await act(() => view.result.current.updateThreat.mutateAsync({ id: THREAT_ID, input: { title: 'Renamed' } }));
    hold(json(200, [threat({ title: 'Older answer' })]));

    // The write is shown, and a fresh read was started after it rather than trusting the one in flight.
    await waitFor(() => expect(threatReads(api)).toBeGreaterThanOrEqual(3));
  });
});
