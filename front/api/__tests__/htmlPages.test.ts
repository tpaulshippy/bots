import { htmlPageUrl } from '../htmlPages';
import { normalizeStreamEvent } from '../chats';

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

  it('builds raw url for local browser viewing', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000/api';
    expect(htmlPageUrl('p-1')).toBe('http://localhost:8000/api/html-pages/p-1/raw/');
  });
});
