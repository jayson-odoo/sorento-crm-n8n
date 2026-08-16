// ── node-source.js — THE ONLY SANCTIONED WAY FOR AN OFFLINE SUITE TO LOAD A NODE BODY ─────────
//
// 🔴 WHY THIS EXISTS (reviewer F-STALE, 2026-08-08). Offline suites kept their own copies of the
// node bodies. Those copies drifted from what was published, so `ALL PASS` was a statement about
// yesterday's bytes. The failure was not a wrong assertion — it was a RIGHT assertion pointed at
// the wrong artifact (LESSONS §63), and it was invisible because the stale copies were MUTUALLY
// CONSISTENT: the stale `dym-transform.js` never emitted `dym_capped_codes`, so the stale
// `build-suggest-offer.js` was correct not to strip it, and the byte-identity gate built to catch
// exactly that omission passed. A self-consistent stale pair defeats a correct gate silently.
//
// Re-copying the bodies fixes today and leaves the class open. This module closes it: bodies are
// read from `export/`, which `export-workflows.py --verify` polices against live, and this module
// re-checks the export against its own MANIFEST on every load. There is no code path that reads a
// hand-held copy.
//
// USAGE
//   const { loadNodes, assertMatchesExport } = require('../node-source');
//   const src = loadNodes('clone-sorento-consume-main-TEST', ['dym-transform.js', ...]);
//   src['dym-transform.js']            // the PUBLISHED body, sha-verified
//
// A suite that legitimately needs a BEFORE/AFTER pair (a local `before` copy is the whole point of
// such a suite) must still call assertMatchesExport() on its AFTER copy, so the "after" it proves
// things about is provably the published body.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');            // n8n-workflows-init/
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function die(msg) {
  console.log('FATAL(node-source): ' + msg);
  console.log('  → run: python3 n8n-workflows-init/scripts/export-workflows.py --verify');
  console.log('  A suite result obtained from unverified bodies is VOID, not weak.');
  process.exit(2);
}

function manifestOf(slug) {
  const p = path.join(ROOT, 'export', slug, 'MANIFEST.json');
  if (!fs.existsSync(p)) die(`export/${slug}/MANIFEST.json missing — the export has never been run`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Load node bodies from the export and verify each against the MANIFEST's recorded sha256.
// The MANIFEST is what `--verify` ties to the live versionId, so agreeing with it means the bytes
// are the published bytes — not merely "a file that exists".
// MUTATION MODE. `mutate.sh` must be able to perturb a body and watch a suite react, but the
// bodies now live in export/ — the very artifact these suites audit, which must never be edited in
// place. So mutation runs against a SCRATCH COPY and redirects here. The banner is deliberate: a
// suite run in this mode proves an instrument works, it does NOT certify the published bytes.
function loadNodes(slug, files) {
  const override = process.env.OFFLINE_NODES_DIR;
  if (override) {
    console.log(`### MUTATION MODE — bodies read from ${override}, NOT from export/. ` +
                `Sha verification is BYPASSED. This run certifies nothing about what is published.`);
    const out = {};
    for (const f of files) {
      const p = path.join(override, f);
      if (!fs.existsSync(p)) die(`OFFLINE_NODES_DIR=${override} is missing ${f}`);
      out[f] = fs.readFileSync(p, 'utf8');
    }
    out.__versionId = 'MUTATED';
    return out;
  }
  const man = manifestOf(slug);
  const dir = path.join(ROOT, 'export', slug, 'nodes');
  const out = {};
  const unverified = [];
  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) die(`export/${slug}/nodes/${f} missing — re-run the export`);
    const body = fs.readFileSync(p, 'utf8');
    // MANIFEST keys node hashes by node NAME; the exporter writes <name>.js.
    const key = f.replace(/\.js$/, '');
    const rec = man.nodes && (man.nodes[key] || man.nodes[f]);
    if (rec) {
      const want = typeof rec === 'string' ? rec : (rec.sha256 || rec.sha);
      if (want && want !== sha256(body)) {
        die(`export/${slug}/nodes/${f} does NOT match MANIFEST sha256 — the export is corrupt or ` +
            `hand-edited. Never repair this by editing the file; re-run the export.`);
      }
    } else {
      unverified.push(f);
    }
    out[f] = body;
  }
  if (unverified.length) {
    // Loud, but not fatal: some exported files legitimately have no manifest entry. Silence here
    // would recreate the very blindness this module exists to remove.
    console.log(`note(node-source): no MANIFEST sha for ${unverified.join(', ')} — ` +
                `bytes read from the export but NOT independently verified`);
  }
  out.__versionId = man.versionId;
  return out;
}

// For a suite that keeps a local AFTER copy (before/after harnesses): prove it IS the published body.
function assertMatchesExport(slug, pairs) {
  if (process.env.OFFLINE_NODES_DIR) return 'MUTATED';   // mutation mode: the copy is meant to differ
  const man = manifestOf(slug);
  const dir = path.join(ROOT, 'export', slug, 'nodes');
  const bad = [];
  for (const [localPath, exportFile] of Object.entries(pairs)) {
    const lp = path.resolve(localPath);
    if (!fs.existsSync(lp)) { bad.push(`${exportFile}: local copy missing (${localPath})`); continue; }
    const ep = path.join(dir, exportFile);
    if (!fs.existsSync(ep)) { bad.push(`${exportFile}: not in the export`); continue; }
    if (fs.readFileSync(lp, 'utf8') !== fs.readFileSync(ep, 'utf8')) {
      bad.push(`${exportFile}: local copy DIFFERS from the published body`);
    }
  }
  if (bad.length) {
    die(`local "after" copies are stale vs export/${slug} @ ${man.versionId.slice(0, 8)}:\n    ` +
        bad.join('\n    '));
  }
  return man.versionId;
}

module.exports = { loadNodes, assertMatchesExport, manifestOf, ROOT };
