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

import MarkdownRenderer, { linkDomain } from '@/components/MarkdownRenderer';

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

  it('falls back to the raw url for unparseable links', () => {
    expect(linkDomain('not-a-url')).toBe('not-a-url');
    expect(linkDomain('https://www.example.com/x')).toBe('example.com');
  });
});
