import test from 'node:test';
import assert from 'node:assert/strict';

// Temporary, intentionally failing PR check. Removed in the next commit after
// recording the actual GitHub Actions failure; this is not a product test.
test('CI_GATE_PROBE intentionally fails to verify the PR check', () => {
  assert.fail('CI_GATE_PROBE: intentional failure for the review evidence');
});
