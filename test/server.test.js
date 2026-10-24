import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
test('HTTP workflow serves UI, searches with filters, resolves DOIs and rejects invalid requests', async t => {
  const requested = [];
  const work = { DOI: '10.1234/example', title: ['Plant growth'], abstract: '<p>Plant treatment findings.</p>' };
  const server = createServer(async url => { requested.push(url); return { ok: true, json: async () => ({ message: url.includes('?') ? { items: [work] } : work }) }; });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(base)).text(), /Put your findings/);
  const post = body => fetch(base + '/api/articles', { method: 'POST', body: JSON.stringify(body) });
  const input = { context: 'Plant growth', data: 'Control: 2 cm', count: 5, mode: 'find', type: 'journal-article', from: '2020-01-01' };
  const response = await post(input);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).articles[0].abstract, 'Plant treatment findings.');
  assert.match(requested[0], /filter=type/);
  const lookup = await post({ ...input, mode: 'analyze', dois: ['https://doi.org/10.1234/example'] });
  assert.equal(lookup.status, 200);
  assert.match(requested[1], /10.1234%2Fexample/);
  assert.equal((await post({ ...input, count: -1 })).status, 400);
  assert.equal((await fetch(base + '/missing')).status, 404);
});
test('provider failure is actionable instead of producing fake results', async t => {
  const server = createServer(async () => ({ ok: false, status: 404 }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/articles`, { method: 'POST', body: JSON.stringify({ mode: 'analyze', context: 'Test', data: 'Organized', dois: ['10.1234/missing'] }) });
  assert.equal(response.status, 502); assert.match((await response.json()).error, /not found/);
});
