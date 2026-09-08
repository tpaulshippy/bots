import {
  createSseParser,
  normalizeStreamEvent,
} from '../chats';

describe('createSseParser', () => {
  it('parses complete frames from a single chunk', () => {
    const frames: Array<[string, string]> = [];
    const parser = createSseParser((eventType, data) => frames.push([eventType, data]));

    parser.push('event: token\ndata: {"text":"Hi"}\n\nevent: done\ndata: {}\n\n');
    parser.flush();

    expect(frames).toEqual([
      ['token', '{"text":"Hi"}'],
      ['done', '{}'],
    ]);
  });

  it('reassembles frames split across chunk boundaries', () => {
    const frames: Array<[string, string]> = [];
    const parser = createSseParser((eventType, data) => frames.push([eventType, data]));

    // Each push cuts mid-frame, mid-line, even mid-JSON.
    parser.push('event: st');
    parser.push('atus\ndata: {"type":"tool_end","to');
    parser.push('ol":"create_flashcard_deck","deck_');
    parser.push('id":"d1"}');
    parser.push('\n\nevent: tok');
    parser.push('en\ndata: {"text":"He}\n\n');
    parser.flush();

    expect(frames).toEqual([
      ['status', '{"type":"tool_end","tool":"create_flashcard_deck","deck_id":"d1"}'],
      ['token', '{"text":"He}'],
    ]);
  });

  it('handles CRLF line endings and multi-line data', () => {
    const frames: Array<[string, string]> = [];
    const parser = createSseParser((eventType, data) => frames.push([eventType, data]));

    parser.push('event: meta\r\ndata: {"chat_id":\r\ndata: "c1"}\r\n\r\n');
    parser.flush();

    expect(frames).toEqual([['meta', '{"chat_id":\n"c1"}']]);
  });

  it('flushes a trailing frame without a blank-line terminator', () => {
    const frames: Array<[string, string]> = [];
    const parser = createSseParser((eventType, data) => frames.push([eventType, data]));

    parser.push('event: error\ndata: {"code":"internal"}');
    parser.flush();

    expect(frames).toEqual([['error', '{"code":"internal"}']]);
  });
});

describe('normalizeStreamEvent', () => {
  it('maps meta frames', () => {
    expect(normalizeStreamEvent('meta', '{"chat_id":"c-1","message_id":"m-1"}')).toEqual({
      type: 'meta',
      chatId: 'c-1',
      messageId: 'm-1',
    });
  });

  it('maps status tool_start and tool_end payloads', () => {
    expect(normalizeStreamEvent('status', '{"type":"tool_start","tool":"web_search"}')).toEqual({
      type: 'tool_start',
      tool: 'web_search',
    });

    expect(
      normalizeStreamEvent(
        'status',
        '{"type":"tool_end","tool":"create_flashcard_deck","deck_id":"d-9","name":"Cell Bio","card_count":8}'
      )
    ).toEqual({
      type: 'tool_end',
      tool: 'create_flashcard_deck',
      resultPreview: undefined,
      deckId: 'd-9',
      name: 'Cell Bio',
      cardCount: 8,
    });
  });

  it('maps token, done, and error events', () => {
    expect(normalizeStreamEvent('token', '{"text":"Fractions "}')).toEqual({ type: 'token', text: 'Fractions ' });

    const done = normalizeStreamEvent('done', '{"input_tokens":123,"output_tokens":456}');
    expect(done).toMatchObject({ type: 'done', inputTokens: 123, outputTokens: 456 });

    expect(normalizeStreamEvent('error', '{"code":"over_limit","message":"stop"}')).toEqual({
      type: 'error',
      code: 'over_limit',
      message: 'stop',
    });
  });

  it('returns null for malformed JSON or unknown event types', () => {
    expect(normalizeStreamEvent('token', 'not-json{')).toBeNull();
    expect(normalizeStreamEvent('mystery', '{}')).toBeNull();
  });
});
