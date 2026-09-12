/**
 * @jest-environment jsdom
 */
import { withDownloadCsp } from '../htmlPages';

describe('withDownloadCsp', () => {
  const page =
    '<!DOCTYPE html><html><head><title>Dino</title></head>' +
    '<body><h1>hi</h1><script>const s = "<head> trap"; console.log(s);</script></body></html>';

  it('injects a network-blocking meta CSP as the first head child', () => {
    const doc = new DOMParser().parseFromString(withDownloadCsp(page), 'text/html');
    expect(doc.querySelectorAll('head').length).toBe(1);
    const meta = doc.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
    expect(meta).not.toBeNull();
    expect(doc.head.firstElementChild).toBe(meta);
    expect(meta?.getAttribute('content')).toContain("connect-src 'none'");
  });

  it('keeps the page itself a bare, view-source friendly document', () => {
    const out = withDownloadCsp(page);
    expect(out).not.toContain('<iframe');
    expect(out).toContain('<h1>hi</h1>');
    expect(out).toContain('<title>Dino</title>');
  });

  it('is not fooled by a <head> string inside page JS', () => {
    const doc = new DOMParser().parseFromString(withDownloadCsp(page), 'text/html');
    // Still exactly one head: the trap string never became an element.
    expect(doc.querySelectorAll('head').length).toBe(1);
    expect(doc.body.textContent).toContain('hi');
  });
});
