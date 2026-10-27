#!/usr/bin/env node
// MCP server (stdio): Adrian Capraru's profile, case studies, published services, availability and contact routes.
// Read-only. No keys, no network calls, no messages sent. Data: data/profile.json (generated from the website)
// and availability.json (edited by hand).
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const { version } = read('./package.json');
const data = read('./data/profile.json');
const slugs = data.case_studies.map((c) => c.slug);

const server = new McpServer(
  { name: 'adrian-capraru', title: 'Adrian Capraru', version },
  {
    instructions: 'Facts about Adrian Capraru, Head of AI & Automation (finance AI from first commit to production), taken from his website. '
      + 'Start with get_profile. For proof, list_case_studies then get_case_study. For prices, list_services. '
      + 'To hire him, call check_availability and how_to_hire, then pass the routes to the user: this server sends no messages and books nothing.',
  },
);

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const reply = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const tool = (name, title, description, handler, inputSchema) =>
  server.registerTool(name, { title, description, ...(inputSchema && { inputSchema }), annotations: { title, ...READ_ONLY } }, handler);

tool('get_profile', 'Profile',
  'Positioning, summary, every role with highlights and key figures, location and remote terms, what he is open to, languages, education, skills and links (site, CV PDF, LinkedIn, GitHub, Upwork).',
  async () => reply(data.profile));

tool('list_case_studies', 'Case studies',
  `The ${slugs.length} case studies on his site: slug, title, one-paragraph summary, headline figure and URL. Pass a slug to get_case_study for the full write-up.`,
  async () => reply(data.case_studies.map(({ slug, title, summary, headline, status, url }) => ({ slug, title, summary, headline, status, url }))));

tool('get_case_study', 'Case study',
  'One case study in full: client type, role, timeline, status, the problem, what was built, measured results, stack and links.',
  async ({ slug }) => reply(data.case_studies.find((c) => c.slug === slug)),
  { slug: z.enum(slugs).describe('Case study slug, from list_case_studies') });

tool('list_services', 'Services and prices',
  'Published offers with prices in USD: 12 fixed-price projects (3 tiers each, with delivery days and what is included) and 3 paid consultations. All are bought through his Upwork profile.',
  async () => reply(data.services));

tool('check_availability', 'Availability',
  'Current availability status, as he last set it, with the date it was updated, what he is open to and his time zone. A status note, not a booking calendar.',
  async () => {
    const a = read('./availability.json'); // read per call, so an edit shows up without a restart
    return reply({ ...a, open_to: data.profile.open_to, timezone: data.profile.location.timezone, remote: data.profile.location.remote, next_step: 'Call how_to_hire for the contact routes.' });
  });

tool('how_to_hire', 'How to hire',
  'Contact routes: the site contact page, his Upwork profile, LinkedIn and the CV PDF, with what each route is for and what to include in a first message. This tool sends nothing.',
  async () => reply(data.how_to_hire));

await server.connect(new StdioServerTransport());
