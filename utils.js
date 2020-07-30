const AWS = require('aws-sdk')
const SQL = require('@nearform/sql')
const pg = require('pg')

const isProduction = /^\s*production\s*$/i.test(process.env.NODE_ENV)
const ssm = new AWS.SSM({ region: process.env.AWS_REGION })
const secretsManager = new AWS.SecretsManager({ region: process.env.AWS_REGION })

async function getParameter(id) {
  const response = await ssm
    .getParameter({ Name: `${process.env.CONFIG_VAR_PREFIX}${id}` })
    .promise()

  return response.Parameter.Value
}

async function getSecret(id) {
  const response = await secretsManager
    .getSecretValue({ SecretId: `${process.env.CONFIG_VAR_PREFIX}${id}` })
    .promise()

  return JSON.parse(response.SecretString)
}

async function getAssetsBucket() {
  if (isProduction) {
    return await getParameter('s3_assets_bucket')
  } else {
    return process.env.ASSETS_BUCKET
  }
}

async function getDatabase() {
  require('pg-range').install(pg)

  let client

  if (isProduction) {
    const [{ username: user, password }, host, port, ssl, database] = await Promise.all([
      getSecret('rds-read-write'),
      getParameter('db_host'),
      getParameter('db_port'),
      getParameter('db_ssl'),
      getParameter('db_database')
    ])

    client = new pg.Client({
      host,
      database,
      user,
      password,
      port: Number(port),
      ssl: ssl === 'true'
    })
  } else {
    const { user, password, host, port, ssl, database } = {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      ssl:  /true/i.test(process.env.DB_SSL),
      database: process.env.DB_DATABASE
    }

    client = new pg.Client({
      host,
      database,
      user,
      password,
      port: Number(port),
      ssl: ssl === 'true'
    })
  }

  await client.connect()

  return client
}

async function getInteropConfig() {
  if (isProduction) {
    return await getSecret('interop')
  } else {
    return {
      maxAge: Number(process.env.INTEROP_MAX_AGE),
      token: process.env.INTEROP_TOKEN,
      url: process.env.INTEROP_URL
    }
  }
}

async function getSmsConfig() {
  if (isProduction) {
    const [
      { apiKey, smsSender, smsTemplate },
      queueUrl
    ] = await Promise.all([
      getSecret('sms'),
      getParameter('sms_url')
    ])

    return { apiKey, queueUrl, smsSender, smsTemplate }
  } else {
    return {
      apiKey: process.env.SMS_API_KEY,
      queueUrl: process.env.CALLBACK_QUEUE_URL,
      smsSender: process.env.SMS_SENDER,
      smsTemplate: process.env.SMS_TEMPLATE
    }
  }
}

async function insertMetric(client, event, os, version) {
  const query = SQL`
    INSERT INTO metrics (date, event, os, version, value)
    VALUES (CURRENT_DATE, ${event}, ${os}, ${version}, 1)
    ON CONFLICT ON CONSTRAINT metrics_pkey
    DO UPDATE SET value = metrics.value + 1`

  await client.query(query)
}

function runIfDev(fn) {
  if (!isProduction) {
    fn(JSON.parse(process.argv[2] || '{}'))
      .then(result => {
        console.log(result)
        process.exit(0)
      })
      .catch(error => {
        console.log(error)
        process.exit(1)
      })
  }
}

module.exports = {
  getAssetsBucket,
  getDatabase,
  getInteropConfig,
  getSmsConfig,
  insertMetric,
  runIfDev
}
