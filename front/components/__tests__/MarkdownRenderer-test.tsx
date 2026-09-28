import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

const mockAlert = jest.fn();
jest.mock(
  '@/components/Alert',
  () =>
    (
      title: string,
      message: string,
      options: { text: string; onPress?: () => void }[]
    ) =>
      mockAlert(title, message, options)
);

let mockWebViewProps: any;
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    WebView: (props: any) => {
      mockWebViewProps = props;
      return <View {...props} testID="markdown-webview" />;
    },
  };
});

import MarkdownRenderer, {
  isSafeHttpUrl,
  linkDomain,
  resetHeightCache,
} from '@/components/MarkdownRenderer';

const openRequest = (url: string) => mockWebViewProps.onShouldStartLoadWithRequest({ url });

describe('MarkdownRenderer WebView sizing', () => {
  beforeEach(() => {
    mockWebViewProps = undefined;
  });

  const renderedStyle = () => {
    const { style } = screen.getByTestId('markdown-webview').props;
    return Object.assign({}, ...[style].flat(Infinity));
  };

  // The document stamps its own id into every measurement it reports.
  const docIdOf = (props: any) => /var DOC_ID = "([^"]*)"/.exec(props.source.html)?.[1];

  it('fills the bubble width and sizes itself to the reported height', () => {
    render(<MarkdownRenderer content={'A short message with \\( z^2 \\) math.'} />);

    const before = renderedStyle();
    expect(before.width).toBe('100%');
    expect(typeof before.height).toBe('number');

    act(() => {
      mockWebViewProps.onMessage({
        nativeEvent: {
          data: JSON.stringify({ h: 412.4, doc: docIdOf(mockWebViewProps) }),
        },
      });
    });
    expect(renderedStyle().height).toBe(413);
  });

  it('ignores malformed measurement messages', () => {
    render(<MarkdownRenderer content="hello" />);
    const before = renderedStyle();

    act(() => {
      mockWebViewProps.onMessage({ nativeEvent: { data: 'not json' } });
      mockWebViewProps.onMessage({ nativeEvent: { data: JSON.stringify({ h: -5 }) } });
    });
    expect(renderedStyle()).toEqual(before);
  });
});

describe('MarkdownRenderer link handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWebViewProps = undefined;
    (Linking.openURL as jest.Mock).mockResolvedValue(undefined);
  });

  it('allows only the initial in-memory document to load', () => {
    render(<MarkdownRenderer content="hello" />);
    expect(openRequest('about:blank')).toBe(true);
    // Once the document has loaded, a link like [x](about:blank) must go
    // through the guard instead of blanking the rendered message.
    act(() => {
      mockWebViewProps.onLoadStart();
    });
    expect(openRequest('about:blank')).toBe(false);
    expect(mockAlert.mock.calls[0][0]).toBe('Blocked link');
  });

  it('routes every navigation through the guard (whitelist must not bypass it)', () => {
    render(<MarkdownRenderer content="hello" />);
    // react-native-webview opens URLs outside originWhitelist with
    // Linking.openURL *before* onShouldStartLoadWithRequest runs, so a
    // narrower whitelist would let tel:/sms:/custom-scheme links past the
    // allowlist and the confirm sheet. '*' funnels everything through the
    // handler, which allows only the about:blank initial document.
    expect(mockWebViewProps.originWhitelist).toEqual(['*']);
    expect(openRequest('tel:+15551234567')).toBe(false);
    expect(openRequest('myapp://deep/link')).toBe(false);
  });

  it('shows the domain in a confirm dialog instead of opening directly', () => {
    render(<MarkdownRenderer content={'[docs](https://docs.example.com/a?b=1)'} />);

    // Every navigation away from the bubble goes through the guard.
    expect(openRequest('https://docs.example.com/a?b=1')).toBe(false);

    // The press handler triggers the confirm dialog with the domain...
    expect(mockAlert).toHaveBeenCalled();
    const [title, url] = mockAlert.mock.calls[0];
    expect(title).toBe('Open docs.example.com?');
    expect(url).toBe('https://docs.example.com/a?b=1');

    // ...and does NOT open the URL until "Open" is pressed.
    expect(Linking.openURL).not.toHaveBeenCalled();

    const openOption = mockAlert.mock.calls[0][2].find(
      (option: { text: string }) => option.text === 'Open'
    );
    openOption.onPress();
    expect(Linking.openURL).toHaveBeenCalledWith('https://docs.example.com/a?b=1');
  });

  it('does not open when cancelled', () => {
    render(<MarkdownRenderer content={'[x](https://example.com)'} />);
    openRequest('https://example.com');

    const cancelOption = mockAlert.mock.calls[0][2].find(
      (option: { text: string }) => option.text === 'Cancel'
    );
    cancelOption.onPress();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it.each(['tel:+15551234567', 'sms:+15551234567', 'javascript:alert(1)', 'file:///etc/passwd'])(
    'blocks non-HTTP(S) scheme %s without an Open action',
    (url) => {
      render(<MarkdownRenderer content={`[x](${url})`} />);
      expect(openRequest(url)).toBe(false);

      expect(mockAlert).toHaveBeenCalledTimes(1);
      const [title, , options] = mockAlert.mock.calls[0];
      expect(title).toBe('Blocked link');
      expect(options.find((option: { text: string }) => option.text === 'Open')).toBeUndefined();
      expect(Linking.openURL).not.toHaveBeenCalled();
    }
  );

  it('still confirms plain web links', () => {
    render(<MarkdownRenderer content={'[x](http://example.com/page)'} />);
    openRequest('http://example.com/page');

    expect(mockAlert.mock.calls[0][0]).toBe('Open example.com?');
    expect(
      mockAlert.mock.calls[0][2].find((option: { text: string }) => option.text === 'Open')
    ).toBeDefined();
  });

  it('falls back to the raw url for unparseable links', () => {
    expect(linkDomain('not-a-url')).toBe('not-a-url');
    expect(linkDomain('https://www.example.com/x')).toBe('example.com');
  });

  it('only offers Open for valid HTTP(S) urls', () => {
    expect(isSafeHttpUrl('https://example.com/page')).toBe(true);
    expect(isSafeHttpUrl('http://example.com/page')).toBe(true);
    expect(isSafeHttpUrl('tel:+15551234567')).toBe(false);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('custom-scheme://deep/link')).toBe(false);
    expect(isSafeHttpUrl('not-a-url')).toBe(false);
  });
});

describe('MarkdownRenderer message bubble sizing', () => {
  beforeEach(() => {
    mockWebViewProps = undefined;
    resetHeightCache();
  });

  afterEach(() => {
    // A test that fails before its own useRealTimers would otherwise leave the
    // rest of the file running under fake timers.
    jest.useRealTimers();
  });

  const bubbleStyle = () =>
    Object.assign({}, ...[screen.getByTestId('markdown-webview').props.style].flat(Infinity));

  // Read the id the document actually stamps itself with, so the tests
  // exercise the real contract rather than a hardcoded value.
  const currentDocId = () =>
    /var DOC_ID = "([^"]*)"/.exec(mockWebViewProps.source.html)?.[1];

  const report = (payload: Record<string, unknown>, docId = currentDocId()) =>
    act(() => {
      mockWebViewProps.onMessage({
        nativeEvent: { data: JSON.stringify({ ...payload, doc: docId }) },
      });
    });

  const layOutAt = (width: number) =>
    act(() => {
      mockWebViewProps.onLayout({ nativeEvent: { layout: { width } } });
    });

  it('paints nothing until a height is measured', () => {
    // The placeholder cannot be made safe: this message needs 1443px and the
    // estimate is 1048, while a 70-character message with a heading needs
    // 2.3px per character against this one's 0.9. Any single rate is wrong by
    // hundreds of pixels somewhere, and a short frame slices the last line off.
    render(<MarkdownRenderer content={'A message long enough to be measured.'} />);
    expect(bubbleStyle().opacity).toBe(0);

    report({ h: 300, w: 286, final: true });
    expect(bubbleStyle().opacity).toBe(1);
    expect(bubbleStyle().height).toBe(300);
  });

  it('shows the bubble anyway if the page never reports', () => {
    jest.useFakeTimers();
    render(<MarkdownRenderer content="A page that never answers." />);
    expect(bubbleStyle().opacity).toBe(0);

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(bubbleStyle().opacity).toBe(1);
  });

  it('does not reuse a height measured at a wider width', () => {
    const content = 'Measured wide, then rendered narrow.';
    const wide = render(<MarkdownRenderer content={content} />);
    layOutAt(320);
    report({ h: 1347, w: 320, final: true });
    expect(bubbleStyle().height).toBe(1347);
    wide.unmount();

    render(<MarkdownRenderer content={content} />);
    layOutAt(286);
    // 1347 was measured at 320, where the text wraps less. At 286 the same
    // message needs about 1443, so reusing it would cut the last line off.
    expect(bubbleStyle().opacity).toBe(0);
    report({ h: 1443, w: 286, final: true });
    expect(bubbleStyle().height).toBe(1443);
  });

  it('reuses a height measured at a narrower width, which cannot clip', () => {
    const content = 'Measured narrow, then rendered wide.';
    const narrow = render(<MarkdownRenderer content={content} />);
    layOutAt(286);
    report({ h: 1443, w: 286, final: true });
    narrow.unmount();

    render(<MarkdownRenderer content={content} />);
    layOutAt(320);
    // Wider wraps less, so the taller frame is safe and the bubble is ready
    // immediately instead of flashing empty.
    expect(bubbleStyle().opacity).toBe(1);
    expect(bubbleStyle().height).toBe(1443);
  });

  it('does not carry a timed-out reveal over to a different message', () => {
    jest.useFakeTimers();
    const first = render(<MarkdownRenderer content="A page that never answers." />);
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(bubbleStyle().opacity).toBe(1);

    // The fallback revealed the first message at its placeholder height. That
    // is no licence to reveal the next one on the same row the same way: this
    // message has not been measured at all.
    first.rerender(<MarkdownRenderer content="A different message entirely." />);
    expect(bubbleStyle().opacity).toBe(0);
  });

  it('does not carry a height over to a different message on the same row', () => {
    const short = 'A short one.';
    const long = 'A considerably longer replacement message that needs far more room than the first.';
    const view = render(<MarkdownRenderer content={short} />);
    layOutAt(286);
    report({ h: 200, w: 286, final: true });
    expect(bubbleStyle().height).toBe(200);

    // The list recycles this renderer for a different message. Keeping the
    // previous height would draw the longer text in a 200px frame, which is the
    // clipped-last-line bug all over again.
    view.rerender(<MarkdownRenderer content={long} />);
    expect(bubbleStyle().height).not.toBe(200);
    expect(bubbleStyle().opacity).toBe(0);

    report({ h: 600, w: 286, final: true });
    expect(bubbleStyle().height).toBe(600);
    expect(bubbleStyle().opacity).toBe(1);
  });

  it('ignores a report left over from the previous document', () => {
    // Handing this bubble new content leaves the old document live for a
    // moment, and it can still have a measurement in flight -- its 150ms timer,
    // or a ResizeObserver callback. That report describes the old, shorter
    // message, so applying it here would draw the new one in a short frame.
    const view = render(<MarkdownRenderer content="The previous, shorter message." />);
    layOutAt(286);
    report({ h: 200, w: 286, final: true });
    const staleDocId = currentDocId();

    view.rerender(<MarkdownRenderer content={'A much longer message than the one before it.'} />);
    expect(currentDocId()).not.toBe(staleDocId);

    report({ h: 200, w: 286, final: true }, staleDocId);
    expect(bubbleStyle().height).not.toBe(200);
    expect(bubbleStyle().opacity).toBe(0);
  });

  it('lets a settled report correct a pre-font one by a couple of pixels', () => {
    render(<MarkdownRenderer content="Fonts land after the first report." />);
    layOutAt(286);
    report({ h: 413, w: 286, final: false });
    expect(bubbleStyle().height).toBe(413);

    // Two pixels, which the jank guard would normally drop. Here the first
    // number was only ever a guess taken before the webfonts settled, so
    // keeping it would pin the bubble to the wrong height.
    report({ h: 415, w: 286, final: true });
    expect(bubbleStyle().height).toBe(415);
  });

  it('still ignores trivial corrections between two settled reports', () => {
    render(<MarkdownRenderer content="Steady after the fonts settle." />);
    layOutAt(286);
    report({ h: 413, w: 286, final: true });
    report({ h: 414, w: 286, final: true });
    expect(bubbleStyle().height).toBe(413);
  });
});
