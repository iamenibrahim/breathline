// Network-disabled browser check of the installed single-file build (dist/index.html).
// Chrome runs offline (DevTools offline mode) and every non-file/data request is refused and counted.
// Drives the real interface through the operations workflow and the Demo & testing view:
//  A full evacuation + baseline; the map scene (time bar, selection card, zoom/pan/reset, layers); reload restores paused; changed conditions invalidate the plan;
//  editing during execution explains that it starts a new run; missing confirmations block approval;
//  D shows both inspection outcomes and executes both hidden states; E shows protection separately;
//  on a narrow screen the recommendation and next action come before the map.
// Prints one JSON line for the evidence report.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';

const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean) as string[];
const chrome = candidates.find((p) => existsSync(p));
const out = (status: string, observed: string, steps: string[]) => { console.log(JSON.stringify({ status, observed, steps })); process.exit(status === 'passed' ? 0 : 1); };
if (!chrome) out('not run', 'No Chrome/Chromium found (set CHROME_PATH)', []);
const file = resolve('dist/index.html');
if (!existsSync(file)) out('not run', 'dist/index.html missing \u2014 run npm run build', []);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const steps: string[] = [];
let external = 0;
const must = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

async function buttons(page: Page, text: string) { return page.$$(`xpath/.//button[normalize-space(.)='${text}' or starts-with(normalize-space(.), '${text}') or starts-with(normalize-space(substring-after(., ' ')), '${text}')]`); }
async function click(page: Page, text: string) {
  for (const el of await buttons(page, text)) { if (!(await el.evaluate((b) => (b as HTMLButtonElement).disabled))) { await el.click(); await sleep(120); return; } }
  throw new Error(`button "${text}" not found or disabled`);
}
async function enabled(page: Page, text: string) { for (const el of await buttons(page, text)) if (!(await el.evaluate((b) => (b as HTMLButtonElement).disabled))) return true; return false; }
const text = (page: Page, sel: string) => page.$eval(sel, (e) => (e as HTMLElement).innerText).catch(() => '');
const body = (page: Page) => page.evaluate(() => document.body.innerText);
async function waitFor(pred: () => Promise<boolean>, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(100); } return false; }
async function counter(page: Page, label: string) {
  return page.$$eval('.ctr', (els, label) => { const e = els.find((x) => (x as HTMLElement).innerText.includes(label as string)); return e ? { n: e.querySelector('.n')!.textContent!, tag: e.querySelector('.ctr-tag')!.textContent!, all: (e as HTMLElement).innerText } : null; }, label);
}
async function findPlan(page: Page) { await click(page, 'Find a plan'); await waitFor(async () => !(await buttons(page, 'Finding')).length && !(await buttons(page, 'Checking')).length); await sleep(100); }
async function demo(page: Page) { await click(page, 'Demo & testing'); }
async function ops(page: Page) { await click(page, 'Operations'); }
async function scenario(page: Page, id: string) { await demo(page); const [b] = await page.$$(`xpath/.//div[@class='scen-list']/button[b[normalize-space(.)='${id}']]`); await b.click(); await sleep(150); await ops(page); }
async function stepToEnd(page: Page) { await demo(page); for (let i = 0; i < 30; i++) { if (!(await enabled(page, 'Step 1 minute'))) break; await click(page, 'Step 1 minute'); } await ops(page); }
async function stepN(page: Page, n: number) { await demo(page); for (let i = 0; i < n; i++) await click(page, 'Step 1 minute'); await ops(page); }
async function openConditions(page: Page) { if (!(await page.$('.drawer-conditions'))) { await click(page, 'Update conditions'); await sleep(120); } must(!!(await page.$('.drawer-conditions')), 'conditions drawer did not open'); }
async function setNumber(page: Page, label: string, value: string) {
  const [inp] = await page.$$(`xpath/.//label[span[contains(., "${label}")]]/input`);
  await inp.click({ clickCount: 3 }); await inp.type(value);
  const [b] = await page.$$(`xpath/.//label[span[contains(., "${label}")]]/button`); await b.click(); await sleep(150);
}

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
    if ((await buttons(page, 'Got it')).length) await click(page, 'Got it');
    await demo(page); await click(page, 'Reset this session'); await ops(page);
    steps.push('loaded offline');

    // A: plan, forecast labels, approve, run, simulation result vs baseline
    await findPlan(page);
    const head = await text(page, '.plan .headline');
    const checklist = await text(page, '.plan .checklist');
    const fc = await counter(page, 'Can reach shelter');
    must(head.startsWith('Help all 24') && fc?.tag === 'Forecast' && fc.n === '24', `A plan: ${head} / ${JSON.stringify(fc)}`);
    must(/Repair Fan 3/.test(checklist) && /Open Gate B/.test(checklist) && /Escort the Deep Homes/.test(checklist), 'A checklist');
    must(!(await body(page)).match(/\b(RA|RB|RC|J1|J2|J3|X1|X2|X3)\b/), 'technical location ids visible on the main screen');
    await click(page, 'Approve plan');
    await click(page, 'Run simulation');
    await sleep(900);
    must(await enabled(page, 'Pause'), 'Pause must be the dominant action during playback');
    await click(page, 'Pause');
    await stepToEnd(page);
    const res = await counter(page, 'Reached shelter');
    const base = await counter(page, 'Without crew');
    must(res?.n === '24' && res.tag === 'Simulation result' && base?.n === '12', `A result ${JSON.stringify(res)} base ${JSON.stringify(base)}`);
    // scene: time bar, selection card, zoom and pan, layer toggle
    const mode = await page.$eval('.timebar .tb-mode', (e) => e.textContent ?? ''); // textContent: the pill is uppercased by CSS
    const minute = await text(page, '.timebar .tb-minute b');
    const marks = await page.$$eval('.timebar .tb-mark', (x) => x.length);
    must(mode === 'Simulation result' && minute === '20' && marks > 0, `time bar: ${mode} ${minute} ${marks}`);
    await page.click('.crew-marker'); await sleep(150);
    const card = await text(page, '.infocard');
    must(card.toLowerCase().startsWith('crew') && card.includes('batteries in the pack'), `selection card: ${card}`);
    must(!(await body(page)).match(/\b(RA|RB|RC|J1|J2|J3|X1|X2|X3)\b/), 'technical location ids visible in the selection card');
    await page.keyboard.press('Escape'); await sleep(80);
    must(!(await page.$('.infocard')), 'Escape closes the selection card');
    const camT = () => page.$eval('.cam', (g) => (g as SVGGElement).style.transform);
    const c0 = await camT();
    const [zin] = await page.$$('xpath/.//button[@aria-label="Zoom in"]'); await zin.click(); await sleep(80);
    const c1 = await camT();
    await page.$eval('svg.scene', (e) => (e as SVGSVGElement).focus()); await page.keyboard.press('ArrowLeft'); await sleep(80);
    const c2 = await camT();
    await page.keyboard.press('0'); await sleep(80);
    must(c0 !== c1 && c1 !== c2 && (await camT()) === c0, `zoom/pan/reset: ${c0} | ${c1} | ${c2}`);
    const nRoutes = await page.$$eval('.route', (x) => x.length);
    const [rl] = await page.$$('xpath/.//button[@aria-pressed and contains(., "routes")]'); await rl.click(); await sleep(80);
    const nOff = await page.$$eval('.route', (x) => x.length);
    await rl.click(); await sleep(80);
    must(nRoutes > 0 && nOff === 0 && (await page.$$eval('.route', (x) => x.length)) === nRoutes, `routes layer: ${nRoutes} → ${nOff}`);
    const sceneStep = (`scene: time bar "${mode}" at minute ${minute} with ${marks} planned-event markers; selecting the crew opened a details card (place names only); zoom, arrow-key pan and reset changed and restored the view; the routes layer hid ${nRoutes} route segments and restored them`);
    must(await enabled(page, 'View results'), 'View results action');
    await click(page, 'View results');
    must((await text(page, '#results')).startsWith('Simulation result'), 'results section');
    steps.push(`A: "${head}"; checklist of ${checklist.split('\n').length} steps; Forecast 24 \u2192 Simulation result 24 vs 12 without crew; Pause shown during playback`);
    steps.push(sceneStep);

    // reload restores paused
    await click(page, 'Run again from the start');
    await stepN(page, 7);
    await page.reload({ waitUntil: 'load' });
    await sleep(400);
    const notice = await text(page, '.alerts');
    must(notice.includes('Restored after reload at minute 6') && (await enabled(page, 'Resume')), `restore: ${notice}`);
    await click(page, 'Resume');
    await sleep(200);
    await click(page, 'Pause').catch(() => undefined);
    await stepToEnd(page);
    const res2 = await counter(page, 'Reached shelter');
    await demo(page);
    const log = await page.$$eval('summary', (ss) => ss.map((s) => (s as HTMLElement).innerText).find((x) => x.startsWith('Event log')) ?? '');
    await ops(page);
    must(res2?.n === '24' && log.includes('0 violations'), `resume ${JSON.stringify(res2)} ${log}`);
    steps.push(`reload at minute 6 restored paused; resumed to 24; ${log}`);

    // editing during execution explains a new run
    await click(page, 'Run again from the start');
    await stepN(page, 3);
    await openConditions(page);
    const warn = await text(page, '.warn-inline');
    await setNumber(page, 'Batteries in crew pack', '3');
    const n1 = await text(page, '.alerts');
    must(warn.includes('new run') && n1.includes('starts a new run') && n1.includes('does not replan'), `edit during run: ${warn} | ${n1}`);
    steps.push('edit during execution: warning shown before the change; notice says it starts a new run and does not replan');

    // changed conditions invalidate the old plan
    must(await enabled(page, 'Find a plan') && !(await enabled(page, 'Approve plan')), 'stale plan must not be approvable');
    await findPlan(page);
    const head2 = await text(page, '.plan .headline');
    must(head2.startsWith('Help 16 of 24'), `recompute: ${head2}`);
    steps.push(`changed conditions: old plan could not be approved; new plan "${head2}"`);

    // missing confirmations block approval
    await scenario(page, 'A');
    await openConditions(page);
    const [chk] = await page.$$('xpath/.//label[contains(., "places confirmed")]/input');
    await chk.click(); await sleep(150);
    await findPlan(page);
    const todo = await text(page, '.todo');
    must(todo.includes('Confirm Lower Refuge has 12 places.') && !(await enabled(page, 'Approve plan')), `confirmation gate: ${todo}`);
    await click(page, 'Mark confirmed');
    must(!(await enabled(page, 'Approve plan')), 'plan must be found again after confirming');
    await findPlan(page);
    must(await enabled(page, 'Approve plan'), 'approve after confirmation');
    steps.push('missing confirmation: "Confirm Lower Refuge has 12 places." blocked approval; after marking it confirmed and finding the plan again, approval was enabled');

    // D: both modeled outcomes, waiting for inspection, both hidden states
    for (const st of ['blocked', 'open']) {
      await scenario(page, 'D');
      await demo(page); await page.select('#truth-bypass', st); await ops(page);
      await findPlan(page);
      const br = await text(page, '.plan .branches');
      const roster = await text(page, '.roster');
      const fc2 = await counter(page, 'Can reach shelter');
      must(br.includes('If the Deep Homes bypass is open') && br.includes('If the Deep Homes bypass is blocked') && roster.includes('Waiting for inspection') && fc2?.n === '20\u201324', `D plan: ${br} | ${fc2?.n}`);
      await click(page, 'Approve plan');
      await stepToEnd(page);
      const r = await counter(page, 'Reached shelter');
      must(r?.n === (st === 'open' ? '24' : '20'), `D ${st}: ${r?.n}`);
      steps.push(`D hidden ${st}: plan showed both outcomes (20\u201324, "Waiting for inspection"); simulation result ${r?.n}; observed branch marked`);
    }

    // E: protection separate from arrivals
    await scenario(page, 'E');
    await findPlan(page);
    const prot = await text(page, '.plan');
    must(prot.includes('4 residents gain 6 minutes each below the hazard limit. They still need a route.'), 'E protection sentence');
    await click(page, 'Approve plan');
    await stepToEnd(page);
    const eArr = await counter(page, 'Reached shelter');
    const eWait = await counter(page, 'Still waiting');
    must(eArr?.n === '20' && eWait?.all.includes('4 with temporary protection') === true, `E: ${JSON.stringify(eArr)} ${JSON.stringify(eWait)}`);
    steps.push(`E: "4 residents gain 6 minutes each below the hazard limit. They still need a route."; Reached shelter 20; Still waiting 4 (with temporary protection)`);

    const printable = await page.$eval('.print-only', (e) => (e as HTMLElement).textContent?.includes('Breathline crew dispatch sheet') ?? false);
    must(printable, 'printable dispatch');

    // mobile: recommendation and next action before the map
    await page.setViewport({ width: 390, height: 900 });
    await sleep(200);
    const order = await page.evaluate(() => { const p = document.querySelector('.col-plan')!.getBoundingClientRect().top; const m = document.querySelector('.col-map')!.getBoundingClientRect().top; return p < m; });
    must(order, 'mobile order');
    steps.push('narrow screen (390 px): plan and next action appear above the map; printable dispatch present');
    if (errors.length) throw new Error('page errors: ' + errors.join('; '));
    out(external === 0 ? 'passed' : 'failed', `offline (DevTools offline + all non-file requests refused: ${external} attempted); A forecast 24 \u2192 simulation result 24 vs 12; scene controls (time bar, selection, zoom/pan, layers); reload restored paused; edit during a run starts a new run; stale plan blocked; missing confirmation blocked approval; D 20/24 by hidden state with both outcomes shown; E protection shown separately (20 arrived, 4 protected); mobile order`, steps);
  } catch (e) {
    out('failed', `${(e as Error).message} (external requests attempted: ${external})`, steps);
  } finally { await browser.close(); }
})();
