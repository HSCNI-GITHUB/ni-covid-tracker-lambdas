const AWS = require('aws-sdk')
const SQL = require('@nearform/sql')
const { getAssetsBucket, getDatabase, runIfDev } = require('./utils')

async function getInstalls(client) {
  const sql = SQL`
    SELECT
      created_at::DATE AS day,
      SUM(COUNT(id)) OVER (ORDER BY created_at::DATE) AS count
    FROM registrations
    GROUP BY created_at::DATE`

  const { rows } = await client.query(sql)

  return rows.map(({ day, count }) => ([new Date(day), Number(count)]))
}

async function getStatsBody(client) {
  const installs = await getInstalls(client)

  return {
    generatedAt: new Date(),
    installs
  }
}

exports.handler = async function () {
  const s3 = new AWS.S3({ region: process.env.AWS_REGION })
  const client = await getDatabase()
  const bucket = await getAssetsBucket()
  const stats = JSON.stringify(await getStatsBody(client))

  const statsObject = {
    ACL: 'private',
    Body: Buffer.from(stats),
    Bucket: bucket,
    ContentType: 'application/json',
    Key: 'stats.json'
  }

  await s3.putObject(statsObject).promise()

  return stats
}

runIfDev(exports.handler)
