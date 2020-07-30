const { NotifyClient } = require('notifications-node-client')
const { getDatabase, getSmsConfig, insertMetric, runIfDev } = require('./utils')

exports.handler = async function (event) {
  const { apiKey, queueUrl, smsSender, smsTemplate } = await getSmsConfig()
  const client = new NotifyClient(apiKey)
  const db = await getDatabase()

  for (const record of event.Records) {
    const { code, mobile, onsetDate, testDate, jobId } = JSON.parse(record.body)
    const month = new Date(testDate).toLocaleDateString(undefined, { month: 'short' })
    const day = new Date(testDate).toLocaleDateString(undefined, { day: '2-digit' })

    try {
      await client.sendSms(smsTemplate, mobile, {
        personalisation: {
          code,
          date: `${day} ${month}`
        },
        reference: null,
        smsSenderId: smsSender
      })

      await insertMetric(db, 'SMS_SENT', 'lambda', '')

      if (jobId) {
        console.log(`${jobId || 'request'} successfully sent`)
      }
    } catch (error) {
      const delay = 30

      console.error(error)
      console.log(`retrying ${jobId || 'request'} in ${delay} seconds`)

      const message = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ code, mobile, onsetDate, testDate, jobId }),
        DelaySeconds: delay
      }

      await sqs.sendMessage(message).promise()
    }
  }

  return true
}

runIfDev(exports.handler)
