import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { WizardStep } from '../onboarding/WizardStep';

describe('WizardStep', () => {
  it('renders the step counter, title, subtitle, and children', () => {
    render(
      <WizardStep step={2} title="Who will be chatting?" subtitle="Pick a name.">
        <Text>Step body</Text>
      </WizardStep>
    );

    expect(screen.getByText('Step 2 of 5')).toBeTruthy();
    expect(screen.getByText('Who will be chatting?')).toBeTruthy();
    expect(screen.getByText('Pick a name.')).toBeTruthy();
    expect(screen.getByText('Step body')).toBeTruthy();
  });

  it('calls onBack from the back control', () => {
    const onBack = jest.fn();
    render(
      <WizardStep step={3} title="Create a bot" onBack={onBack}>
        <Text>Step body</Text>
      </WizardStep>
    );

    fireEvent.press(screen.getByTestId('onboarding-back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('omits the back control when onBack is not provided', () => {
    render(
      <WizardStep step={1} title="Welcome">
        <Text>Step body</Text>
      </WizardStep>
    );

    expect(screen.queryByTestId('onboarding-back')).toBeNull();
  });

  it('shows the review banner in review mode', () => {
    render(
      <WizardStep step={4} title="Keep settings parent-only" review>
        <Text>Step body</Text>
      </WizardStep>
    );

    expect(screen.getByTestId('onboarding-review-banner')).toBeTruthy();
  });
});
