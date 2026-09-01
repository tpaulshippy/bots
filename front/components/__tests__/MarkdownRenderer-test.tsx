import React from 'react';
import { render } from '@testing-library/react-native';
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

let capturedOnLinkPress: ((url: string) => boolean) | undefined;
jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      onLinkPress,
    }: {
      children: React.ReactNode;
      onLinkPress: (url: string) => boolean;
    }) => {
      capturedOnLinkPress = onLinkPress;
      return <Text>{children}</Text>;
    },
  };
});

import MarkdownRenderer, { isSafeHttpUrl, linkDomain } from '@/components/MarkdownRenderer';

describe('MarkdownRenderer link handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Linking.openURL as jest.Mock).mockResolvedValue(undefined);
    capturedOnLinkPress = undefined;
  });

  it('shows the domain in a confirm dialog instead of opening directly', () => {
    render(<MarkdownRenderer content={'[docs](https://docs.example.com/a?b=1)'} />);

    expect(capturedOnLinkPress).toBeDefined();
    // Simulate the markdown lib invoking the link press handler.
    capturedOnLinkPress!('https://docs.example.com/a?b=1');

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
    capturedOnLinkPress!('https://example.com');

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
      capturedOnLinkPress!(url);

      expect(mockAlert).toHaveBeenCalledTimes(1);
      const [title, , options] = mockAlert.mock.calls[0];
      expect(title).toBe('Blocked link');
      expect(options.find((option: { text: string }) => option.text === 'Open')).toBeUndefined();
      expect(Linking.openURL).not.toHaveBeenCalled();
    }
  );

  it('still confirms plain web links', () => {
    render(<MarkdownRenderer content={'[x](http://example.com/page)'} />);
    capturedOnLinkPress!('http://example.com/page');

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
