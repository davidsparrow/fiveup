// Ed25519 signature verification for Discord interactions.
//
// Two things make this fussy and both are load-bearing:
//
//   1. The signature covers the exact bytes Discord sent, so the caller must
//      pass the raw request text. Any middleware or helper that parses the
//      body first invalidates every signature — which looks like Discord
//      refusing the endpoint for no reason.
//
//   2. Node's crypto.verify wants a key object, and Discord hands out 32
//      raw hex bytes. Wrapping those in the fixed Ed25519 SPKI prefix is
//      cheaper than taking on a dependency for it, and it keeps the
//      interactions route free of anything that is not already in the repo.

import { createPublicKey, verify as cryptoVerify } from "node:crypto";

// DER header for an Ed25519 SubjectPublicKeyInfo. Fixed for every key.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const keyCache = new Map();

function publicKeyFrom(hex) {
  if (keyCache.has(hex)) return keyCache.get(hex);

  const raw = Buffer.from(hex, "hex");
  if (raw.length !== 32) {
    throw new Error("DISCORD_PUBLIC_KEY must be 32 bytes of hex.");
  }

  const key = createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });

  keyCache.set(hex, key);
  return key;
}

// Returns true only for a signature Discord could have produced over
// (timestamp + rawBody). Never throws: a malformed header is a failed
// verification, not a 500.
export function verifyDiscordRequest({ rawBody, signature, timestamp, publicKey }) {
  if (!rawBody || !signature || !timestamp || !publicKey) return false;
  if (!/^[0-9a-fA-F]+$/.test(signature) || signature.length % 2 !== 0) return false;

  try {
    return cryptoVerify(
      null,
      Buffer.from(timestamp + rawBody, "utf8"),
      publicKeyFrom(publicKey),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

export const DISCORD_SIGNATURE_HEADER = "x-signature-ed25519";
export const DISCORD_TIMESTAMP_HEADER = "x-signature-timestamp";
