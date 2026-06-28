'use strict'

/**
 * Coverage top-up for server.cjs — exercises the exported pure helpers along the
 * code paths the existing server.test.cjs / server-lifecycle.test.cjs do not reach,
 * WITHOUT starting a listener (require() never runs startServer; it only runs when
 * server.cjs is the main module).
 *
 * This is intentionally additive (existing files are not edited) and deterministic:
 * no sockets are bound, so it is immune to the port-contention flakiness that affects
 * server-lifecycle.test.cjs. It closes these previously-uncovered lines:
 *   - 30-34   encodeFrame 64-bit extended-length header (payload >= 65536)
 *   - 50-53   decodeFrame 16-bit (126) extended-length path + truncated-buffer guard
 *   - 54-58   decodeFrame 64-bit (127) extended-length path + truncated-buffer guard
 *   - 124-133 getNewestScreen (empty dir -> null, and newest-by-mtime selection)
 *
 * BRAINSTORM_DIR is set BEFORE require so the module-level CONTENT_DIR constant points
 * at this test's temp dir. Each test file runs in its own subprocess under
 * `node --test`, so this env mutation does not leak into the other server test files.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Point the module's CONTENT_DIR (computed at load time) at a fresh temp session dir.
const SESSION_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-cov-'))
const CONTENT_DIR = path.join(SESSION_DIR, 'content')
fs.mkdirSync(CONTENT_DIR, { recursive: true })
process.env.BRAINSTORM_DIR = SESSION_DIR

const { encodeFrame, decodeFrame, OPCODES, getNewestScreen } = require('../server.cjs')

test.after(() => fs.rmSync(SESSION_DIR, { recursive: true, force: true }))

// Reconstruct a browser-style masked client frame for arbitrary length encodings so
// decodeFrame's extended-length branches can be driven directly.
function maskedClientFrame(opcode, payload, mask, lenField) {
  const len = payload.length
  let header
  if (lenField === 127) {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(len), 2)
  } else if (lenField === 126) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 0x80 | 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.from([0x80 | opcode, 0x80 | len])
  }
  const masked = Buffer.alloc(len)
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4]
  return Buffer.concat([header, mask, masked])
}

test('encodeFrame: large payload uses the 127 64-bit extended-length header', () => {
  // Covers lines 30-34 (the len >= 65536 branch).
  const payload = Buffer.alloc(65536, 0x62)
  const frame = encodeFrame(OPCODES.TEXT, payload)
  assert.equal(frame[0], 0x80 | OPCODES.TEXT, 'FIN + TEXT in the first byte')
  assert.equal(frame[1], 127, 'length flag 127 signals 64-bit extended length')
  assert.equal(Number(frame.readBigUInt64BE(2)), 65536, '64-bit length field carries the size')
  assert.equal(frame.length, 10 + payload.length)
})

test('decodeFrame: round-trips a masked frame using the 126 extended length', () => {
  // Covers lines 50-53 (payloadLen === 126 branch).
  const payload = Buffer.from('a'.repeat(40)) // small payload, but force the 126 encoding
  const mask = Buffer.from([0x01, 0x02, 0x03, 0x04])
  const frame = maskedClientFrame(OPCODES.TEXT, payload, mask, 126)
  const result = decodeFrame(frame)
  assert.equal(result.opcode, OPCODES.TEXT)
  assert.equal(result.payload.toString(), payload.toString())
  assert.equal(result.bytesConsumed, frame.length)
})

test('decodeFrame: returns null for a truncated 126 header', () => {
  // Covers line 51 (buffer.length < 4 guard inside the 126 branch).
  const truncated = Buffer.from([0x80 | OPCODES.TEXT, 0x80 | 126, 0x00]) // 3 bytes, < 4
  assert.equal(decodeFrame(truncated), null)
})

test('decodeFrame: round-trips a masked frame using the 127 extended length', () => {
  // Covers lines 54-58 (payloadLen === 127 branch).
  const payload = Buffer.from('extended-64bit-length')
  const mask = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD])
  const frame = maskedClientFrame(OPCODES.TEXT, payload, mask, 127)
  const result = decodeFrame(frame)
  assert.equal(result.opcode, OPCODES.TEXT)
  assert.equal(result.payload.toString(), 'extended-64bit-length')
  assert.equal(result.bytesConsumed, frame.length)
})

test('decodeFrame: returns null for a truncated 127 header', () => {
  // Covers line 55 (buffer.length < 10 guard inside the 127 branch).
  const truncated = Buffer.from([0x80 | OPCODES.TEXT, 0x80 | 127, 0x00, 0x00]) // 4 bytes, < 10
  assert.equal(decodeFrame(truncated), null)
})

test('getNewestScreen: returns null when the content dir has no screens', () => {
  // Covers lines 124-133 with the empty-list (return null) branch.
  // CONTENT_DIR was created empty before require, and runs before the write test.
  assert.equal(getNewestScreen(), null)
})

test('getNewestScreen: returns the most recently modified .html, ignoring non-html', () => {
  // Covers lines 124-133 with the populated branch (filter + map + sort + index 0).
  const older = path.join(CONTENT_DIR, 'old.html')
  const newer = path.join(CONTENT_DIR, 'new.html')
  fs.writeFileSync(older, '<h2>old</h2>')
  fs.writeFileSync(newer, '<h2>new</h2>')
  fs.writeFileSync(path.join(CONTENT_DIR, 'ignore.txt'), 'not html')

  // Pin mtimes deterministically so the sort order does not depend on write timing.
  const now = Date.now() / 1000
  fs.utimesSync(older, now - 100, now - 100)
  fs.utimesSync(newer, now, now)

  assert.equal(getNewestScreen(), newer)
})
