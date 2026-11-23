// Turns a raw Playwright failure message into one plain-English sentence a
// non-developer can read in the Triage table ("What happened"). Deterministic
// on purpose: it is shown the moment a run finishes (before Review's AI
// summary exists) and must never invent detail — it only restates what the
// error itself says, and falls back to a generic line when it can't tell.
// The raw message stays available behind "Technical details" in the UI.

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/** Plain, readable step name: drops the arrow shorthand some step titles use. */
export function cleanStep(step: string): string {
  return step.replace(/\s*->\s*/g, ' → ').trim();
}

/**
 * The plain sentence, plus the step of the test that stopped when known — the
 * step name is often the only thing that says WHAT was being done when a
 * yes/no check inside it came out wrong.
 */
export function plainError(rawMessage: string | null, failedStep?: string | null): string {
  const base = describeFailure(rawMessage);
  return failedStep ? `${base} It stopped during the step "${cleanStep(failedStep)}".` : base;
}

function describeFailure(rawMessage: string | null): string {
  if (!rawMessage) return 'The check failed, but no further detail was recorded.';
  const msg = rawMessage.replace(ANSI, '');

  // A count came back lower than expected — the one case where the numbers
  // themselves are worth quoting.
  const received = /Received:\s*(\d+)\b/.exec(msg);
  const expectedAbove = /Expected:\s*>\s*(\d+)\b/.exec(msg);
  if (/toBeGreaterThan/.test(msg) && received) {
    const got = Number(received[1]);
    if (expectedAbove) {
      const floor = Number(expectedAbove[1]);
      if (got === 0) return floor === 0 ? 'The page showed none where at least one was expected.' : `The page showed none where more than ${floor} were expected.`;
      return `The page showed ${got} where more than ${floor} were expected.`;
    }
    return got === 0 ? 'The page showed none of something it should have shown.' : `The page showed only ${got} of something it should have shown more of.`;
  }

  if (/Test timeout of \d+ms exceeded|Timeout \d+ms exceeded/i.test(msg) && !/waiting for/i.test(msg)) {
    return 'The page took too long to load or respond.';
  }
  if (/net::ERR_|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT|ERR_CERT|NS_ERROR/i.test(msg)) {
    return 'The page could not be reached.';
  }
  if (/strict mode violation/i.test(msg)) {
    return 'The check found more matching items on the page than it expected.';
  }
  if (/toHaveURL|Expected pattern: .*url|navigated to/i.test(msg)) {
    return 'The page ended up on a different web address than expected.';
  }
  if (/toBeVisible|toBeAttached|toBeInViewport|waitFor/.test(msg)) {
    return /element\(s\) not found|waiting for|Timeout/i.test(msg)
      ? 'Something the check expected to find on the page was not there.'
      : 'Something the check expected to see on the page was not showing.';
  }
  if (/toBeHidden|not\.toBeVisible/.test(msg)) {
    return 'Something that should have disappeared from the page was still showing.';
  }
  if (/toHaveText|toContainText|toHaveValue|toHaveAttribute/.test(msg)) {
    return 'The wording or value shown on the page was not what was expected.';
  }
  if (/toHaveCount/.test(msg)) {
    return 'The number of items shown on the page was not what was expected.';
  }
  if (/toBeEnabled|toBeDisabled|toBeChecked/.test(msg)) {
    return 'A button or option on the page was not in the state it should have been.';
  }
  // A plain yes/no check ("Expected: true, Received: false") says nothing a
  // visitor could understand on its own, so it is never quoted.
  if (/toBe\(|toEqual\(|toBeTruthy|toBeFalsy|Object\.is equality/.test(msg)) {
    return 'A check the test makes on the page did not come out as expected.';
  }
  return 'The check failed.';
}
