/** Digits only: looks like a Mastodon snowflake id. Safe default for Discord. */
export const DIGITS = '0123456789'
/** URL-path-safe base64url alphabet: ~2.4x shorter ids, if the consumer accepts non-numeric ids. */
export const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const MAX_BYTES = 4095

function prefixWidth(base: bigint): number {
  let width = 1
  for (let cap = base; cap <= BigInt(MAX_BYTES); cap *= base)
    width++
  return width
}

function toDigits(n: bigint, alphabet: string, minWidth = 0): string {
  const base = BigInt(alphabet.length)
  let out = ''
  while (n > 0n) {
    out = alphabet[Number(n % base)] + out
    n /= base
  }
  return out.padStart(minWidth, alphabet[0])
}

function fromDigits(str: string, alphabet: string): bigint {
  const base = BigInt(alphabet.length)
  let n = 0n
  for (const c of str) {
    const idx = alphabet.indexOf(c)
    if (idx === -1)
      throw new Error(`Invalid character in id: ${c}`)
    n = (n * base) + BigInt(idx)
  }
  return n
}

export function bytesToHash(bytes: Uint8Array, alphabet = DIGITS): string {
  if (bytes.length > MAX_BYTES)
    throw new Error('Payload too large')
  const base = BigInt(alphabet.length)
  let n = 0n
  for (const b of bytes)
    n = (n << 8n) | BigInt(b)
  return toDigits(BigInt(bytes.length), alphabet, prefixWidth(base)) + (n > 0n ? toDigits(n, alphabet) : '')
}

export function hashToBytes(str: string, alphabet = DIGITS): Uint8Array {
  const width = prefixWidth(BigInt(alphabet.length))
  if (str.length < width)
    throw new Error('Id too short')
  const len = Number(fromDigits(str.slice(0, width), alphabet))
  if (len > MAX_BYTES)
    throw new Error('Id too large')
  let n = fromDigits(str.slice(width), alphabet)
  const bytes = new Uint8Array(len)
  for (let i = len - 1; i >= 0; i--) {
    bytes[i] = Number(n & 0xFFn)
    n >>= 8n
  }
  if (n !== 0n)
    throw new Error('Id length prefix mismatch')
  return bytes
}

class ByteWriter {
  private buf: number[] = []
  u8(v: number) { this.buf.push(v & 0xFF) }
  u16be(v: number) { this.buf.push((v >> 8) & 0xFF, v & 0xFF) }
  u64be(v: bigint) { for (let i = 7; i >= 0; i--)
    this.u8(Number((v >> BigInt(i * 8)) & 0xFFn)) }
  raw(bytes: Uint8Array) { for (const b of bytes)
    this.u8(b) }
  str(s: string) {
    const enc = new TextEncoder().encode(s)
    this.u16be(enc.length)
    this.raw(enc)
  }
  bytes() { return new Uint8Array(this.buf) }
}

class ByteReader {
  pos = 0
  constructor(private data: Uint8Array) { }
  private need(n: number) {
    if (this.pos + n > this.data.length)
      throw new Error('Truncated id')
  }
  u8() { this.need(1); return this.data[this.pos++] }
  u16be() { return (this.u8() << 8) | this.u8() }
  u64be() {
    let v = 0n
    for (let i = 0; i < 8; i++)
      v = (v << 8n) | BigInt(this.u8())
    return v
  }
  raw(n: number) {
    this.need(n)
    const slice = this.data.slice(this.pos, this.pos + n)
    this.pos += n
    return slice
  }
  str() { return new TextDecoder().decode(this.raw(this.u16be())) }
  done() { return this.pos === this.data.length }
}

/** base32-sortable, used by TIDs (record keys). */
const B32_SORT = '234567abcdefghijklmnopqrstuvwxyz'
/** RFC 4648 lowercase base32, used by did:plc. */
const B32_PLC = 'abcdefghijklmnopqrstuvwxyz234567'

const TID_RE = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/
const PLC_RE = /^did:plc:[a-z2-7]{24}$/

const tidToBigInt = (tid: string) => fromDigits(tid, B32_SORT)
const bigIntToTid = (n: bigint) => toDigits(n, B32_SORT, 13)

function plcToBytes(did: string): Uint8Array {
  let n = fromDigits(did.slice('did:plc:'.length), B32_PLC)
  const out = new Uint8Array(15)
  for (let i = 14; i >= 0; i--) {
    out[i] = Number(n & 0xFFn)
    n >>= 8n
  }
  return out
}

function bytesToPlc(bytes: Uint8Array): string {
  let n = 0n
  for (const b of bytes)
    n = (n << 8n) | BigInt(b)
  return 'did:plc:' + toDigits(n, B32_PLC, 24)
}

export interface StatusPayload {
  author: string
  rkey: string
  index?: number
  gallery?: boolean
  videoApi?: boolean
  thread?: boolean
}


const V0 = 0
const V1 = 1
const X_THREAD = 1 << 0
const H_RKEY_STR = 1 << 4
const H_VIDEO_API = 1 << 3
const H_GALLERY = 1 << 2
const H_INDEX = 1 << 1
const H_PLC = 1 << 0

export function encodeStatusId(payload: StatusPayload, alphabet = DIGITS): string {
  const isPlc = PLC_RE.test(payload.author)
  const isTid = TID_RE.test(payload.rkey)
  const hasIndex = payload.index !== undefined

  if (hasIndex && (!Number.isInteger(payload.index) || payload.index! < 0 || payload.index! > 0xFF)) {
    throw new Error('Index out of range')
  }

  const ext = payload.thread ? X_THREAD : 0

  const w = new ByteWriter()
  w.u8(
    ((ext ? V1 : V0) << 5) |
    (isTid ? 0 : H_RKEY_STR) |
    (payload.videoApi ? H_VIDEO_API : 0) |
    (payload.gallery ? H_GALLERY : 0) |
    (hasIndex ? H_INDEX : 0) |
    (isPlc ? H_PLC : 0),
  )
  if (ext)
    w.u8(ext)

  if (isPlc)
    w.raw(plcToBytes(payload.author))
  else
    w.str(payload.author)

  if (isTid)
    w.u64be(tidToBigInt(payload.rkey))
  else
    w.str(payload.rkey)

  if (hasIndex)
    w.u8(payload.index!)

  return bytesToHash(w.bytes(), alphabet)
}

export function decodeStatusId(id: string, alphabet = DIGITS): StatusPayload {
  const r = new ByteReader(hashToBytes(id, alphabet))
  const header = r.u8()
  const version = header >> 5
  if (version !== V0 && version !== V1)
    throw new Error(`Unsupported id version: ${version}`)
  const ext = version === V1 ? r.u8() : 0

  const author = header & H_PLC ? bytesToPlc(r.raw(15)) : r.str()
  const rkey = header & H_RKEY_STR ? r.str() : bigIntToTid(r.u64be())

  const payload: StatusPayload = { author, rkey }
  if (header & H_INDEX)
    payload.index = r.u8()
  if (header & H_GALLERY)
    payload.gallery = true
  if (header & H_VIDEO_API)
    payload.videoApi = true
  if (ext & X_THREAD)
    payload.thread = true

  if (!r.done())
    throw new Error('Trailing bytes in id')
  return payload
}
