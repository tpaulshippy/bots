import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import PageViewer from '../pageViewer';
import { getPageLink } from '@/api/htmlPages';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pageId: 'p-1', title: 'Dino' }),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

jest.mock('@/api/htmlPages', () => ({
  getPageLink: jest.fn(),
}));

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: ({ source, ...props }: any) => (
      <View testID={props.testID} accessibilityLabel={source?.uri} />
    ),
  };
});

describe('PageViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads the signed link into the webview', async () => {
    (getPageLink as jest.Mock).mockResolvedValue('https://x/html-pages/p-1/raw/?sig=s');
    const { getByTestId } = render(<PageViewer />);
    expect(getByTestId('page-viewer-loading')).toBeTruthy();
    await waitFor(() => expect(getByTestId('page-viewer-webview')).toBeTruthy());
    expect(getPageLink).toHaveBeenCalledWith('p-1');
    expect(getByTestId('page-viewer-webview').props.accessibilityLabel).toBe(
      'https://x/html-pages/p-1/raw/?sig=s'
    );
  });

  it('shows an error when the link cannot be minted', async () => {
    (getPageLink as jest.Mock).mockResolvedValue(null);
    const { getByTestId } = render(<PageViewer />);
    await waitFor(() => expect(getByTestId('page-viewer-error')).toBeTruthy());
  });
});
