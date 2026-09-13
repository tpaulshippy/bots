import { fetchHtmlPages, getPageLink } from '../htmlPages';
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

  it('lists pages without a filter when no profile is given', async () => {
    const spy = jest.spyOn(requestModule, 'request').mockResolvedValue({ results: [], count: 0 });
    await fetchHtmlPages(null);
    expect(spy).toHaveBeenCalledWith('/html-pages.json', { method: 'GET' }, { results: [], count: 0 });
    spy.mockRestore();
  });

  it('filters pages by profile', async () => {
    const spy = jest.spyOn(requestModule, 'request').mockResolvedValue({ results: [], count: 0 });
    await fetchHtmlPages('p1');
    expect(spy).toHaveBeenCalledWith('/html-pages.json?profileId=p1', { method: 'GET' }, { results: [], count: 0 });
    spy.mockRestore();
  });
});
