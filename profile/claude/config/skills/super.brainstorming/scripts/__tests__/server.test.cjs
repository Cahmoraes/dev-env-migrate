'use strict'

/**
 * Regression tests for the brainstorm visual-companion server.
 *
 * Run with: node --test super.brainstorming/scripts/__tests__/
 *
 * Covers the pure protocol/serving helpers exported by server.cjs:
 *  - computeAcceptKey: RFC 6455 handshake vector.
 *  - encodeFrame / decodeFrame: server-frame byte layout and masked client-frame
 *    round-trip, including the "client frames must be masked" guard and partial buffers.
 *  - isFullDocument: full-document vs. fragment detection (drives auto-wrapping).
 *  - wrapInFrame: fragments are injected at the template's content marker.
 *
 * Requiring server.cjs does NOT start a listener (startServer only runs when invoked as
 * the main module), but it does read frame-template.html / helper.js at load time via
 * __dirname — which is exactly the static-path resolution we want to keep working.
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const { computeAcceptKey, encodeFrame, decodeFrame, OPCODES, isFullDocument, wrapInFrame } =
  require('../server.cjs')

// Build a masked client frame the way a browser would, so decodeFrame accepts it.
function maskedClientFrame(opcode, payload, mask) {
  const len = payload.length
  assert.ok(len < 126, 'test helper only handles small payloads')
  const header = Buffer.from([0x80 | opcode, 0x80 | len])
  const masked = Buffer.alloc(len)
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4]
  return Buffer.concat([header, mask, masked])
}

test('computeAcceptKey matches the RFC 6455 example vector', () => {
  // From RFC 6455 §1.3.
  assert.equal(
    computeAcceptKey('dGhlIHNhbXBsZSBub25jZQ=='),
    's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
  )
})

test('encodeFrame: short payload uses the 2-byte header (fin + opcode, then length)', () => {
  const payload = Buffer.from('hello')
  const frame = encodeFrame(OPCODES.TEXT, payload)
  assert.equal(frame[0], 0x80 | OPCODES.TEXT, 'FIN bit set with TEXT opcode')
  assert.equal(frame[1], payload.length, 'length in the second byte (no mask bit)')
  assert.equal(frame.length, 2 + payload.length)
  assert.equal(frame.slice(2).toString(), 'hello')
})

test('encodeFrame: medium payload uses the 126 extended-length header', () => {
  const payload = Buffer.alloc(200, 0x61) // 200 bytes >= 126, < 65536
  const frame = encodeFrame(OPCODES.TEXT, payload)
  assert.equal(frame[1], 126, 'length flag 126 signals 16-bit extended length')
  assert.equal(frame.readUInt16BE(2), 200)
  assert.equal(frame.length, 4 + 200)
})

test('decodeFrame: round-trips a masked client TEXT frame', () => {
  const payload = Buffer.from('ping-data')
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78])
  const frame = maskedClientFrame(OPCODES.TEXT, payload, mask)

  const result = decodeFrame(frame)
  assert.equal(result.opcode, OPCODES.TEXT)
  assert.equal(result.payload.toString(), 'ping-data')
  assert.equal(result.bytesConsumed, frame.length)
})

test('decodeFrame: rejects unmasked client frames', () => {
  // Server-style (unmasked) frame must be refused by the client-frame decoder.
  const unmasked = encodeFrame(OPCODES.TEXT, Buffer.from('x'))
  assert.throws(() => decodeFrame(unmasked), /must be masked/)
})

test('decodeFrame: returns null for an incomplete buffer', () => {
  assert.equal(decodeFrame(Buffer.from([0x81])), null, 'one byte is not a full header')

  const payload = Buffer.from('abcd')
  const mask = Buffer.from([1, 2, 3, 4])
  const full = maskedClientFrame(OPCODES.TEXT, payload, mask)
  assert.equal(decodeFrame(full.slice(0, full.length - 1)), null, 'truncated payload → null')
})

test('isFullDocument: detects documents, treats markup snippets as fragments', () => {
  assert.equal(isFullDocument('<!DOCTYPE html><html></html>'), true)
  assert.equal(isFullDocument('   \n  <!doctype html>'), true, 'leading whitespace tolerated')
  assert.equal(isFullDocument('<HTML><body></body></HTML>'), true, 'case-insensitive')
  assert.equal(isFullDocument('<div class="options"></div>'), false)
  assert.equal(isFullDocument('<h2>Pick one</h2>'), false)
})

test('wrapInFrame: injects the fragment at the template content marker', () => {
  const fragment = '<h2>UNIQUE-FRAGMENT-MARKER</h2>'
  const wrapped = wrapInFrame(fragment)
  assert.ok(wrapped.includes(fragment), 'fragment present in the wrapped output')
  assert.ok(!wrapped.includes('<!-- CONTENT -->'), 'content marker is consumed by the wrap')
  assert.ok(/<\/html>/i.test(wrapped), 'wrapped output is a full document')
})
