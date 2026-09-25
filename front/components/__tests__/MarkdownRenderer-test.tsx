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

import MarkdownRenderer, { isSafeHttpUrl, linkDomain } from '@/components/MarkdownRenderer';

const openRequest = (url: string) => mockWebViewProps.onShouldStartLoadWithRequest({ url });

describe('MarkdownRenderer WebView sizing', () => {
  beforeEach(() => {
    mockWebViewProps = undefined;
  });

  const renderedStyle = () => {
    const { style } = screen.getByTestId('markdown-webview').props;
    return Object.assign({}, ...[style].flat(Infinity));
  };

  it('fills the bubble width and sizes itself to the reported height', () => {
    render(<MarkdownRenderer content={'A short message with \\( z^2 \\) math.'} />);

    const before = renderedStyle();
    expect(before.width).toBe('100%');
    expect(typeof before.height).toBe('number');

    act(() => {
      mockWebViewProps.onMessage({ nativeEvent: { data: JSON.stringify({ h: 412.4 }) } });
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
