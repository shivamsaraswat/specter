import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The root `pnpm run test` runs every package's tests at once, so a query that waits for the screen to change
// can be slow to get its turn on a busy machine. Four seconds instead of one: a test that is truly wrong still
// fails, only a little later.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
});

// jsdom may not implement the modal methods of <dialog>. These stand-ins only toggle `open` and
// dispatch `close`, which is all the components rely on.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}

// React Flow measures its container with ResizeObserver and reads the zoom from DOMMatrixReadOnly,
// neither of which jsdom has. These are the stand-ins its documentation gives for tests: they measure
// nothing, so a test that needs a size sets one itself.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub;
}
if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  class DOMMatrixReadOnlyStub {
    m22 = 1;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
      if (scale !== undefined) this.m22 = Number(scale);
    }
  }
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;
}

// An edge label measures its text with getBBox, which jsdom's SVG elements do not have.
if (typeof SVGElement !== 'undefined' && !('getBBox' in SVGElement.prototype)) {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  });
}
