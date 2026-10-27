// Generates data/profile.json from the website's own data, so the server never drifts from the site.
// Usage: node scripts/build-data.mjs <career-folder>
// <career-folder> holds website/src/content.mjs, website/src/resume.json, website/src/build.mjs (read only)
// and deliverables/upwork-v3/catalog.md + consultations.md (the published Upwork offers).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { violations } from './rules.mjs';

const ROOT = process.argv[2] || process.env.CAREER_DIR;
if (!ROOT) throw new Error('usage: node scripts/build-data.mjs <career-folder>');
const SRC = join(ROOT, 'website', 'src');
const UW = join(ROOT, 'deliverables', 'upwork-v3');

const { site, proof, work, cvArcs, upwork } = await import(pathToFileURL(join(SRC, 'content.mjs')).href);
const resume = JSON.parse(readFileSync(join(SRC, 'resume.json'), 'utf8'));
const buildJs = readFileSync(join(SRC, 'build.mjs'), 'utf8');

const must = (m, what) => { if (!m) throw new Error(`not found in site source: ${what}`); return m; };
const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const abs = (href) => (href.startsWith('/') ? `${site.url}${href}` : href);

// Facts the site carries that this server must not repeat. Rewrites keep the rest of the sentence; anything
// still matching a rule afterwards is dropped from its list, and the final check fails the build.
const REWRITES = [
  [/, with seven-figure investor funding placed through the platform during that tenure/g, ''],
  [/\bsecond trading year\b/g, 'second year'],
  [/, where investors trade positions before maturity/g, ''],
];
const clean = (s) => REWRITES.reduce((t, [re, to]) => t.replace(re, to), decode(String(s)));
const keep = (s) => violations(s).length === 0;
const list = (xs = []) => xs.map(clean).filter(keep);

// Contact page copy lives in the site build, not in content.mjs.
const openTo = [...must(buildJs.match(/id: 'open-h'[\s\S]*?inner: `([\s\S]*?)` \}\)/), 'contact "Open to" section')[1].matchAll(/<li data-reveal>(.*?)<\/li>/g)].map((m) => clean(m[1]));
const where = clean(must(buildJs.match(/id: 'where-h'[\s\S]*?<p data-reveal>(.*?)<\/p>/), 'contact "Where" paragraph')[1]);
const ask = clean(must(buildJs.match(/pageHero\('Start with one email', '([^']+)'/), 'contact page brief')[1]);
must(openTo.length, 'open-to items');

const links = {
  website: site.url,
  contact_page: `${site.url}/contact/`,
  cv_page: `${site.url}/cv/`,
  cv_pdf: `${site.url}/cv.pdf`,
  resume_json: resume.meta.canonical,
  llms_txt: `${site.url}/llms.txt`,
  case_studies: `${site.url}/work/`,
  press: `${site.url}/press/`,
  linkedin: site.links.linkedin,
  github: site.links.github,
  upwork: site.links.upwork,
};

const profile = {
  name: resume.basics.name,
  headline: clean(resume.basics.label),
  positioning: clean(site.hook),
  identity: clean(site.identity),
  summary: clean(resume.basics.summary),
  location: {
    city: resume.basics.location.city,
    country_code: resume.basics.location.countryCode,
    timezone: must(where.match(/\(([A-Z]{3,4})\)/), 'timezone in "Where" paragraph')[1],
    remote: where,
  },
  open_to: openTo,
  languages: resume.languages.map((l) => ({ language: l.language, fluency: l.fluency })),
  proof: proof.map((p) => ({ figure: p.fig, what: clean(p.what), source: clean(p.src), url: abs(p.href) })).filter((p) => keep(JSON.stringify(p))),
  upwork: clean(upwork.line),
  roles: resume.work.map((r) => {
    const arc = cvArcs[r.name] || {};
    return {
      organisation: r.name,
      position: r.position,
      start: r.startDate,
      end: r.endDate || null,
      current: !r.endDate,
      context: arc.where ? clean(arc.where) : undefined,
      summary: clean(r.summary),
      highlights: list(r.highlights),
      key_figures: (arc.goals || []).map(([k, v]) => `${clean(k)}: ${clean(v)}`).filter(keep),
      url: r.url,
    };
  }),
  education: resume.education.map((e) => ({ institution: e.institution, degree: e.studyType, area: e.area, start: e.startDate, end: e.endDate })),
  skills: resume.skills.map((s) => ({ area: s.name, keywords: list(s.keywords) })),
  links,
};

const caseStudies = work.map((w) => {
  const facts = Object.fromEntries(Object.entries(w.facts).map(([k, v]) => [k.toLowerCase(), clean(v)]));
  return {
    slug: w.slug,
    title: clean(w.title),
    summary: clean(w.summary),
    headline: { figure: w.fig, label: clean(w.figLabel) },
    client: facts.client || facts.company,
    role: facts.role,
    timeline: facts.timeline,
    status: facts.status,
    problem: clean(w.problem),
    built: list(w.built),
    results: w.results.map((r) => `${clean(r.n)}: ${clean(r.l)}`).filter(keep),
    stack: list(w.stack),
    links: (w.links || []).map((l) => ({ label: clean(l.label), url: abs(l.href) })),
    url: `${site.url}/work/${w.slug}/`,
  };
});

// Upwork Project Catalog: 12 listings, 3 tiers each, prices in USD as published.
const catalog = readFileSync(join(UW, 'catalog.md'), 'utf8').replace(/\r/g, '').split(/\n## (?=\d+\. )/).slice(1).map((sec) => {
  const [, name] = must(sec.match(/^\d+\. (.+?)(?: \([A-Z]+\))?\n/), 'catalog heading');
  const tiers = [...sec.matchAll(/^(STARTER|STANDARD|ADVANCED) - name: `([^`]+)`\n- Price: \$([\d,]+) \| Delivery: (\d+) days \| Revisions: (\d+)\n- Description: `([^`]+)`\n- Included: (.+)$/gm)]
    .map(([, level, tier, price, days, revisions, description, included]) => ({
      level: level.toLowerCase(), name: tier, price_usd: Number(price.replace(/,/g, '')), delivery_days: Number(days), revisions: Number(revisions),
      description: clean(description), included: list(included.split(' • ')),
    }));
  if (tiers.length !== 3) throw new Error(`catalog "${name}": expected 3 tiers, found ${tiers.length}`);
  return { name: clean(name), upwork_title: `You will get ${clean(must(sec.match(/```title\n(.+)\n```/), 'catalog title')[1])}`, tiers };
});
const consultations = readFileSync(join(UW, 'consultations.md'), 'utf8').replace(/\r/g, '').split(/\n## (?=\d+\. )/).slice(1).map((sec) => {
  const [, price, detail] = must(sec.match(/\*\*Price:\*\* \$(\d+) per 30 min \((.+)\)/), 'consultation price');
  return {
    name: clean(must(sec.match(/^\d+\. (.+)\n/), 'consultation heading')[1]),
    upwork_title: clean(must(sec.match(/```title\n(.+)\n```/), 'consultation title')[1]),
    length: clean(must(sec.match(/\*\*Length offered:\*\* (.+)/), 'consultation length')[1]),
    price_usd_per_30_min: Number(price),
    price_detail: clean(detail.replace(/\$/g, 'USD ')),
  };
});
must(catalog.length === 12 && consultations.length === 3, '12 catalog listings and 3 consultations');
const fee = must(readFileSync(join(UW, 'consultations.md'), 'utf8').match(/Fee credited against any project booked within 14 days\./), 'consultation fee credit')[0];

const services = {
  currency: 'USD',
  where_to_buy: `Upwork: ${site.links.upwork}`,
  note: 'Prices as published on Upwork. Fixed-price projects run through the Upwork Project Catalog; consultations are booked through Upwork Consultations.',
  projects: catalog,
  consultations: consultations.map((c) => ({ ...c, terms: fee })),
};

const hire = {
  brief: ask,
  routes: [
    { route: 'Contact page', url: links.contact_page, use_for: 'Roles, fractional engagements and project enquiries. The page lists the contact address and asks for a short brief.' },
    { route: 'Upwork profile', url: links.upwork, use_for: 'Fixed-price projects from the Upwork Project Catalog, consultations, and hourly contracts under Upwork payment protection.' },
    { route: 'LinkedIn', url: links.linkedin, use_for: 'Role conversations and introductions.' },
    { route: 'CV (PDF)', url: links.cv_pdf, use_for: 'The full CV to forward to a hiring team.' },
  ],
  note: 'This server sends no messages and books nothing. A person (or an agent acting for one) contacts Adrian through one of the routes above.',
};

const data = { source: { site: site.url, resume_last_modified: resume.meta.lastModified, built: new Date().toISOString().slice(0, 10) }, profile, case_studies: caseStudies, services, how_to_hire: hire };
const json = `${JSON.stringify(data, null, 2)}\n`;
const bad = violations(json);
if (bad.length) throw new Error(`content rules failed:\n${bad.join('\n')}`);
writeFileSync(new URL('../data/profile.json', import.meta.url), json);
console.log(`data/profile.json: ${profile.roles.length} roles, ${caseStudies.length} case studies, ${catalog.length} projects, ${consultations.length} consultations`);
