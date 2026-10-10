import { describe, expect, it } from 'vitest';
import { buildReport, type Report } from '../../src/report/model.js';
import { renderSvg } from '../../src/report/svg.js';
import { element, elementId, empty, EXPORTED_AT, hostile, typical } from './fixtures.js';

// research #11: the diagram of the HTML report, drawn where the canvas draws it.

const svgOf = (report: Report): string => renderSvg(report);
const report = buildReport(typical(), EXPORTED_AT);
const svg = svgOf(report);

interface Point {
  x: number;
  y: number;
}
interface Box extends Point {
  width: number;
  height: number;
}
const numbers = (tag: string, names: string[]): number[] => names.map((name) => Number(new RegExp(`\\s${name}="(-?[\\d.]+)"`).exec(tag)?.[1]));
const boxOf = (tag: string): Box => {
  const [x, y, width, height] = numbers(tag, ['x', 'y', 'width', 'height']) as [number, number, number, number];
  return { x, y, width, height };
};
// The shape of one element: the group with its id, up to its end.
const groupOf = (document: string, id: string): string => new RegExp(`<g id="${id}"[\\s\\S]*?</g>`).exec(document)?.[0] ?? '';

const EPS = 0.02;
const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;
const within = (v: number, low: number, high: number): boolean => v >= low - EPS && v <= high + EPS;
function onBorder(p: { x: number; y: number }, r: Box): boolean {
  const onSide = (near(p.x, r.x) || near(p.x, r.x + r.width)) && within(p.y, r.y, r.y + r.height);
  const onTop = (near(p.y, r.y) || near(p.y, r.y + r.height)) && within(p.x, r.x, r.x + r.width);
  return onSide || onTop;
}
const lineOf = (document: string, id: string): { from: { x: number; y: number }; to: { x: number; y: number } } => {
  const [x1, y1, x2, y2] = numbers(/<line [^>]*>/.exec(groupOf(document, id))?.[0] ?? '', ['x1', 'y1', 'x2', 'y2']) as [number, number, number, number];
  return { from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
};

describe('the picture', () => {
  it('is an image with a text alternative, and the view box of the model', () => {
    const { x, y, width, height } = report.diagram.viewBox as Box;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" class="diagram" role="img" aria-labelledby="diagram-caption"')).toBe(true);
    expect(svg).toContain(` viewBox="${x} ${y} ${width} ${height}"`);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('is empty when there is nothing to draw', () => {
    expect(svgOf(buildReport(empty(), EXPORTED_AT))).toBe('');
  });

  it('draws every element where the canvas does (FR-006)', () => {
    for (const shape of [...report.diagram.nodes, ...report.diagram.boundaries]) {
      // An open-sided data store is a path rather than a rectangle; its shape is checked below.
      if (shape.type === 'data_store') continue;
      const id = `r-${shape.type === 'trust_boundary' ? 'b' : 'n'}${shape.ref.slice(1)}`;
      const drawn = boxOf(/<rect [^>]*>/.exec(groupOf(svg, id))?.[0] ?? '');
      expect(drawn, shape.displayName).toEqual({ x: shape.x, y: shape.y, width: shape.width, height: shape.height });
    }
  });

  it('shapes each type differently, without colour', () => {
    const api = groupOf(svg, 'r-n2');
    expect(api).toContain('class="shape process"');
    expect(api).toMatch(/<rect class="box" [^>]*rx="12"/);
    const entity = groupOf(svg, 'r-n8');
    expect(entity).toContain('class="shape entity"');
    expect(entity).toMatch(/<rect class="box" /);
    expect(entity).not.toContain('rx=');
    const store = groupOf(svg, 'r-n7');
    expect(store).toContain('class="shape store"');
    expect(store).toContain('<path class="store-line" ');
    expect(store).not.toContain('<rect');
    const boundary = groupOf(svg, 'r-b1');
    expect(boundary).toContain('class="shape boundary"');
    expect(boundary).toContain('<rect class="boundary-box" ');
  });

  it('draws outer boundaries first, then inner, then the nodes, then the flows', () => {
    const at = (id: string): number => svg.indexOf(`id="${id}"`);
    expect(at('r-b1')).toBeGreaterThan(-1);
    expect(at('r-b1')).toBeLessThan(at('r-b6'));
    expect(at('r-b6')).toBeLessThan(at('r-n2'));
    expect(at('r-n8')).toBeLessThan(at('r-f4'));
  });

  it('names each element inside its shape', () => {
    expect(groupOf(svg, 'r-n2')).toMatch(/<text [^>]*>API<\/text>/);
    expect(groupOf(svg, 'r-b1')).toMatch(/<text [^>]*>Internal network<\/text>/);
    expect(groupOf(svg, 'r-f5')).toMatch(/<text [^>]*>SQL<\/text>/);
  });
});

describe('the flows', () => {
  const rectOf = (ref: string): Box => {
    const shape = report.diagram.nodes.find((node) => node.ref === ref) as Box;
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  };

  it('is an arrow from the border of one shape to the border of the other, not centre to centre', () => {
    for (const flow of report.diagram.flows) {
      const { from, to } = lineOf(svg, `r-f${flow.ref.slice(1)}`);
      expect(onBorder(from, rectOf(flow.sourceRef)), `${flow.displayName} starts on its source`).toBe(true);
      expect(onBorder(to, rectOf(flow.targetRef)), `${flow.displayName} ends on its target`).toBe(true);
    }
  });

  it('ends in an arrowhead drawn from the document itself', () => {
    expect(svg.match(/<line /g)).toHaveLength(report.diagram.flows.length);
    expect(svg.match(/marker-end="url\(#arrow\)"/g)).toHaveLength(report.diagram.flows.length);
    expect(svg).toContain('<defs><marker id="arrow" ');
  });

  describe('the label of a flow', () => {
    // Where the label is centred (the text's baseline sits 4 units below its middle).
    const labelAt = (document: string, id: string): Point => {
      const [x, y] = numbers(/<text class="flow-label"[^>]*>/.exec(groupOf(document, id))?.[0] ?? '', ['x', 'y']) as [number, number];
      return { x, y: y - 4 };
    };

    it('has no box behind it: it would hide the shapes it passes over', () => {
      expect(svg).not.toContain('flow-label-bg');
    });

    it('sits beside its line and not on it, so a long label never hides the arrow', () => {
      // Jobs runs straight down from API to Worker: its label is to the right of the line.
      const jobs = lineOf(svg, 'r-f4');
      expect(near(jobs.from.x, jobs.to.x)).toBe(true);
      // The label is 4 characters wide (about 29 units): its middle is at least half of that, and a gap, from the line.
      expect(labelAt(svg, 'r-f4').x - jobs.from.x).toBeGreaterThanOrEqual(14.4 + 3);
      // A flow running across: its label is above the line.
      const snap = {
        ...empty(),
        elements: [
          element(1, { layout: { x: 0, y: 0 } }),
          element(2, { layout: { x: 300, y: 0 } }),
          element(3, { type: 'data_flow', name: 'across', layout: null, source_element_id: elementId(1), target_element_id: elementId(2) }),
        ],
      };
      const across = svgOf(buildReport(snap, EXPORTED_AT));
      const line = lineOf(across, 'r-f3');
      expect(line.from.y - labelAt(across, 'r-f3').y).toBeGreaterThanOrEqual(8 + 3);
    });

    it('goes on the other side for each of two flows that share two shapes, so neither covers the other', () => {
      const snap = {
        ...empty(),
        elements: [
          element(1, { layout: { x: 0, y: 0 } }),
          element(2, { layout: { x: 300, y: 0 } }),
          element(3, { type: 'data_flow', name: 'there', layout: null, source_element_id: elementId(1), target_element_id: elementId(2) }),
          element(4, { type: 'data_flow', name: 'back', layout: null, source_element_id: elementId(2), target_element_id: elementId(1) }),
        ],
      };
      const both = svgOf(buildReport(snap, EXPORTED_AT));
      const first = labelAt(both, 'r-f3');
      const second = labelAt(both, 'r-f4');
      const lineY = lineOf(both, 'r-f3').from.y;
      // The two lines are 12 apart, and each label is clear of its own line on the outer side.
      expect(Math.abs(first.y - second.y)).toBeGreaterThanOrEqual(12 + 2 * (8 + 3));
      expect(first.y < lineY && second.y > lineY).toBe(true);
    });
  });

  it('spreads flows that join the same two shapes by 12 units, whichever way they go', () => {
    const snap = {
      ...empty(),
      elements: [
        element(1, { layout: { x: 0, y: 0 } }),
        element(2, { layout: { x: 300, y: 0 } }),
        element(3, { type: 'data_flow', name: 'there', layout: null, source_element_id: elementId(1), target_element_id: elementId(2) }),
        element(4, { type: 'data_flow', name: 'back', layout: null, source_element_id: elementId(2), target_element_id: elementId(1) }),
        element(5, { type: 'data_flow', name: 'again', layout: null, source_element_id: elementId(1), target_element_id: elementId(2) }),
      ],
    };
    const crowded = buildReport(snap, EXPORTED_AT);
    const ys = crowded.diagram.flows.map((flow) => {
      const { from, to } = lineOf(svgOf(crowded), `r-f${flow.ref.slice(1)}`);
      expect(near(from.y, to.y)).toBe(true);
      return from.y;
    });
    expect([...ys].sort((a, b) => a - b)).toEqual([18, 30, 42]);
  });
});

describe('long names (the spec’s "Very long text" edge case)', () => {
  const name = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';
  const fits = 'a'.repeat(17);
  const tooLong = 'a'.repeat(18);

  it('cuts a name that would overflow its shape at a whole character, and keeps the full name in a title', () => {
    const long = buildReport({ ...empty(), elements: [element(1, { name })] }, EXPORTED_AT);
    expect(groupOf(svgOf(long), 'r-n1')).toContain(`>abcdefghijklmnop…<title>${name}</title></text>`);
  });

  it('cuts exactly when the name is wider than the shape: 17 characters fit in 140 units, 18 do not', () => {
    const drawn = (text: string): string => groupOf(svgOf(buildReport({ ...empty(), elements: [element(1, { name: text })] }, EXPORTED_AT)), 'r-n1');
    expect(drawn(fits)).toContain(`>${fits}</text>`);
    expect(drawn(fits)).not.toContain('<title>');
    expect(drawn(tooLong)).toContain(`>${'a'.repeat(16)}…<title>${tooLong}</title></text>`);
  });

  it('counts a character outside the basic plane as one', () => {
    const emoji = '😀'.repeat(18);
    const drawn = groupOf(svgOf(buildReport({ ...empty(), elements: [element(1, { name: emoji })] }, EXPORTED_AT)), 'r-n1');
    expect(drawn).toContain(`>${'😀'.repeat(16)}…<title>${emoji}</title></text>`);
  });
});

describe('hostile text', () => {
  const hostileSvg = svgOf(buildReport(hostile(), EXPORTED_AT));

  it('turns nothing the user typed into markup, and puts none in an id or a class', () => {
    expect(hostileSvg.toLowerCase()).not.toContain('<script');
    expect(hostileSvg.toLowerCase()).not.toContain('<img');
    expect(hostileSvg).toContain('&lt;script&gt;');
    for (const tag of hostileSvg.match(/<[^>]*>/g) ?? []) expect(tag).not.toMatch(/\s(on[a-z]+|style)\s*=/i);
    const ids = [...hostileSvg.matchAll(/\sid="([^"]*)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) expect(id).toMatch(/^(?:r-[nbf][1-9]\d*|arrow)$/);
    for (const [, classes] of hostileSvg.matchAll(/\sclass="([^"]*)"/g)) expect(classes).toMatch(/^[a-z -]+$/);
  });

  it('has no style attribute, so the stylesheet’s hash covers all the look', () => {
    expect(svg).not.toMatch(/\sstyle=/);
    expect(hostileSvg).not.toMatch(/\sstyle=/);
  });
});
