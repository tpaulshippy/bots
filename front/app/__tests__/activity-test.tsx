import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import ActivityScreen from '../parent/activity';
import { fetchActivityChats, fetchActivitySummary } from '@/api/activity';
import { getAccount } from '@/api/account';
import { useRouter } from 'expo-router';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(),
    // Mimic focus-on-mount: run the effect after render, not during it.
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/api/activity', () => ({
  fetchActivityChats: jest.fn(),
  fetchActivitySummary: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  getAccount: jest.fn(),
}));

jest.mock('@/api/pinStorage', () => ({
  getCachedHasPin: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@/hooks/useSelectedProfile', () => ({
  handleUnauthorized: jest.fn(() => Promise.resolve(false)),
}));

const summaryProfiles = [
  {
    profile_id: 'p1',
    name: 'Judah',
    chat_count: 0,
    message_count: 0,
    safety_event_count: 0,
    top_bots: [],
  },
  {
    profile_id: 'p2',
    name: 'Joyce',
    chat_count: 0,
    message_count: 0,
    safety_event_count: 0,
    top_bots: [],
  },
];

describe('ActivityScreen', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (getAccount as jest.Mock).mockResolvedValue({ userId: 1, hasPin: false });
    (fetchActivitySummary as jest.Mock).mockResolvedValue({
      profiles: summaryProfiles,
    });
    (fetchActivityChats as jest.Mock).mockResolvedValue({
      results: [],
      count: 0,
    });
  });

  it('renders a filter chip per profile plus the safety filter', async () => {
    render(<ActivityScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('activity-summary-chip-p1')).toBeTruthy()
    );
    expect(screen.getByText('Judah 0')).toBeTruthy();
    expect(screen.getByText('Joyce 0')).toBeTruthy();
    expect(screen.getByTestId('activity-safety-filter')).toBeTruthy();
    expect(screen.getByTestId('activity-empty-state')).toBeTruthy();
  });

  it('sizes selected and unselected pills identically (pill regression)', async () => {
    render(<ActivityScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('activity-summary-chip-p1')).toBeTruthy()
    );

    // Select Judah so p1 is selected and p2 stays unselected.
    fireEvent.press(screen.getByTestId('activity-summary-chip-p1'));

    await waitFor(() =>
      expect(
        screen
          .getByTestId('activity-summary-chip-p1')
          .props.accessibilityState.selected
      ).toBe(true)
    );

    const selected = StyleSheet.flatten(
      screen.getByTestId('activity-summary-chip-p1').props.style
    );
    const unselected = StyleSheet.flatten(
      screen.getByTestId('activity-summary-chip-p2').props.style
    );
    expect(selected.minHeight).toBe(32);
    expect(unselected.minHeight).toBe(selected.minHeight);

    // Pill text must override the ThemedText default lineHeight (24) so
    // descenders (Joyce, Safety) never clip in either state.
    expect(StyleSheet.flatten(screen.getByText('Judah 0').props.style).lineHeight).toBe(18);
    expect(StyleSheet.flatten(screen.getByText('Joyce 0').props.style).lineHeight).toBe(18);
  });

  it('filters chats by profile when a chip is tapped', async () => {
    render(<ActivityScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('activity-summary-chip-p1')).toBeTruthy()
    );
    expect(fetchActivityChats).toHaveBeenCalledWith({
      profileId: null,
      hasSafetyEvent: null,
    });

    fireEvent.press(screen.getByTestId('activity-summary-chip-p1'));

    await waitFor(() =>
      expect(fetchActivityChats).toHaveBeenCalledWith({
        profileId: 'p1',
        hasSafetyEvent: null,
      })
    );
  });

  it('toggles the safety-only filter', async () => {
    render(<ActivityScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('activity-safety-filter')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('activity-safety-filter'));

    await waitFor(() =>
      expect(fetchActivityChats).toHaveBeenCalledWith({
        profileId: null,
        hasSafetyEvent: true,
      })
    );
    expect(
      screen.getByTestId('activity-safety-filter').props.accessibilityState
        .selected
    ).toBe(true);
  });
});
