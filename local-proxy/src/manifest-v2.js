/**
 * Manifest v2 schema utilities.
 *
 * v2 introduces metadata-as-SoT for plan-harness scenarios:
 *   - schemaVersion: 2
 *   - metaHashes:     SHA256(canonical_json(<doc>.meta.json)) per doc
 *   - upstreamHashes: snapshot of upstream hashes at last generation
 *   - sharedAssets:   tracked hashes for _shared/context, _shared/glossary, _shared/decisions
 *
 * v1 manifests (no schemaVersion field) remain read-only; isV2() returns false.
 */

import crypto from "node:crypto";

export const V2_DOC_TYPES = [
  "product",
  "analysis",
  "design",
  "state-machine",
  "test-spec",
  "implementation",
  "test-report",
];

export const V2_UPSTREAMS = {
  product: [],
  analysis: ["product"],
  design: ["analysis"],
  "state-machine": ["design"],
  "test-spec": ["design", "state-machine"],
  implementation: ["design", "state-machine", "test-spec"],
  "test-report": ["test-spec", "implementation"],
};

/**
 * Canonicalise an object to a deterministic JSON string:
 *   - object keys sorted lexicographically (recursive)
 *   - arrays preserved in order
 *   - no whitespace
 * Same input always produces the same string -> same SHA256.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k]));
  return "{" + parts.join(",") + "}";
}

/** SHA256 hex of canonicalJson(metaObj). */
export function computeMetaHash(metaObj) {
  const canonical = canonicalJson(metaObj);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** True iff the manifest declares schemaVersion === 2. */
export function isV2(manifest) {
  return manifest && manifest.schemaVersion === 2;
}

/**
 * Upgrade a v1 manifest to v2 in-memory (does NOT write to disk).
 * Preserves all v1 fields; adds v2 fields with empty defaults.
 * Caller decides whether to persist.
 */
export function upgradeManifest(manifest) {
  if (isV2(manifest)) return manifest;
  return {
    ...manifest,
    schemaVersion: 2,
    metaHashes: {},
    upstreamHashes: {},
    sharedAssets: {},
  };
}

/**
 * Given the current manifest, return doc IDs whose recorded upstreamHashes
 * disagree with the current metaHashes of their upstreams. These docs are stale.
 *
 * A doc is stale iff:
 *   - its own metaHash exists (i.e. it has been generated)
 *   - any upstream u has metaHashes[u] != upstreamHashes[doc][u]
 *
 * Docs that have never been generated are not "stale" -- they're absent.
 */
export function findStaleDocs(manifest) {
  if (!isV2(manifest)) return [];
  const stale = [];
  const meta = manifest.metaHashes || {};
  const ups = manifest.upstreamHashes || {};
  for (const doc of V2_DOC_TYPES) {
    if (!meta[doc]) continue;
    const upstreams = V2_UPSTREAMS[doc] || [];
    const recorded = ups[doc] || {};
    for (const u of upstreams) {
      if (!meta[u]) continue;
      if (recorded[u] !== meta[u]) {
        stale.push({ doc, upstream: u, was: recorded[u] || null, now: meta[u] });
        break;
      }
    }
  }
  return stale;
}

/**
 * After a successful Phase C render, call this to refresh manifest state for one doc.
 * Updates metaHashes[doc], upstreamHashes[doc][u] for every hard+soft upstream u with
 * a current metaHash, and clears any <doc>Generating flag.
 */
export function recordGeneration(manifest, doc, metaObj) {
  const m = upgradeManifest(manifest);
  m.metaHashes = { ...(m.metaHashes || {}), [doc]: computeMetaHash(metaObj) };
  const upstreams = V2_UPSTREAMS[doc] || [];
  const recorded = { ...(m.upstreamHashes?.[doc] || {}) };
  for (const u of upstreams) {
    if (m.metaHashes[u]) recorded[u] = m.metaHashes[u];
  }
  m.upstreamHashes = { ...(m.upstreamHashes || {}), [doc]: recorded };
  const camelKey = doc.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  delete m[`${camelKey}Generating`];
  return m;
}
