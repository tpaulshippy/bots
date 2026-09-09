import { BOT_COLORS, BOT_ICONS, botColor, botIcon } from '@/constants/botAppearance';

describe('botAppearance', () => {
  it('uses the parent-chosen color and icon (Fred regression)', () => {
    expect(botColor({ name: 'Fred', color: '#FF5D8F' })).toBe('#FF5D8F');
    expect(botIcon({ name: 'Fred', icon: 'text.bubble' })).toBe('text.bubble');
  });

  it('falls back to a stable palette color when none is chosen', () => {
    const first = botColor({ name: 'Fred', color: null });
    expect(BOT_COLORS).toContain(first);
    expect(botColor({ name: 'Fred', color: null })).toBe(first);
  });

  it('falls back to a stable icon when none is chosen', () => {
    const first = botIcon({ name: 'Fred', icon: null });
    expect(BOT_ICONS).toContain(first);
    expect(botIcon({ name: 'Fred', icon: null })).toBe(first);
  });

  it('ignores unknown icon strings and falls back', () => {
    const icon = botIcon({ name: 'Fred', icon: 'dragon' });
    expect(BOT_ICONS).toContain(icon);
  });
});
