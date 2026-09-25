// Figma REST API client for the "Figma vs Site" Visual Check mode — a
// standalone GUI feature (no Claude/MCP session involved at runtime), so it
// talks to Figma's own API directly using a personal access token stored in
// .env as FIGMA_ACCESS_TOKEN, the same way every other credential this repo
// uses lives in .env rather than in code.
import axios from 'axios';

export interface FigmaRef {
  fileKey: string;
  nodeId: string;
}

// Figma's own "Copy link to selection" produces a URL like:
//   https://www.figma.com/design/<fileKey>/<name>?node-id=1-23&t=...
// The URL uses a dash between the two ID halves; the REST API's `ids` param
// needs a colon instead. A file-only link (no node-id at all) returns null
// rather than guessing at a node — comparing an entire multi-page Figma file
// has no single obvious "site" counterpart, so the caller surfaces a clear
// "paste a link to one specific frame" error instead of silently picking
// something arbitrary.
export function parseFigmaUrl(url: string): FigmaRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)figma\.com$/.test(parsed.hostname)) return null;

  const match = parsed.pathname.match(/\/(?:design|file|proto)\/([^/]+)/);
  const nodeIdRaw = parsed.searchParams.get('node-id');
  if (!match || !nodeIdRaw) return null;

  return { fileKey: match[1], nodeId: nodeIdRaw.replace('-', ':') };
}

// Renders the given node as a PNG via Figma's image-export endpoint, then
// downloads the actual bytes from the short-lived S3 URL that endpoint
// returns — two round trips, same two-step flow Figma's own API docs
// describe. Throws with a descriptive message on any failure (missing/bad
// token, node not found, rate limit); the route surfaces that message as-is,
// same "let the caller decide how to report it" convention the rest of this
// file's HTTP calls follow.
export async function fetchFigmaFrameImage(fileKey: string, nodeId: string): Promise<Buffer> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    throw new Error('FIGMA_ACCESS_TOKEN is not set — add a Figma personal access token to .env to use Figma vs Site.');
  }

  const imagesRes = await axios.get('https://api.figma.com/v1/images/' + fileKey, {
    params: { ids: nodeId, format: 'png', scale: 2 },
    headers: { 'X-Figma-Token': token },
  });

  if (imagesRes.data?.err) {
    throw new Error(`Figma API error: ${imagesRes.data.err}`);
  }

  const imageUrl: string | undefined = imagesRes.data?.images?.[nodeId];
  if (!imageUrl) {
    throw new Error(`Figma returned no image for node ${nodeId} — check the frame link points to a real, currently-selected frame.`);
  }

  const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  return Buffer.from(imageRes.data);
}
