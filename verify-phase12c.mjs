// Live verification for Phase 12c — demo entry points on the marketing surface.
//
//   BASE_URL=http://localhost:3210 node verify-phase12c.mjs

const BASE = process.env.BASE_URL || 'http://localhost:3210';

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status > 0) return true; } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`dev server never became reachable at ${BASE}`);
}
const get = async (path) => (await fetch(`${BASE}${path}`, { redirect: 'manual' })).text();

try {
  await waitForServer();

  console.log('\n[home page hero]');
  {
    const html = await get('/');
    expect('hero has the "See it in action" CTA', html.includes('See it in action'));
    expect('hero keeps "Request Beta Access" primary', html.includes('Request Beta Access'));
    expect('match card tells the Maya/Diego story', html.includes('Maya, meet Diego'));
    expect('match card links into the tour', html.includes('Take the tour'));
    expect('match card links to a live demo profile', html.includes('View a profile'));
    expect('closing CTA offers the 3-minute tour', html.includes('or take the 3-minute tour'));
  }

  console.log('\n[nav + footer]');
  {
    const html = await get('/');
    const liveDemoCount = (html.match(/Live Demo/g) || []).length;
    expect('nav drawer + footer both link "Live Demo"', liveDemoCount >= 2, `found ${liveDemoCount}`);
  }

  console.log('\n[sitemap]');
  {
    const xml = await get('/sitemap.xml');
    expect('/demo is in sitemap.xml', xml.includes('/demo'));
  }

  console.log('\n[demo route still healthy]');
  {
    const res = await fetch(`${BASE}/demo`, { redirect: 'manual' });
    expect('/demo returns 200', res.status === 200, `status=${res.status}`);
  }
} catch (e) {
  bad('harness', e.stack || e.message);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
