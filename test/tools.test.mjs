// Starts the real server over stdio and calls every tool, the way an MCP client does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { violations } from '../scripts/rules.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const client = new Client({ name: 'test', version: '1.0.0' });
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { res, body: res.isError ? null : JSON.parse(res.content[0].text) };
};
const SITE = 'https://cadi27tech.github.io';

before(() => client.connect(new StdioClientTransport({ command: process.execPath, args: [root('index.mjs')] })));
after(() => client.close());

test('exposes exactly the six tools, all read-only and closed-world', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['check_availability', 'get_case_study', 'get_profile', 'how_to_hire', 'list_case_studies', 'list_services']);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.openWorldHint, false, t.name);
    assert.deepEqual(violations(t.description), [], t.name);
  }
});

test('get_profile: positioning, roles, location, remote terms, languages, links', async () => {
  const { body: p } = await call('get_profile');
  assert.equal(p.name, 'Adrian Capraru');
  assert.match(p.positioning, /survive/);
  assert.equal(p.roles.length, 8);
  assert.ok(p.roles.every((r) => r.organisation && r.position && r.start));
  assert.equal(p.location.timezone, 'EET');
  assert.match(p.location.remote, /remotely/);
  assert.ok(p.open_to.length >= 3);
  assert.deepEqual(p.languages.map((l) => l.language), ['Romanian', 'English']);
  assert.equal(p.links.cv_pdf, `${SITE}/cv.pdf`);
  assert.match(p.links.upwork, /^https:\/\/www\.upwork\.com\//);
});

test('list_case_studies: the 7 site cases, each with a site URL', async () => {
  const { body } = await call('list_case_studies');
  assert.equal(body.length, 7);
  for (const c of body) assert.equal(c.url, `${SITE}/work/${c.slug}/`);
});

test('get_case_study: every slug returns problem, build, results and link', async () => {
  const { body: list } = await call('list_case_studies');
  for (const { slug } of list) {
    const { body: c } = await call('get_case_study', { slug });
    assert.equal(c.slug, slug);
    assert.ok(c.problem.length > 40, slug);
    assert.ok(c.built.length >= 3, slug);
    assert.ok(c.results.length >= 3, slug);
    assert.ok(!/<[a-z]/.test(JSON.stringify(c)), `${slug}: HTML left in text`);
  }
});

test('get_case_study: an unknown slug is refused, not guessed', async () => {
  const { res } = await call('get_case_study', { slug: 'not-a-case' });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /accountancy-saas-live-in-10-days/);
});

test('list_services: 12 projects with 3 priced tiers, 3 consultations', async () => {
  const { body: s } = await call('list_services');
  assert.equal(s.currency, 'USD');
  assert.equal(s.projects.length, 12);
  for (const p of s.projects) {
    assert.equal(p.tiers.length, 3, p.name);
    const prices = p.tiers.map((t) => t.price_usd);
    assert.ok(prices.every((x) => Number.isInteger(x) && x > 0), p.name);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b), `${p.name}: tiers rise in price`);
  }
  assert.deepEqual(s.consultations.map((c) => c.price_usd_per_30_min), [95, 125, 150]);
});

test('check_availability: the static status file, no calendar', async () => {
  const { body: a } = await call('check_availability');
  const file = JSON.parse(readFileSync(root('availability.json'), 'utf8'));
  assert.equal(a.status, file.status);
  assert.match(a.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!('slots' in a) && !('calendar' in a));
  assert.equal(a.timezone, 'EET');
});

test('how_to_hire: the four public routes, and it sends nothing', async () => {
  const { body: h } = await call('how_to_hire');
  assert.deepEqual(h.routes.map((r) => r.url), [`${SITE}/contact/`, 'https://www.upwork.com/freelancers/cadrian', 'https://www.linkedin.com/in/adriancapraru27', `${SITE}/cv.pdf`]);
  assert.match(h.note, /sends no messages/);
});

test('every shipped text passes the content rules', () => {
  for (const f of ['data/profile.json', 'availability.json', 'README.md', 'CHANGELOG.md', 'index.mjs']) {
    assert.deepEqual(violations(readFileSync(root(f), 'utf8')), [], f);
  }
});

test('no dash other than the ASCII hyphen anywhere in the repo', () => {
  const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
  const walk = (d) => readdirSync(root(d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (['node_modules', '.git'].includes(e.name) ? [] : walk(`${d}${e.name}/`)) : [`${d}${e.name}`]));
  for (const f of walk('').filter((f) => /\.(mjs|json|md|yml|svg)$/.test(f))) assert.ok(!dash.test(readFileSync(root(f), 'utf8')), f);
});
