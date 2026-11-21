// Network-disabled browser check of the installed single-file build (dist/index.html).
// Chrome runs offline (DevTools offline mode) and every non-file/data request is refused and counted.
// Drives the real interface: compute, approve, play to the horizon; reload mid-run and confirm the
// run restores paused at its checkpoint; resume to completion; edit a constraint and recompute;
// execute D in both hidden states; execute E. Prints one JSON line for the evidence report.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';

const json = process.argv.includes('--json');
const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean) as string[];
const chrome = candidates.find((p) => existsSync(p));
const out = (status: string, observed: string, steps: string[]) => { console.log(JSON.stringify({ status, observed, steps })); process.exit(status === 'passed' ? 0 : 1); };
if (!chrome) out('not run', 'No Chrome/Chromium found (set CHROME_PATH)', []);
const file = resolve('dist/index.html');
if (!existsSync(file)) out('not run', 'dist/index.html missing \u2014 run npm run build', []);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const steps: string[] = [];
let external = 0;

async function click(page: Page, text: string) {
  const els = await page.$$(`xpath/.//button[normalize-space(.)='${text}' or starts-with(normalize-space(.), '${text}')]`);
  for (const el of els) { const dis = await el.evaluate((b) => (b as HTMLButtonElement).disabled); if (!dis) { await el.click(); await sleep(120); return; } }
  throw new Error(`button "${text}" not found or disabled`);
}
const text = (page: Page, sel: string) => page.$eval(sel, (e) => (e as HTMLElement).innerText).catch(() => '');
async function waitFor(page: Page, pred: () => Promise<boolean>, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(100); } return false; }
async function arrived(page: Page) { return Number((await text(page, '.ctr.big .n')) || '-1'); }
async function minute(page: Page) { return Number(((await text(page, '.clock-time .min')) || '').replace(/\D+/g, '') || '-1'); }
async function compute(page: Page) { await click(page, (await page.$$('xpath/.//button[normalize-space(.)=\'Recompute response\']')).length ? 'Recompute response' : 'Compute response'); await waitFor(page, async () => !(await page.$$('xpath/.//button[contains(., "Computing") or contains(., "Testing")]')).length); }
async function playToEnd(page: Page) {
  for (let i = 0; i < 30; i++) { const btn = await page.$$('xpath/.//button[normalize-space(.)=\'Step 1 minute\']'); if (!btn.length || (await btn[0].evaluate((b) => (b as HTMLButtonElement).disabled))) break; await btn[0].click(); await sleep(60); }
}
async function scenario(page: Page, id: string) { const [b] = await page.$$(`xpath/.//nav//button[b[normalize-space(.)='${id}']]`); await b.click(); await sleep(150); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--disable-features=OptimizationHints,MediaRouter,Translate', '--metrics-recording-only'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setOfflineMode(true);
    await page.setRequestInterception(true);
    page.on('request', (r) => { const u = r.url(); if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) r.continue(); else { external++; r.abort(); } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`file://${file}`, { waitUntil: 'load' });
    await sleep(300);
    steps.push('loaded offline');
    if ((await page.$$('xpath/.//button[normalize-space(.)=\'Got it\']')).length) await click(page, 'Got it');
    await click(page, 'Reset session');
    // A: full evacuation
    await compute(page);
    const head = await text(page, '.rec .headline');
    await click(page, 'Approve and reserve');
    await playToEnd(page);
    const aArr = await arrived(page);
    steps.push(`A: "${head}" \u2192 executed ${aArr}/24 arrived`);
    if (aArr !== 24) throw new Error(`A arrived ${aArr}`);
    // reload mid-run
    await click(page, 'Reset run');
    for (let i = 0; i < 7; i++) await click(page, 'Step 1 minute');
    const before = await minute(page);
    await page.reload({ waitUntil: 'load' });
    await sleep(400);
    const notice = await text(page, '.notice');
    const after = await minute(page);
    const pausedOk = notice.includes('Restored after reload') && after === before;
    steps.push(`reload at minute ${before}: restored at minute ${after}, paused (${pausedOk})`);
    if (!pausedOk) throw new Error(`restore failed: ${notice}`);
    await click(page, 'Resume');
    await playToEnd(page);
    const aArr2 = await arrived(page);
    const evlog = await page.$eval('details.panel summary', () => '').catch(() => '');
    void evlog;
    const viol = await page.$$eval('summary', (ss) => ss.map((s) => (s as HTMLElement).innerText).find((x) => x.startsWith('Event log')) ?? '');
    steps.push(`resumed to ${aArr2}/24; ${viol}`);
    if (aArr2 !== 24 || !viol.includes('0 violations')) throw new Error('resume run differs');
    // edit a real constraint
    const setup = await page.$$('xpath/.//summary[contains(., "Setup edits")]');
    await setup[0].click(); await sleep(100);
    const [inp] = await page.$$('xpath/.//label[contains(., "Batteries in crew pack")]/input');
    await inp.click({ clickCount: 3 }); await inp.type('3');
    const [setBtn] = await page.$$('xpath/.//label[contains(., "Batteries in crew pack")]/button');
    await setBtn.click(); await sleep(150);
    const staleShown = (await text(page, '.stale-msg')).includes('cannot be approved');
    await compute(page);
    const head2 = await text(page, '.rec .headline');
    steps.push(`edit batteries 4\u21923: stale shown ${staleShown}; recomputed "${head2}"`);
    if (!head2.startsWith('16 of 24') || !staleShown) throw new Error('edit/recompute');
    // D: both hidden states
    for (const st of ['blocked', 'open']) {
      await scenario(page, 'D');
      await page.select('#truth-bypass', st);
      await compute(page);
      await click(page, 'Approve and reserve');
      await playToEnd(page);
      const n = await arrived(page);
      steps.push(`D hidden ${st}: ${n}/24 arrived; branch card ${(await text(page, '.branch.active .b-head')) || 'n/a'}`);
      if (n !== (st === 'open' ? 24 : 20)) throw new Error(`D ${st} ${n}`);
    }
    // E: protection
    await scenario(page, 'E');
    await compute(page);
    await click(page, 'Approve and reserve');
    await playToEnd(page);
    const eArr = await arrived(page);
    const waiting = await text(page, '.waiting-ctr');
    steps.push(`E: ${eArr}/24 arrived; ${waiting.split('\n').join(' ')}`);
    if (eArr !== 20 || !waiting.includes('+24')) throw new Error('E');
    const printable = await page.$eval('.print-only', (e) => (e as HTMLElement).textContent?.includes('Breathline crew dispatch sheet') ?? false);
    steps.push(`printable dispatch present: ${printable}`);
    if (errors.length) throw new Error('page errors: ' + errors.join('; '));
    out(external === 0 && printable ? 'passed' : 'failed', `offline (DevTools offline + all non-file requests refused: ${external} attempted); A 24/24; reload restored paused and resumed to 24; edit \u2192 recompute 16; D blocked 20 / open 24; E 20 with +24 protected person-minutes`, steps);
  } catch (e) {
    out('failed', `${(e as Error).message} (external requests attempted: ${external})`, steps);
  } finally { await browser.close(); }
})();
