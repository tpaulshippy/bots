import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import StudyMaterials from '../studyMaterials';
import { fetchHtmlPages } from '@/api/htmlPages';
import { fetchProfiles } from '@/api/profiles';
import { getAccount } from '@/api/account';
import { useSessionMode } from '@/hooks/useSessionMode';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/hooks/useSessionMode', () => ({
  useSessionMode: jest.fn(),
}));

jest.mock('@/api/htmlPages', () => ({
  fetchHtmlPages: jest.fn(),
}));

jest.mock('@/api/profiles', () => ({
  fetchProfiles: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  getAccount: jest.fn(),
}));

jest.mock('@/api/pinStorage', () => ({
  getCachedHasPin: jest.fn(() => Promise.resolve(false)),
  getParentSession: jest.fn(() => 'test-session'),
  setParentSession: jest.fn(),
}));

jest.mock('@/hooks/useSelectedProfile', () => {
  const actual = jest.requireActual('@/hooks/useSelectedProfile');
  return {
    ...actual,
    handleUnauthorized: jest.fn(() => Promise.resolve(false)),
  };
});

const mockUseSessionMode = useSessionMode as jest.Mock;

const pages = [
  {
    id: 1,
    page_id: 'page-1',
    title: 'Fractions Guide',
    html: '<html></html>',
    raw_url: '/api/html-pages/page-1/raw/',
    profile_id: 'p1',
    profile_name: 'Maya',
    created_at: '2026-08-25T10:00:00Z',
    updated_at: '2026-08-25T10:00:00Z',
  },
];

const profiles = {
  results: [
    { id: 1, profile_id: 'p1', name: 'Maya', deleted_at: null },
    { id: 2, profile_id: 'p2', name: 'Leo', deleted_at: null },
  ],
  count: 2,
};

describe('StudyMaterials', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (fetchHtmlPages as jest.Mock).mockResolvedValue({ results: pages, count: 1 });
    (fetchProfiles as jest.Mock).mockResolvedValue(profiles);
    (getAccount as jest.Mock).mockResolvedValue({ userId: 1, hasPin: false });
  });

  it('teen sessions see their pages with no profile filter', async () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: true,
      activeProfileId: 'p1',
    });

    render(<StudyMaterials />);

    await waitFor(() =>
      expect(screen.getByTestId('study-material-row-page-1')).toBeTruthy()
    );
    expect(fetchHtmlPages).toHaveBeenCalledWith('p1');
    expect(screen.queryByTestId('study-materials-profile-chips')).toBeNull();
  });

  it('parent sessions see All plus per-profile filter chips', async () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });

    render(<StudyMaterials />);

    await waitFor(() =>
      expect(screen.getByTestId('study-materials-chip-p1')).toBeTruthy()
    );
    expect(screen.getByTestId('study-materials-chip-all')).toBeTruthy();
    expect(screen.getByTestId('study-materials-chip-p2')).toBeTruthy();
    expect(fetchHtmlPages).toHaveBeenCalledWith(null);

    fireEvent.press(screen.getByTestId('study-materials-chip-p1'));

    await waitFor(() =>
      expect(fetchHtmlPages).toHaveBeenCalledWith('p1')
    );
  });

  it('opens the page viewer when a row is tapped', async () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: true,
      activeProfileId: 'p1',
    });

    render(<StudyMaterials />);

    await waitFor(() =>
      expect(screen.getByTestId('study-material-row-page-1')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('study-material-row-page-1'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/pageViewer',
      params: { pageId: 'page-1', title: 'Fractions Guide' },
    });
  });
});
