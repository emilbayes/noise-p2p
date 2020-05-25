const { Server } = require('..')

// look for peers listed under this topic
const topic = Buffer.from(process.env.TOPIC, 'hex')

const keyPair = {
  publicKey: Buffer.from(process.env.SERVER_PUBLIC_KEY, 'hex'),
  secretKey: Buffer.from(process.env.SERVER_SECRET_KEY, 'hex')
}

const clientKeys = process.env.CLIENT_KEYS.split(',').map(k => Buffer.from(k.trim(), 'hex'))

var s = new Server({
  topic,
  keyPair,
  clientKeys,

  open (peer) {
    console.log('Connected')
    // setup peer state here
  },
  error (peer, err) {
    console.error(err)
  },
  message (peer, message) {
    peer.send(message.toString().toUpperCase())
  },
  close (peer) {
    // Teardown here
    console.log('Disconnected')
  }
})

s.listen(function () {
  console.log('Ready')
})

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)

function shutdown () {
  s.close()
}
