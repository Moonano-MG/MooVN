import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Unkeyed checksum of the JSON payload; this is not a signature or authentication. */
export function sha256Json(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error('ERR_CHECKSUM_INPUT: 无法序列化校验内容');
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}
