import type { ReactFlowProps } from '@xyflow/react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL_ID, installFakeApi, json, mitigation, threat } from '../test-utils.js';
import { Canvas } from './Canvas.js';
import { DiagramEditorContext } from './DiagramEditorProvider.js';
import { ElementThreats } from './ElementThreats.js';
import { ElementsList } from './ElementsList.js';
import { eid, el, fakeEditor, renderWithEditor } from './test-helpers.js';
import { Toolbar } from './Toolbar.js';

// The threats of the selected element, below the canvas (contracts/web-ui.md §4; spec FR-011 to FR-014).

// Canvas is drawn for real, but React Flow is a stand-in: these tests are about the panel beside it.
vi.mock('@xyflow/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@xyflow/react')>();
  return { ...original, ReactFlow: (_props: ReactFlowProps) => <div data-testid="flow" /> };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const api = el(1, { type: 'process', name: 'API' });
const db = el(2, { type: 'data_store', name: 'DB' });
const vpc = el(3, { type: 'trust_boundary', name: 'VPC', layout: { x: 0, y: 0, width: 400, height: 300 } });
const inside = el(4, { type: 'process', name: 'Inside', parent_boundary_id: eid(3) });
const elements = [api, db, vpc, inside];

const T_API = '10000000-0000-4000-8000-000000000001';
const T_API_DONE = '10000000-0000-4000-8000-000000000002';
const T_DB = '10000000-0000-4000-8000-000000000003';
const T_MODEL = '10000000-0000-4000-8000-000000000004';
const T_VPC = '10000000-0000-4000-8000-000000000005';
const T_INSIDE = '10000000-0000-4000-8000-000000000006';

const threats = [
  threat({ id: T_API, title: 'Token theft', element_id: eid(1) }),
  threat({ id: T_API_DONE, title: 'Already accepted', element_id: eid(1), status: 'accepted', status_reason: 'Covered' }),
  threat({ id: T_DB, title: 'DB leak', element_id: eid(2) }),
  threat({ id: T_MODEL, title: 'Model-wide', element_id: null }),
  threat({ id: T_VPC, title: 'Boundary threat', element_id: eid(3) }),
  threat({ id: T_INSIDE, title: 'Inside threat', element_id: eid(4) }),
];

function fakeApi(held?: Promise<Response>) {
  return installFakeApi({
    [`GET /api/v1/threat-models/${MODEL_ID}/threats`]: () => json(200, threats),
    [`GET /api/v1/threat-models/${MODEL_ID}/mitigations`]: () => held ?? json(200, [mitigation({ threat_id: T_API, status: 'implemented' })]),
    [`PATCH /api/v1/threats/${T_API}`]: () => json(200, threat({ id: T_API, title: 'Token theft', element_id: eid(1), status: 'not_applicable', status_reason: 'Out of scope' })),
  });
}

function setup(selectedIds: string[], extra: ReactNode = null) {
  const editor = fakeEditor({ elements, selectedIds, undoLabel: 'Add API', redoLabel: 'Rename DB' });
  renderWithEditor(
    <MemoryRouter>
      {extra}
      <ElementThreats />
    </MemoryRouter>,
    editor,
  );
  return editor;
}

const panel = () => screen.getByRole('region', { name: 'Threats of the selected element' });

describe('what the panel says before there is an element', () => {
  it('asks the user to select one when nothing is selected', () => {
    fakeApi();
    setup([]);
    expect(within(panel()).getByText('Select an element on the diagram or in the elements list to see its threats.')).toBeTruthy();
  });

  it('asks for a single element when several are selected', () => {
    fakeApi();
    setup([eid(1), eid(2)]);
    expect(within(panel()).getByText('Select a single element to see its threats.')).toBeTruthy();
  });

  it('treats a selected id that is no longer in the diagram as nothing selected', () => {
    fakeApi();
    setup([eid(99)]);
    expect(within(panel()).getByText('Select an element on the diagram or in the elements list to see its threats.')).toBeTruthy();
  });
});

describe('the threats of one element (FR-011)', () => {
  it('heads the panel with the element, and lists exactly its threats, every status, and nothing else', async () => {
    fakeApi();
    setup([eid(1)]);
    expect(await within(panel()).findByRole('heading', { name: 'Threats of Process API' })).toBeTruthy();
    expect(within(panel()).getByText('Token theft')).toBeTruthy();
    expect(within(panel()).getByText('Already accepted')).toBeTruthy();
    for (const other of ['DB leak', 'Model-wide', 'Boundary threat', 'Inside threat']) expect(within(panel()).queryByText(other)).toBeNull();
  });

  it('leaves out the Element column: it is the same for every row', async () => {
    fakeApi();
    setup([eid(1)]);
    await within(panel()).findByText('Token theft');
    expect(within(panel()).queryByRole('columnheader', { name: 'Element' })).toBeNull();
  });

  it('says so, plainly, for an element with no threats', async () => {
    fakeApi();
    const idle = el(5, { type: 'process', name: 'Idle' });
    renderWithEditor(
      <MemoryRouter>
        <ElementThreats />
      </MemoryRouter>,
      fakeEditor({ elements: [...elements, idle], selectedIds: [idle.id] }),
    );
    expect(await within(panel()).findByText('Idle has no threats yet.')).toBeTruthy();
  });

  // A boundary's members are theirs: a threat on something inside is not the boundary's (spec FR-014).
  it('shows a trust boundary\'s own threats only, not those of what it holds', async () => {
    fakeApi();
    setup([eid(3)]);
    expect(await within(panel()).findByRole('heading', { name: 'Threats of Trust boundary VPC' })).toBeTruthy();
    expect(within(panel()).getByText('Boundary threat')).toBeTruthy();
    expect(within(panel()).queryByText('Inside threat')).toBeNull();
  });

  it('says it is loading until the mitigations the rows need have arrived', async () => {
    let release: (response: Response) => void = () => undefined;
    fakeApi(new Promise<Response>((resolve) => (release = resolve)));
    setup([eid(1)]);
    expect(await within(panel()).findByText('Loading threats…')).toBeTruthy();
    release(json(200, []));
    expect(await within(panel()).findByText('Token theft')).toBeTruthy();
  });

  it('links to the threat list filtered to the element (FR-013)', async () => {
    fakeApi();
    setup([eid(1)]);
    const link = await within(panel()).findByRole('link', { name: 'Open in the threat list' });
    expect(link.getAttribute('href')).toBe(`/threat-models/${MODEL_ID}?element=${eid(1)}`);
  });
});

describe('working in the panel leaves the diagram as it is (FR-012)', () => {
  it('changes a status without selecting, applying, undoing, redoing or setting a notice on the diagram', async () => {
    const calls = fakeApi();
    const editor = setup([eid(1)]);
    const select = await within(panel()).findByRole('combobox', { name: 'Status of Token theft' });
    await userEvent.selectOptions(select, 'not_applicable');
    await userEvent.type(await within(panel()).findByRole('textbox'), 'Out of scope');
    await userEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.callsTo('PATCH', `/api/v1/threats/${T_API}`)).toHaveLength(1));

    for (const spy of [editor.select, editor.apply, editor.undo, editor.redo, editor.setNotice, editor.requestDelete]) {
      expect(spy).not.toHaveBeenCalled();
    }
    // What undo and redo would do is what it was.
    expect([editor.undoLabel, editor.redoLabel]).toEqual(['Add API', 'Rename DB']);
    expect(editor.selectedIds).toEqual([eid(1)]);
  });

  // The panel is outside the canvas, so the canvas's Delete handler never sees these keys, and the undo shortcuts
  // skip a text field (spec edge case "Typing beside the diagram").
  it('does not delete, undo or redo on the diagram while the user types in the reason field', async () => {
    fakeApi();
    const editor = setup([eid(1)], (
      <>
        <Toolbar />
        <Canvas />
      </>
    ));
    const select = await within(panel()).findByRole('combobox', { name: 'Status of Token theft' });
    await userEvent.selectOptions(select, 'accepted');
    const reason = await within(panel()).findByRole('textbox');
    expect(document.activeElement).toBe(reason);

    await userEvent.keyboard('{Delete}{Backspace}');
    await userEvent.keyboard('{Control>}z{/Control}');
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await userEvent.keyboard('{Control>}y{/Control}');

    expect(editor.requestDelete).not.toHaveBeenCalled();
    expect(editor.undo).not.toHaveBeenCalled();
    expect(editor.redo).not.toHaveBeenCalled();
  });
});

// Reaching an element without a pointer: the elements list is the keyboard's way to select (spec US2 scenario 9).
describe('the keyboard path', () => {
  function Stateful() {
    const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
    const editor = fakeEditor({ elements, selectedIds, select: (ids) => setSelectedIds([...ids]) });
    return (
      <DiagramEditorContext.Provider value={editor}>
        <MemoryRouter>
          <ElementsList />
          <ElementThreats />
        </MemoryRouter>
      </DiagramEditorContext.Provider>
    );
  }

  it('shows an element\'s threats once it is chosen in the elements list', async () => {
    fakeApi();
    renderWithEditor(<Stateful />);
    expect(within(panel()).getByText(/Select an element on the diagram/)).toBeTruthy();

    const button = screen.getByRole('button', { name: 'Process: API' });
    button.focus();
    await userEvent.keyboard('{Enter}');

    expect(await within(panel()).findByRole('heading', { name: 'Threats of Process API' })).toBeTruthy();
    expect(within(panel()).getByText('Token theft')).toBeTruthy();
  });
});

// US3: a manual threat can be added for the selected element, and moved to another (spec FR-018, FR-012).
describe('adding and moving a manual threat from the panel', () => {
  const NEW_ID = '10000000-0000-4000-8000-000000000009';

  // A fake server that keeps the threats it is given, so the list read after a write shows the write.
  function statefulApi() {
    let list = [...threats];
    const api = installFakeApi({
      [`GET /api/v1/threat-models/${MODEL_ID}/threats`]: () => json(200, list),
      [`GET /api/v1/threat-models/${MODEL_ID}/mitigations`]: () => json(200, []),
      [`GET /api/v1/threat-models/${MODEL_ID}/elements`]: () => json(200, elements),
      'POST /api/v1/threats': ({ body }) => {
        const made = threat({ id: NEW_ID, ...(body as Record<string, unknown>) });
        list = [...list, made];
        return json(201, made);
      },
      'PATCH /api/v1/threats/:id': ({ params, body }) => {
        list = list.map((t) => (t.id === params.id ? { ...t, ...(body as Record<string, unknown>) } : t));
        return json(200, list.find((t) => t.id === params.id));
      },
    });
    return api;
  }

  it('offers "Add threat for {name}" and posts a manual threat linked to the element', async () => {
    const api = statefulApi();
    setup([eid(1)]);
    await within(panel()).findByText('Token theft');

    await userEvent.click(within(panel()).getByRole('button', { name: 'Add threat for API' }));
    expect(within(panel()).getByLabelText<HTMLSelectElement>('Element').value).toBe(eid(1));
    await userEvent.type(within(panel()).getByLabelText('Title'), 'Business logic abuse');
    await userEvent.selectOptions(within(panel()).getByLabelText('Category'), 'Tampering');
    await userEvent.selectOptions(within(panel()).getByLabelText('Likelihood'), 'Medium');
    await userEvent.selectOptions(within(panel()).getByLabelText('Impact'), 'High');
    await userEvent.click(within(panel()).getByRole('button', { name: 'Add threat' }));

    await waitFor(() => expect(api.callsTo('POST', '/api/v1/threats')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/v1/threats')[0]?.body).toMatchObject({
      threat_model_id: MODEL_ID,
      element_id: eid(1),
      title: 'Business logic abuse',
      origin: 'manual',
    });
    expect(await within(panel()).findByText('Business logic abuse')).toBeTruthy();
  });

  it('offers it for an element with no threats too', async () => {
    statefulApi();
    const idle = el(5, { type: 'process', name: 'Idle' });
    renderWithEditor(
      <MemoryRouter>
        <ElementThreats />
      </MemoryRouter>,
      fakeEditor({ elements: [...elements, idle], selectedIds: [idle.id] }),
    );
    expect(await within(panel()).findByText('Idle has no threats yet.')).toBeTruthy();
    expect(within(panel()).getByRole('button', { name: 'Add threat for Idle' })).toBeTruthy();
  });

  it('leaves the panel when a manual threat is moved to another element', async () => {
    const api = statefulApi();
    setup([eid(1)]);
    await within(panel()).findByText('Token theft');

    await userEvent.click(within(panel()).getByRole('button', { name: 'Edit threat Token theft' }));
    await userEvent.selectOptions(within(panel()).getByLabelText('Element'), eid(2));
    await userEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.callsTo('PATCH', `/api/v1/threats/${T_API}`)).toHaveLength(1));
    expect(api.callsTo('PATCH', `/api/v1/threats/${T_API}`)[0]?.body).toEqual({ element_id: eid(2) });
    await waitFor(() => expect(within(panel()).queryByText('Token theft')).toBeNull());
    expect(within(panel()).getByText('Already accepted')).toBeTruthy();
  });

  // The panel says a threat left, for the latest save only (T069, contracts/web-ui.md §1).
  describe('the message about a threat that left', () => {
    function Panel() {
      const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
      const editor = fakeEditor({ elements, selectedIds, select: (ids) => setSelectedIds([...ids]) });
      return (
        <DiagramEditorContext.Provider value={editor}>
          <MemoryRouter>
            <ElementsList />
            <ElementThreats />
          </MemoryRouter>
        </DiagramEditorContext.Provider>
      );
    }
    const message = (): HTMLElement | null => screen.queryByText(/no longer matches this view/);

    async function moveToDb(title: string) {
      await userEvent.click(within(panel()).getByRole('button', { name: `Edit threat ${title}` }));
      await userEvent.selectOptions(within(panel()).getByLabelText('Element'), eid(2));
      await userEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    }

    async function open() {
      statefulApi();
      renderWithEditor(<Panel />);
      await userEvent.click(screen.getByRole('button', { name: 'Process: API' }));
      await within(panel()).findByText('Token theft');
    }

    it('says so when a threat leaves, and forgets it when another element is selected', async () => {
      await open();
      await moveToDb('Token theft');
      await waitFor(() => expect(message()).not.toBeNull());

      await userEvent.click(screen.getByRole('button', { name: 'Data store: DB' }));
      expect(await within(panel()).findByRole('heading', { name: 'Threats of Data store DB' })).toBeTruthy();
      expect(message()).toBeNull();
    });

    it('forgets it when a later save keeps its row', async () => {
      await open();
      await moveToDb('Token theft');
      await waitFor(() => expect(message()).not.toBeNull());

      await userEvent.click(within(panel()).getByRole('button', { name: 'Edit threat Already accepted' }));
      await userEvent.selectOptions(within(panel()).getByLabelText('Likelihood'), 'Low');
      await userEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(message()).toBeNull());
    });

    it('announces a second threat that leaves, though the words are the same', async () => {
      await open();
      await moveToDb('Token theft');
      await waitFor(() => expect(message()).not.toBeNull());
      const first = message()?.textContent;

      await moveToDb('Already accepted');

      await waitFor(() => expect(message()?.textContent).not.toBe(first));
      expect(message()?.textContent?.trim()).toBe(first?.trim());
    });
  });
});
