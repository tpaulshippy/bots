/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#00a4c9';
const tintColorDark = '#03465b';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#eee',
    tint: tintColorLight,
    icon: '#687076',
    cardBackground: '#fff',
    cardBackgroundSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#111',
    tint: tintColorDark,
    icon: '#9BA1A6',
    cardBackground: '#1C1C1E',
    cardBackgroundSelected: tintColorDark,
  },
};
