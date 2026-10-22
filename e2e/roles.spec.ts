import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Privacy, client/worker roles and image deliverables, driven through the real UI with TWO separate browsers
 * (separate cookies = two different people).
 */
const SUM = 'Write a JavaScript function called sumEvens that returns the sum of the even numbers in an array';
const GOOD = 'function sumEvens(a){ return a.filter(x=>x%2===0).reduce((s,x)=>s+x,0); }';
const FOX = 'Generate a logo of a red fox for my bakery, flat style, on a white background.';
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const person = async (browser: Browser) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1360, height: 900 } });
  return { ctx, page: await ctx.newPage() };
};

async function postJob(page: Page, request: string, amount: string, deliverable?: 'Text / code' | 'Image') {
  await page.goto('/');
  await page.getByLabel('What do you need done?').fill(request);
  await page.getByLabel('Budget (USD)').fill(amount);
  if (deliverable) await page.getByRole('group', { name: 'What the worker will hand in' }).getByRole('button', { name: deliverable }).click();
  await page.getByRole('button', { name: 'Create contract' }).click();
  await expect(page).toHaveURL(/#\/jobs\//);
  return page.url().split('/jobs/')[1];
}
async function fund(page: Page, amount: RegExp) {
  await page.getByRole('link', { name: amount }).click();
  await page.getByRole('button', { name: 'Approve hold' }).click();
  await expect(page.getByText('Step 2: put a worker on it')).toBeVisible();
}
/** A picture with real pixel noise so it stays above the simulated reviewer's "not blank" size even after JPEG compression. */
const noisePng = (page: Page) => page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const x = c.getContext('2d')!;
  const d = x.createImageData(220, 220);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  return c.toDataURL('image/png').split(',')[1];
});

test('privacy: a stranger cannot see, open or act on someone else\'s job', async ({ browser }) => {
  const a = await person(browser);
  const b = await person(browser);
  const id = await postJob(a.page, SUM, '20');
  await expect(a.page.getByText('You are the client on this job')).toBeVisible();

  // B has their own empty history and cannot open A's job, even with the exact URL
  await b.page.goto('/');
  await expect(b.page.getByText('No jobs yet.')).toBeVisible();
  await expect(b.page.getByText('Money at a glance')).toBeVisible();
  await b.page.goto(`/#/jobs/${id}`);
  await expect(b.page.getByText('Job not found.')).toBeVisible();
  expect((await b.ctx.request.get(`/api/jobs/${id}`)).status()).toBe(404);
  expect((await b.ctx.request.post(`/api/jobs/${id}/approve`)).status()).toBe(404);
  expect(((await (await b.ctx.request.get('/api/jobs')).json()).jobs)).toEqual([]);
  // ...while A still sees it
  await a.page.goto('/');
  await expect(a.page.getByRole('link', { name: /sumEvens|Sum of evens/ }).first()).toBeVisible();
  await a.ctx.close();
  await b.ctx.close();
});

test('two people: the client invites a worker by link; the worker only gets worker powers; work is verified and paid', async ({ browser }) => {
  const client = await person(browser);
  const worker = await person(browser);
  const id = await postJob(client.page, SUM, '20');
  await fund(client.page, /Hold \$20\.00 with PayPal/);

  // the client sees the invite link and cannot submit work themself without opting in
  const link = await client.page.getByLabel('Worker invite link').inputValue();
  expect(link).toMatch(new RegExp(`/#/join/${id}/[a-f0-9]{24}$`));
  await expect(client.page.getByLabel('Deliverable')).toHaveCount(0);

  // a wrong link is refused
  await worker.page.goto(link.replace(/[a-f0-9]{24}$/, 'f'.repeat(24)));
  await expect(worker.page.getByText('This invite link is not valid.')).toBeVisible();

  // the right link joins the job as the worker
  await worker.page.goto(link);
  await expect(worker.page.getByText('You are the worker on this job')).toBeVisible();
  await expect(worker.page.getByText('Step 2: do the work')).toBeVisible();
  await expect(worker.page.getByRole('link', { name: /with PayPal/ })).toHaveCount(0); // the client's funding link is not shown
  await expect(worker.page.getByText('example tests for')).toBeVisible();
  await expect(worker.page.getByText(/more are hidden/)).toBeVisible(); // only 2 examples; the rest stay hidden

  // wrong work first, then a correct one with their own PayPal email
  await worker.page.getByLabel('Deliverable').fill('function sumEvens(a){ return 0; }');
  await worker.page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(worker.page.getByText('Last attempt failed.')).toBeVisible();
  await worker.page.getByLabel('Deliverable').fill(GOOD);
  await worker.page.getByLabel('Your PayPal email (where you get paid)').fill('my.own.account@example.com');
  await worker.page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(worker.page.getByRole('heading', { name: 'Work verified. Worker paid.' })).toBeVisible();
  await expect(worker.page.getByText('my.own.account@example.com').first()).toBeVisible();

  // the client's page follows along by itself and shows the same result; the worker's job is in their own list
  await expect(client.page.getByRole('heading', { name: 'Work verified. Worker paid.' })).toBeVisible({ timeout: 15_000 });
  await worker.page.goto('/');
  await expect(worker.page.getByText('You are the worker').first()).toBeVisible();
  await client.ctx.close();
  await worker.ctx.close();
});

test('image job: a link is not a deliverable; only an uploaded picture that passes review gets paid', async ({ browser }) => {
  const client = await person(browser);
  const id = await postJob(client.page, FOX, '40', 'Image');
  await expect(client.page.getByText('AI looks at the picture')).toBeVisible();
  await expect(client.page.getByText(/link or a description is not accepted/).first()).toBeVisible();
  await fund(client.page, /Hold \$40\.00 with PayPal/);
  await expect(client.page.getByText(/AI workers cannot produce picture files/)).toBeVisible();
  await expect(client.page.getByRole('button', { name: 'Hire AI worker' })).toHaveCount(0);

  // the AI-worker endpoint refuses too, so nobody can pay for a made-up picture
  expect((await client.ctx.request.post(`/api/jobs/${id}/auto-work`, { data: {} })).status()).toBe(409);

  await client.page.getByText('Trying this alone? Play the worker yourself').click();
  await client.page.getByRole('button', { name: 'Act as the worker' }).click();
  await expect(client.page.getByText('Your image file')).toBeVisible();
  await expect(client.page.getByLabel('Deliverable')).toHaveCount(0); // no text box: the work is a file
  await expect(client.page.getByRole('button', { name: 'Submit for verification' })).toBeDisabled();

  // a tiny/blank picture is rejected by the reviewer...
  await client.page.getByLabel('Choose the picture').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: TINY_PNG });
  await client.page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(client.page.getByText('Last attempt failed.')).toBeVisible();

  // ...a real one passes, is paid, and is shown to the client
  const png = Buffer.from(await noisePng(client.page), 'base64');
  await client.page.getByLabel('Choose the picture').setInputFiles({ name: 'fox.png', mimeType: 'image/png', buffer: png });
  await client.page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(client.page.getByRole('heading', { name: 'Work verified. Worker paid.' })).toBeVisible();
  const delivered = client.page.getByRole('list', { name: 'Image submitted in attempt 2' }).getByRole('img');
  await expect(delivered).toBeVisible();
  expect(await delivered.evaluate((i: HTMLImageElement) => i.naturalWidth > 0)).toBe(true);
  await client.ctx.close();
});
