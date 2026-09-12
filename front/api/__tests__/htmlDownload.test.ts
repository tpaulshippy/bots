/**
 * @jest-environment jsdom
 */
import { withDownloadSandbox } from '../htmlPages';

describe('withDownloadSandbox', () => {
  const page =
    '<!DOCTYPE html><html><head><title>Dino</title></head>' +
    '<body><h1>hi</h1><script>const s = "<head> trap"; console.log(s);</script></body></html>';

  it('frames the page in a script-only sandbox with no top navigation', () => {
    const out = withDownloadSandbox(page, 'Dino');
    expect(out).toContain('<iframe sandbox="allow-scripts"');
    expect(out).not.toContain('allow-top-navigation');
    expect(out).not.toContain('allow-same-origin');
    expect(out).not.toContain('allow-forms');
  });

  it('keeps the inner meta CSP and page content inside srcdoc', () => {
    const out = withDownloadSandbox(page, 'Dino');
    const srcdoc = out.split('srcdoc="')[1].split('"></iframe>')[0];
    // Unescape once to inspect what the framed document actually is.
    const inner = srcdoc.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    expect(inner).toContain('http-equiv="Content-Security-Policy"');
    expect(inner).toContain("connect-src 'none'");
    expect(inner).toContain('<h1>hi</h1>');
    // The "<head> trap" string inside page JS did not create a second head:
    // the meta policy sits in the real head, ahead of page content.
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const iframe = doc.querySelector('iframe');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
    const innerDoc = new DOMParser().parseFromString(inner, 'text/html');
    expect(innerDoc.querySelectorAll('head').length).toBe(1);
    const metaEl = innerDoc.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
    expect(metaEl).not.toBeNull();
    // Meta policy is first in head, ahead of the page's own title element.
    expect(innerDoc.head.firstElementChild).toBe(metaEl);
  });

  it('uses the page title for wrapper and frame', () => {
    const out = withDownloadSandbox(page, 'Dino Fun');
    expect(out).toContain('<title>Dino Fun</title>');
    expect(out).toContain('title="Dino Fun"');
  });
});
