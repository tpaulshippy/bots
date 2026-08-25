import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/api/tokens', () => ({
  getTokens: jest.fn().mockResolvedValue({ access: 'a', refresh: 'r' }),
}));

import PinWrapper from '../../components/PinWrapper';
import { clearParentSession, setParentSession } from '../../api/pinStorage';

const GATED_CONTENT = 'SECRET MENU';

function gatedChildren() {
  return <Text>{GATED_CONTENT}</Text>;
}

const fetchMock = jest.fn();

function reauthResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('PinWrapper', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as any).fetch = fetchMock;
    clearParentSession();
  });

  it('shows the keypad and locks children when no session exists', () => {
    const { getByTestId, queryByText } = render(
      <PinWrapper>
        {gatedChildren()}
      </PinWrapper>
    );

    expect(getByTestId('pin-title')).toBeTruthy();
    expect(getByTestId('pin-key-1')).toBeTruthy();
    expect(getByTestId('pin-key-0')).toBeTruthy();
    expect(queryByText(GATED_CONTENT)).toBeNull();
  });

  it('unlocks immediately when the parent session is still valid', () => {
    setParentSession('valid-token', Date.now() + 60_000);

    const { getByText, queryByTestId } = render(
      <PinWrapper>
        {gatedChildren()}
      </PinWrapper>
    );

    expect(getByText(GATED_CONTENT)).toBeTruthy();
    expect(queryByTestId('pin-title')).toBeNull();
  });

  it('reauthenticates via the API and unlocks on success', async () => {
    fetchMock.mockResolvedValueOnce(
      reauthResponse(200, {
        parentSessionToken: 'p-token',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
    );
    const onUnlocked = jest.fn();

    const { getByTestId } = render(
      <PinWrapper onUnlocked={onUnlocked}>
        {gatedChildren()}
      </PinWrapper>
    );

    for (const digit of ['1', '2', '3', '4']) {
      fireEvent.press(getByTestId(`pin-key-${digit}`));
    }
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('pin-submit'));

    await waitFor(() => expect(getByTestId('pin-dots') || null).toBeDefined());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/reauthenticate'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pin: '1234' }),
      })
    );

    await waitFor(() => {
      expect(onUnlocked).toHaveBeenCalledTimes(1);
    });
  });

  it('shows remaining attempts from the API on failure', async () => {
    fetchMock.mockResolvedValueOnce(
      reauthResponse(401, { detail: 'Invalid PIN', remainingAttempts: 2 })
    );

    const { getByTestId } = render(
      <PinWrapper>
        {gatedChildren()}
      </PinWrapper>
    );

    for (const digit of ['9', '9', '9', '9']) {
      fireEvent.press(getByTestId(`pin-key-${digit}`));
    }
    fireEvent.press(getByTestId('pin-submit'));

    await waitFor(() => {
      expect(getByTestId('pin-error').props.children).toContain(
        '2 attempts remaining'
      );
    });
  });

  it('shows the lockout message on 423 and keeps the keypad locked', async () => {
    fetchMock.mockResolvedValueOnce(
      reauthResponse(423, { detail: 'PIN locked. Try again later.' })
    );

    const { getByTestId, queryByText } = render(
      <PinWrapper>
        {gatedChildren()}
      </PinWrapper>
    );

    for (const digit of ['0', '0', '0', '0']) {
      fireEvent.press(getByTestId(`pin-key-${digit}`));
    }
    fireEvent.press(getByTestId('pin-submit'));

    await waitFor(() => {
      expect(getByTestId('pin-error').props.children).toBe(
        'PIN locked. Try again later.'
      );
    });

    // Keypad input is ignored while locked.
    fireEvent.press(getByTestId('pin-key-1'));
    expect(queryByText('●')).toBeNull();
  });

  it('ignores submit until at least 4 digits are entered', () => {
    const { getByTestId } = render(
      <PinWrapper>
        {gatedChildren()}
      </PinWrapper>
    );

    fireEvent.press(getByTestId('pin-key-1'));
    fireEvent.press(getByTestId('pin-key-2'));
    fireEvent.press(getByTestId('pin-submit'));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
