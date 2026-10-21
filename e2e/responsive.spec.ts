import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Device-general layout checks. Every page and every job state is loaded at real phone/tablet sizes and measured:
 * nothing may be wider than the screen, text may not be clipped, tap targets must be finger-sized, and the bottom
 * navigation must be a full-width bar pinned to the bottom of the screen.
 * Set AUDIT_DIR to also save a screenshot of every page/size for manual review.
 */
const SHOTS = process.env.AUDIT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const SUM = 'Write a JavaScript function called sumEvens that returns the sum of the even numbers in an array';
const GOOD = 'function sumEvens(a){ return a.filter(x=>x%2===0).reduce((s,x)=>s+x,0); }';
const BAD = 'function sumEvens(a){ return a.reduce((s,x)=>s+x,0); }';

const VIEWPORTS = [
  { name: 'small phone 320x568', w: 320, h: 568, mobile: true },
  { name: 'iPhone 375x812', w: 375, h: 812, mobile: true },
  { name: 'large phone 412x915', w: 412, h: 915, mobile: true },
  { name: 'phone landscape 812x375', w: 812, h: 375, mobile: true },
  { name: 'tablet 768x1024', w: 768, h: 1024, mobile: true },
  { name: 'tablet landscape 1024x768', w: 1024, h: 768, mobile: false },
];

async function create(req: APIRequestContext, amount: string, extra: object = {}) {
  return (await (await req.post('/api/jobs', { data: { request: SUM, amount, ...extra } })).json()).job;
}
async function fund(req: APIRequestContext, job: any) {
  await req.post(`/mock-paypal/approve?token=${job.orderId}`, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, data: '' });
  await req.get(`/api/jobs/${job.id}/fund-return?token=${job.orderId}`);
}

let pages: [string, string][] = [];
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const req = ctx.request;
  const awaiting = await create(req, '45');
  const approval = await create(req, '400');
  const failed = await create(req, '30'); await fund(req, failed); await req.post(`/api/jobs/${failed.id}/submit`, { data: { deliverable: BAD } });
  const paid = await create(req, '25'); await fund(req, paid); await req.post(`/api/jobs/${paid.id}/auto-work`, { data: {} });
  const settled = await create(req, '60'); await fund(req, settled); for (let i = 0; i < 3; i++) await req.post(`/api/jobs/${settled.id}/submit`, { data: { deliverable: BAD } });
  const denied = await create(req, '20', { workerEmail: 'worker@self.test' }); await fund(req, denied); await req.post(`/api/jobs/${denied.id}/auto-work`, { data: {} }); await req.get(`/api/jobs/${denied.id}`);
  pages = [
    ['overview', '/#/'], ['ledger', '/#/ledger'], ['policy', '/#/policy'],
    ['job awaiting funds', `/#/jobs/${awaiting.id}`], ['job needs approval', `/#/jobs/${approval.id}`], ['job failed attempt', `/#/jobs/${failed.id}`],
    ['job paid', `/#/jobs/${paid.id}`], ['job settled', `/#/jobs/${settled.id}`], ['job payout failed', `/#/jobs/${denied.id}`],
  ];
  await ctx.close();
});

async function open(browser: Browser, vp: (typeof VIEWPORTS)[number]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 2, baseURL: 'http://localhost:3100' });
  return { ctx, page: await ctx.newPage() };
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String((el as HTMLElement).className ?? '').split(' ').filter(Boolean).slice(0, 2).join('.')}`;
    // intentionally scrollable regions may extend past the screen
    const inScroller = (el: Element) => !!el.closest('.ag-root-wrapper, pre, .pre, .thumbs, .attempt .body, .filters');
    const offenders: string[] = [];
    const clipped: string[] = [];
    const small: string[] = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.classList.contains('sr-only')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (!inScroller(el) && (r.right > vw + 1 || r.left < -1) && !el.closest('svg')) offenders.push(`${desc(el)} left=${Math.round(r.left)} right=${Math.round(r.right)} (screen ${vw})`);
      const h = el as HTMLElement;
      if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden') && cs.textOverflow !== 'ellipsis' && h.scrollWidth > h.clientWidth + 2 && (el.textContent ?? '').trim() && !inScroller(el) && el.tagName !== 'BODY' && el.tagName !== 'HTML' && !el.matches('.side'))
        clipped.push(`${desc(el)} "${(el.textContent ?? '').trim().slice(0, 40)}" scrollW=${h.scrollWidth} clientW=${h.clientWidth}`);
      if (matchMedia('(pointer: coarse)').matches && ['BUTTON', 'A'].includes(el.tagName) && !el.closest('.ag-root-wrapper, p, li, .crumbs, .footer, .quick, .timeline, .kv, .thumbs') && r.height < 38 && cs.display !== 'inline' && ((el.textContent ?? '').trim() || el.getAttribute('aria-label')))
        small.push(`${desc(el)} "${((el.textContent ?? '') || el.getAttribute('aria-label') || '').trim().slice(0, 28)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return { docOverflow: document.documentElement.scrollWidth - vw, offenders: offenders.slice(0, 6), clipped: clipped.slice(0, 6), small: small.slice(0, 6) };
  });
}

for (const vp of VIEWPORTS) {
  test(`${vp.name}: every page and job state fits the screen`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await open(browser, vp);
    for (const [name, url] of pages) {
      await page.goto(url);
      await page.waitForTimeout(name === 'ledger' ? 1200 : 450);
      const m = await measure(page);
      expect(m.docOverflow, `${vp.name} / ${name}: page is wider than the screen`).toBeLessThanOrEqual(1);
      expect(m.offenders, `${vp.name} / ${name}: elements out of bounds`).toEqual([]);
      expect(m.clipped, `${vp.name} / ${name}: clipped text`).toEqual([]);
      expect(m.small, `${vp.name} / ${name}: tap targets under 38px`).toEqual([]);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.w}x${vp.h}-${name.replaceAll(' ', '-')}.png`, fullPage: true });
    }
    await ctx.close();
  });
}

test.describe('navigation on phones and tablets', () => {
  for (const vp of VIEWPORTS.filter((v) => v.w <= 1000)) {
    test(`${vp.name}: the bottom bar is full width, pinned to the bottom, finger-sized, and stays put while scrolling`, async ({ browser }) => {
      const { ctx, page } = await open(browser, vp);
      await page.goto('/#/');
      const bar = page.locator('aside.side');
      const links = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
      await expect(links).toHaveCount(3);
      const geo = () => bar.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), vw: document.documentElement.clientWidth, vh: window.innerHeight, pos: getComputedStyle(el).position }; });
      const g0 = await geo();
      expect(g0.pos).toBe('fixed');
      expect(g0.left).toBe(0);
      expect(g0.right).toBe(g0.vw);
      expect(g0.bottom).toBe(g0.vh);
      for (let i = 0; i < 3; i++) {
        const b = (await links.nth(i).boundingBox())!;
        expect(b.height, `nav item ${i} height`).toBeGreaterThanOrEqual(44);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(g0.vw);
      }
      // scroll to the middle and the bottom: the bar must not move, and must not cover the footer's last line
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(250);
      expect(await geo()).toEqual(g0);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);
      expect(await geo()).toEqual(g0);
      const lastLine = await page.getByRole('contentinfo').locator('.footer-bottom').evaluate((el) => el.getBoundingClientRect().bottom);
      const barTop = await bar.evaluate((el) => el.getBoundingClientRect().top);
      expect(lastLine, 'the footer must end above the bottom bar').toBeLessThanOrEqual(barTop + 1);
      // and it navigates
      await links.nth(1).click();
      await expect(page).toHaveURL(/#\/ledger/);
      await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
      await ctx.close();
    });
  }

  test('a "sidebar collapsed" choice saved on desktop never hides the phone navigation', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL: 'http://localhost:3100' });
    await ctx.addInitScript(() => localStorage.setItem('proofpay-sidebar', 'collapsed'));
    const page = await ctx.newPage();
    await page.goto('/#/');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.locator('aside.side')).not.toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('button', { name: /sidebar/i })).toHaveCount(0); // no desktop toggle on phones
    await ctx.close();
  });

  test('desktop-sized tablets (1024 landscape) keep the sidebar layout, not the bottom bar', async ({ browser }) => {
    const { ctx, page } = await open(browser, VIEWPORTS[5]);
    await page.goto('/#/');
    expect(await page.locator('aside.side').evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    await expect(page.getByRole('button', { name: 'Hide sidebar' })).toBeVisible();
    await ctx.close();
  });
});

test.describe('phone usability', () => {
  test('Create contract fits and is tappable on the smallest phone; fields do not trigger iOS zoom', async ({ browser }) => {
    const { ctx, page } = await open(browser, VIEWPORTS[0]);
    await page.goto('/#/');
    const btn = page.getByRole('button', { name: 'Create contract' });
    await btn.scrollIntoViewIfNeeded();
    const b = (await btn.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(320);
    expect(b.height).toBeGreaterThanOrEqual(44);
    for (const sel of ['#job-request', 'input[name="amount"]']) {
      expect(await page.locator(sel).evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), sel).toBeGreaterThanOrEqual(16);
    }
    // the whole creation flow works with touch on a phone
    await page.getByLabel('What do you need done?').fill(SUM);
    await page.getByLabel('Budget (USD)').fill('12');
    await btn.tap();
    await expect(page).toHaveURL(/#\/jobs\//);
    await ctx.close();
  });

  test('search is reachable on phones (overview and ledger) and filters', async ({ browser }) => {
    const { ctx, page } = await open(browser, VIEWPORTS[1]);
    await page.goto('/#/');
    const search = page.getByLabel('Search jobs');
    await expect(search).toBeVisible();
    const b = (await search.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(375);
    await search.fill('zzz-no-match');
    await expect(page.getByText('Nothing matches.')).toBeVisible();
    await page.goto('/#/ledger');
    await expect(page.getByLabel('Search jobs')).toBeVisible();
    await ctx.close();
  });

  test('the top bar fits on one row of controls and the viewport allows safe-area (notched phones)', async ({ browser }) => {
    const { ctx, page } = await open(browser, VIEWPORTS[0]);
    await page.goto('/#/');
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
    for (const name of [/Switch to dark mode/, /Notifications|need your attention/]) {
      const b = (await page.getByRole('button', { name }).boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(320);
      expect(b.width).toBeGreaterThanOrEqual(40);
    }
    await ctx.close();
  });

  test('dark mode also fits on a phone', async ({ browser }) => {
    const { ctx, page } = await open(browser, VIEWPORTS[1]);
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    for (const [, url] of pages.slice(0, 4)) {
      await page.goto(url);
      await page.waitForTimeout(400);
      const m = await measure(page);
      expect(m.docOverflow).toBeLessThanOrEqual(1);
      expect(m.offenders).toEqual([]);
    }
    await ctx.close();
  });
});
