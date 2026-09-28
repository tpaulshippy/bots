import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { buildMessageHtml } from '@/components/markdown/markdownHtml';

const FIXTURE = path.join(
  __dirname,
  '..',
  'markdown',
  '__fixtures__',
  'production-chat-464-assistant-1.md'
);

interface Report {
  h: number;
  w?: number;
  final?: boolean;
  doc?: string;
}

/** The measurement script the page installs, as shipped. */
function measurementScript(content: string, docId?: string): string {
  const html = buildMessageHtml({
    content,
    ...(docId === undefined ? {} : { docId }),
    textColor: '#fff',
    backgroundColor: '#1c1c1e',
    mutedText: '#bdbdbd',
    linkColor: '#6db3f2',
    codeBg: '#2d2d2d',
    borderColor: '#444',
  });
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('no measurement script in the message document');
  return match[1];
}

/**
 * Runs the shipped script against a stub DOM with synthetic geometry, and
 * returns every height it reported.
 *
 * `boxTop` is the container's offset from the top of the document, which is
 * not always 0: a leading heading's top margin collapses out of the
 * container, so the container starts partway down the frame.
 */
function runMeasurement(options: {
  boxTop: number;
  containerHeight: number;
  lowestInk: number;
  width?: number;
  fontsStatus?: string;
}): number[] {
  return runMeasurementReports(options).map((report) => report.h);
}

/** As `runMeasurement`, but keeps the whole payload the page reports. */
function runMeasurementReports(options: {
  boxTop: number;
  containerHeight: number;
  lowestInk: number;
  width?: number;
  fontsStatus?: string;
  docId?: string;
}): Report[] {
  const script = measurementScript('stub', options.docId ?? 'doc-1');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><div class="assistant-md" id="message"><p>x</p></div></body></html>`,
    { runScripts: 'dangerously' }
  );
  const win = dom.window as unknown as Window & typeof globalThis;
  const el = win.document.getElementById('message') as unknown as HTMLElement;

  const reported: Report[] = [];
  (win as any).ReactNativeWebView = {
    postMessage: (data: string) => reported.push(JSON.parse(data)),
  };
  if (options.fontsStatus) {
    (win as any).document.fonts = { status: options.fontsStatus, ready: Promise.resolve() };
  }
  win.scrollY = 0;

  // A rect whose bottom is the lowest painted pixel.
  const inkRect = { height: 18, bottom: options.lowestInk, top: options.lowestInk - 18 };
  el.getBoundingClientRect = () =>
    ({
      height: options.containerHeight,
      width: options.width ?? 286,
      top: options.boxTop,
      bottom: options.boxTop + options.containerHeight,
    }) as DOMRect;
  // The single range over the container is what the shipped code walks.
  (win as any).Range = class {
    selectNodeContents() {}
    getClientRects() {
      return [inkRect];
    }
  };
  (win as any).document.createRange = () => new (win as any).Range();
  // No text nodes to walk: the container range is the only source of rects.
  (win as any).document.createTreeWalker = () => ({ nextNode: () => null });

  new Function('window', 'document', script)(win, win.document);
  // The page reports on load, and the listener is on the window.
  win.dispatchEvent(new win.Event('load'));
  expect(reported.length).toBeGreaterThan(0);
  return reported;
}

describe('message height measurement', () => {
  it('covers the content when the container starts at the top of the frame', () => {
    // Plain paragraph: nothing collapses out, container top is 0.
    const reported = runMeasurement({
      boxTop: 0,
      containerHeight: 100,
      lowestInk: 100,
    });
    expect(Math.max(...reported)).toBeGreaterThanOrEqual(100);
  });

  it('covers the content when a leading heading collapses its top margin out', () => {
    // Production chat 464: the message opens with "### ...", whose 8px top
    // margin collapses out of the container. The container's box therefore
    // starts 8px down while its height does not reach the last line. Measuring
    // relative to box.top lost exactly those 8px and clipped the final line
    // (reported 1438 for ink down to 1446).
    const reported = runMeasurement({
      boxTop: 8,
      containerHeight: 1438,
      lowestInk: 1446,
    });
    expect(Math.max(...reported)).toBeGreaterThanOrEqual(1446);
    expect(Math.max(...reported)).not.toBe(1438);
  });

  it('never reports less than the lowest painted pixel', () => {
    for (const boxTop of [0, 8, 12, 21]) {
      const lowestInk = 1446;
      const reported = runMeasurement({ boxTop, containerHeight: lowestInk - boxTop, lowestInk });
      expect(Math.max(...reported)).toBeGreaterThanOrEqual(lowestInk);
    }
  });

  it('reports the width it measured at, so heights are not shared across widths', () => {
    const [report] = runMeasurementReports({
      boxTop: 8,
      containerHeight: 1438,
      lowestInk: 1446,
      width: 286,
    });
    expect(report.w).toBe(286);
  });

  it('marks a report taken while fonts are still loading as not final', () => {
    const [loading] = runMeasurementReports({
      boxTop: 0,
      containerHeight: 100,
      lowestInk: 100,
      fontsStatus: 'loading',
    });
    expect(loading.final).toBe(false);

    const [settled] = runMeasurementReports({
      boxTop: 0,
      containerHeight: 100,
      lowestInk: 100,
      fontsStatus: 'loaded',
    });
    expect(settled.final).toBe(true);
  });

  it('stamps every report with the id of the document that measured it', () => {
    // When a recycled bubble gets new content, the previous document can still
    // have a measurement in flight. The app has to be able to tell whose it is.
    const reports = runMeasurementReports({
      boxTop: 0,
      containerHeight: 100,
      lowestInk: 100,
      docId: 'abc123',
    });
    expect(reports.length).toBeGreaterThan(0);
    for (const report of reports) {
      expect(report.doc).toBe('abc123');
    }
  });

  it('ships the real production message as a fixture for rendering checks', () => {
    const message = fs.readFileSync(FIXTURE, 'utf8');
    // The shape that broke: opens with a heading, and is far taller than a
    // screen, so a too-small frame is very visible.
    expect(message.startsWith('### ')).toBe(true);
    expect(message).toContain('#### ');
    expect(message).toContain('```');
    expect(message).toMatch(/^1\. /m);
    expect(message.length).toBeGreaterThan(1500);
  });
});
