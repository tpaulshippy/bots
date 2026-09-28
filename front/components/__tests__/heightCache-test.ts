import {
  pickMeasurement,
  readMeasurements,
  rememberMeasurements,
  resetHeightCache,
  type Measurement,
} from '@/components/markdown/heightCache';

const at = (width: number, height: number, final = true): Measurement => ({
  width,
  height,
  final,
});

describe('height cache: widths', () => {
  beforeEach(() => {
    resetHeightCache();
  });

  it('reuses the nearest measurement taken at a narrower width', () => {
    const measurements = [at(320, 1347), at(240, 1689)];
    // Wider bubble wraps less, so the 320 measurement is safe at 320 and at
    // anything wider: the frame can only come out taller than the text.
    expect(pickMeasurement(measurements, 320)?.height).toBe(1347);
    expect(pickMeasurement(measurements, 400)?.height).toBe(1347);
    // At 286 the 320 measurement is too short, so fall back to the 240 one.
    expect(pickMeasurement(measurements, 286)?.height).toBe(1689);
  });

  it('refuses a measurement taken at a wider width, which would clip', () => {
    // This is the production case: a height measured at 320 is ~100px short of
    // what the same message needs at 286, and using it there cuts the last
    // line off.
    expect(pickMeasurement([at(320, 1347)], 286)).toBeUndefined();
  });

  it('has nothing to offer before the width is known', () => {
    expect(pickMeasurement([at(286, 1443)], 0)).toBeUndefined();
    expect(pickMeasurement(undefined, 286)).toBeUndefined();
  });
});

describe('height cache: eviction', () => {
  beforeEach(() => {
    resetHeightCache();
  });

  it('keeps other messages when an existing one is re-measured', () => {
    for (let i = 0; i < 200; i++) {
      rememberMeasurements(`message-${i}`, [at(286, 100 + i)]);
    }
    // Updating a key that already exists must not evict anything. Clearing the
    // map here would send every other cached row back to the placeholder
    // estimate the next time it remounts.
    rememberMeasurements('message-0', [at(286, 999)]);

    expect(readMeasurements('message-0')?.[0].height).toBe(999);
    expect(readMeasurements('message-1')?.[0].height).toBe(101);
    expect(readMeasurements('message-199')?.[0].height).toBe(299);
  });

  it('still bounds itself when genuinely new messages arrive', () => {
    for (let i = 0; i < 260; i++) {
      rememberMeasurements(`message-${i}`, [at(286, 100)]);
    }
    // Oldest go first, newest are kept.
    expect(readMeasurements('message-0')).toBeUndefined();
    expect(readMeasurements('message-259')).toBeDefined();
    expect(readMeasurements('message-100')).toBeDefined();
  });

  it('records each width separately for one message', () => {
    rememberMeasurements('m', [at(320, 1347)]);
    rememberMeasurements('m', [at(320, 1347), at(286, 1443)]);

    expect(readMeasurements('m')).toHaveLength(2);
    expect(pickMeasurement(readMeasurements('m'), 286)?.height).toBe(1443);
  });

  it('replaces rather than duplicates a width that reports again', () => {
    rememberMeasurements('m', [at(286, 1443, false)]);
    rememberMeasurements('m', [at(286, 1446)]);

    expect(readMeasurements('m')).toHaveLength(1);
    expect(readMeasurements('m')?.[0]).toEqual(at(286, 1446));
  });
});
