import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const endpoint = process.env.S3_ENDPOINT || ''
const bucket = process.env.S3_BUCKET || 'leet-arena-media'
export const objectStorageEnabled = Boolean(endpoint)
export const storageClient = objectStorageEnabled ? new S3Client({ endpoint, region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY || '', secretAccessKey: process.env.S3_SECRET_KEY || '' } }) : null

export async function uploadMedia(key, body, contentType) {
  if (!storageClient) return false
  await storageClient.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }))
  return true
}

export async function getMedia(key) {
  if (!storageClient) return null
  return storageClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
}
