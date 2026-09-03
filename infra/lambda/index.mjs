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
  if (!authorized(event)) return reply(401, { error: 'unauthorized' })

  let input
  try {
    input = JSON.parse(event.body || '{}')
  } catch {
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

  return reply(200, output)
}
