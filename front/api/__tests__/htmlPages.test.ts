import { getPageLink, withDownloadCsp } from '../htmlPages';
import { normalizeStreamEvent } from '../chats';
import * as requestModule from '../request';

describe('html pages', () => {
  it('maps save_html_page tool_end to pageId', () => {
    expect(
      normalizeStreamEvent(
        'status',
        '{"type":"tool_end","tool":"save_html_page","page_id":"p-1","name":"Dino"}'
      )
    ).toEqual({
      type: 'tool_end',
      tool: 'save_html_page',
      resultPreview: undefined,
      deckId: undefined,
      pageId: 'p-1',
      name: 'Dino',
      cardCount: undefined,
    });
  });

  it('builds absolute signed link URLs from the link endpoint', async () => {
    const spy = jest.spyOn(requestModule, 'request').mockResolvedValue({
      url: '/html-pages/p-1/raw/?sig=abc',
    });
    const url = await getPageLink('p-1');
    expect(spy).toHaveBeenCalledWith('/html-pages/p-1/link/', {}, null);
    expect(url).toMatch(/\/html-pages\/p-1\/raw\/\?sig=abc$/);
    spy.mockRestore();
  });

  it('returns null when the link endpoint has no url', async () => {
    const spy = jest.spyOn(requestModule, 'request').mockResolvedValue(null);
    await expect(getPageLink('p-1')).resolves.toBeNull();
    spy.mockRestore();
  });

  it('injects a network-blocking meta CSP into downloads', () => {
    const out = withDownloadCsp('<html><head><title>T</title></head><body>hi</body></html>');
    expect(out).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(out).toContain("connect-src 'none'");
    expect(out).toContain("script-src 'unsafe-inline'");
    expect(out.indexOf('<meta')).toBeGreaterThan(out.indexOf('<head>'));
  });

  it('prepends the meta CSP when there is no head element', () => {
    const out = withDownloadCsp('<html><body>hi</body></html>');
    expect(out.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
  });
});
