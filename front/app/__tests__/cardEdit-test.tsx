import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import CardEdit from '../flashcards/cardEdit';
import { updateFlashcard, deleteFlashcard } from '@/api/flashcards';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/api/flashcards', () => ({
  updateFlashcard: jest.fn(),
  deleteFlashcard: jest.fn(),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

describe('CardEdit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      deckId: 'deck-1',
      flashcardId: 'c1',
      front: 'Hola',
      back: 'Hello',
    });
    (updateFlashcard as jest.Mock).mockResolvedValue({ flashcard_id: 'c1' });
    (deleteFlashcard as jest.Mock).mockResolvedValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('prefills the front and back fields from params', () => {
    render(<CardEdit />);

    expect(screen.getByPlaceholderText('Enter the question or term').props.value).toBe('Hola');
    expect(screen.getByPlaceholderText('Enter the answer or definition').props.value).toBe('Hello');
  });

  it('saves edits and goes back', async () => {
    render(<CardEdit />);

    fireEvent.changeText(screen.getByPlaceholderText('Enter the question or term'), 'Adios');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(updateFlashcard).toHaveBeenCalledWith('deck-1', 'c1', 'Adios', 'Hello')
    );
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('blocks saving when a side is blank', async () => {
    render(<CardEdit />);

    fireEvent.changeText(screen.getByPlaceholderText('Enter the question or term'), '  ');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Error', expect.anything()));
    expect(updateFlashcard).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('deletes the card after confirmation', async () => {
    render(<CardEdit />);

    fireEvent.press(screen.getByText('Delete'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Card',
      expect.anything(),
      expect.anything()
    );
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
      text?: string;
      onPress?: () => void | Promise<void>;
    }[];
    const confirm = buttons.find((b) => b.text === 'Delete');
    await act(async () => {
      await confirm?.onPress?.();
    });

    expect(deleteFlashcard).toHaveBeenCalledWith('deck-1', 'c1');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
