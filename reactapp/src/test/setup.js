import '@testing-library/jest-dom/vitest';

// jsdom deliberately omits layout and scrolling. Keep component tests quiet
// while preserving the browser code paths that call these standard APIs.
Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  writable: true,
  value: () => {},
});

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  writable: true,
  value: () => {},
});
