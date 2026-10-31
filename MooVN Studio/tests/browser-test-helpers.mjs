// Poll a browser-side asynchronous predicate and inspect its resolved value.
// Playwright's waitForFunction can treat a returned Promise as truthy before it
// resolves, so it is not suitable for our IndexedDB checks.
export async function waitForBrowserCondition(page, predicate, arg, description, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await page.evaluate(predicate, arg);
    if (result) return result;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
