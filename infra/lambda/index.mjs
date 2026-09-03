// Lambda Function URL handler. Authenticates the push, reads the current
// status object from S3, hands it to the pure computation in status.mjs, and
// writes the result back.

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { timingSafeEqual } from 'node:crypto'
import { computeStatus } from './status.mjs'

const s3 = new S3Client({})

const BUCKET = process.env.BUCKET
const KEY = process.env.OBJECT_KEY || 'status.json'
const TOKEN = process.env.PUSH_TOKEN
const MAX_AGE_SECONDS = Number(process.env.MAX_AGE_SECONDS || 300)

const config = {
  timeZone: process.env.LOCAL_TZ || 'Pacific/Honolulu',
  halfLifeDays: Number(process.env.EWMA_HALF_LIFE_DAYS || 14),
  minBaselineDays: Number(process.env.MIN_BASELINE_DAYS || 7)
}

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
})

function authorized(event) {
  if (!TOKEN) return false
  const header = event.headers?.authorization || event.headers?.Authorization || ''
  const presented = Buffer.from(header.replace(/^Bearer\s+/i, ''))
  const expected = Buffer.from(TOKEN)
  return presented.length === expected.length && timingSafeEqual(presented, expected)
}

async function readExisting() {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }))
    return JSON.parse(await result.Body.transformToString())
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null
    throw error
  }
}

export const handler = async (event) => {
  // Both early exits return in a few milliseconds without touching S3, which
  // is indistinguishable from the outside. Log enough to tell them apart --
  // never the token itself, only whether a credential arrived and how long it
  // was, which is what actually goes wrong (missing "Bearer ", stray space).
  if (!authorized(event)) {
    const header = event.headers?.authorization || event.headers?.Authorization || ''
    console.log(JSON.stringify({
      outcome: 'unauthorized',
      authHeaderPresent: header.length > 0,
      hasBearerPrefix: /^Bearer\s+/i.test(header),
      presentedTokenLength: header.replace(/^Bearer\s+/i, '').length,
      expectedTokenLength: (TOKEN || '').length
    }))
    return reply(401, { error: 'unauthorized' })
  }

  // Function URLs base64-encode the body whenever the content type is not
  // recognised as text -- which includes anything Shortcuts sends as a File
  // rather than with an explicit application/json header.
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '')

  let input
  try {
    input = JSON.parse(rawBody || '{}')
  } catch {
    // The body is the useful thing here: it shows immediately if Shortcuts
    // sent newline-separated sample text instead of a number.
    console.log(JSON.stringify({
      outcome: 'bad-body',
      base64: Boolean(event.isBase64Encoded),
      bodyLength: rawBody.length,
      bodyPreview: rawBody.slice(0, 200)
    }))
    return reply(400, { error: 'body must be JSON' })
  }

  const existing = await readExisting()
  const output = computeStatus({ existing, input, now: new Date(), config })

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
    Body: JSON.stringify(output),
    ContentType: 'application/json',
    CacheControl: `max-age=${MAX_AGE_SECONDS}`
  }))

  console.log(JSON.stringify({
    outcome: 'ok',
    steps: output.steps?.value ?? null,
    heart: output.heart?.value ?? null,
    workout: output.workout?.type ?? null,
    baselineDays: output._baseline.days
  }))

  return reply(200, output)
}
