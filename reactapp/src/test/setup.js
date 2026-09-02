import '@testing-library/jest-dom/vitest';

// jsdom deliberately omits layout and scrolling. Keep component tests quiet
// while preserving the browser code paths that call these standard APIs.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
}

if (typeof Element !== 'undefined' && Element.prototype) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: () => {},
  });
}
