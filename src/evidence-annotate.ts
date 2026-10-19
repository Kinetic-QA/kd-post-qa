// Annotates an evidence screenshot the way Standing Rules #13 asks: a green
// (pass) or red (fail) border around the image, and a caption bar drawn INSIDE
// the image — verdict + date, the page URL, and the measured viewport — so
// nothing needs to sit as separate text underneath it in the Jira comment.
//
// The caption states only what can be known from the image and the check
// itself (the width is measured from the pixels, never taken from a device
// label). Never throws: if annotation fails the caller gets the original image
// back, flagged, so evidence is never lost to a drawing problem.
import sharp from 'sharp';

export interface EvidenceCaption {
  verdict: 'pass' | 'fail';
  // What the frame shows, e.g. "QA site" or "Live site, frame 2 of 4".
  label?: string;
  url?: string;
  geo?: string;
  platform?: string;
  // dd/mm/yyyy
  date: string;
}

const PASS_COLOUR = '#16a34a';
const FAIL_COLOUR = '#dc2626';
const MAX_URL_LINES = 3;

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Breaks a long string (URLs have no spaces) into lines of at most `max` chars.
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += max) lines.push(text.slice(i, i + max));
  if (lines.length > MAX_URL_LINES) {
    const kept = lines.slice(0, MAX_URL_LINES);
    kept[MAX_URL_LINES - 1] = `${kept[MAX_URL_LINES - 1].slice(0, Math.max(0, max - 3))}...`;
    return kept;
  }
  return lines;
}

export const todayDdMmYyyy = (): string =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

export async function annotateEvidence(input: Buffer, caption: EvidenceCaption): Promise<{ buffer: Buffer; error: string | null }> {
  try {
    const meta = await sharp(input).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 2 || height < 2) return { buffer: input, error: 'image has no readable size' };

    const colour = caption.verdict === 'pass' ? PASS_COLOUR : FAIL_COLOUR;
    const border = Math.max(6, Math.round(width * 0.005));
    const outerW = width + border * 2;

    // Font scales with the image so the caption stays legible when the image is
    // shrunk to fit a Jira comment, but never gets tiny or enormous.
    const fontSize = Math.min(34, Math.max(16, Math.round(outerW / 55)));
    const lineHeight = Math.round(fontSize * 1.4);
    const pad = Math.round(fontSize * 0.7);
    const charsPerLine = Math.max(20, Math.floor((outerW - pad * 2) / (fontSize * 0.58)));

    const verdictWord = caption.verdict === 'pass' ? 'PASS' : 'FAIL';
    const lines: Array<{ text: string; bold?: boolean }> = [
      { text: `${verdictWord} - ${caption.date}${caption.label ? ` - ${caption.label}` : ''}`, bold: true },
    ];
    if (caption.url) for (const l of wrap(`URL: ${caption.url}`, charsPerLine)) lines.push({ text: l });
    const facts = [
      `Viewport: ${width}px wide (measured)`,
      caption.platform ? `Platform: ${caption.platform}` : '',
      caption.geo ? `GEO: ${caption.geo}` : '',
    ].filter(Boolean).join('  |  ');
    lines.push({ text: facts });

    const barHeight = pad * 2 + lines.length * lineHeight;
    const outerH = height + border * 2 + barHeight;

    const textSvg = lines.map((l, i) =>
      `<text x="${pad}" y="${pad + (i + 1) * lineHeight - Math.round(lineHeight * 0.3)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${l.bold ? 700 : 400}" fill="#ffffff">${escapeXml(l.text)}</text>`,
    ).join('');
    const barSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${outerW}" height="${barHeight}"><rect width="${outerW}" height="${barHeight}" fill="${colour}"/>${textSvg}</svg>`,
    );

    const buffer = await sharp({ create: { width: outerW, height: outerH, channels: 3, background: colour } })
      .composite([
        { input, left: border, top: border },
        { input: barSvg, left: 0, top: height + border * 2 },
      ])
      .png()
      .toBuffer();
    return { buffer, error: null };
  } catch (e) {
    return { buffer: input, error: e instanceof Error ? e.message : String(e) };
  }
}
