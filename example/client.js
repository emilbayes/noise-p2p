const { Client } = require('..')
const Drift = require('./time-drift')

// look for peers listed under this topic
const topic = Buffer.from(process.env.TOPIC, 'hex')
const serverKey = Buffer.from(process.env.SERVER_KEY, 'hex')

const keyPair = {
  publicKey: Buffer.from(process.env.CLIENT_PUBLIC_KEY, 'hex'),
  secretKey: Buffer.from(process.env.CLIENT_SECRET_KEY, 'hex')
}

var gid = 0
var s = new Client({
  topic,
  keyPair,
  serverKey,

  open (peer) {
    console.log('Connected')

    peer.gid = gid++
    peer.cid = 0
    peer.requests = new Map()
    peer.timing = new Drift()
    peer.poll = setInterval(function () {
      var req = {
        start: peer.timing.now(),
        cid: peer.cid++
      }

      peer.requests.set(req.cid, req)
      peer.send(JSON.stringify(req))
    }, 1000)
  },
  error (peer, err) {
    console.error(err)
  },
  message (peer, message) {
    try {
      var { cid, sid, time } = JSON.parse(message)

      if (cid) {
        var request = peer.requests.get(cid)
        if (request) {
          peer.requests.delete(cid)
          var diff = peer.timing.now() - time
          var delta = peer.timing.now() - request.start

          peer.timing.add(diff, delta)
          console.log(peer.gid, {
            drift: peer.timing.drift.median.toFixed(2),
            ping: peer.timing.ping.median.toFixed(2)
          })
        }
      }

      if (sid) return peer.send(JSON.stringify({ sid, time: peer.timing.now() }))
    } catch (ex) {
      console.error('Parsing error', message, ex)
    }
  },
  close (peer) {
    clearInterval(peer.poll)
    console.log('Disconnected')
  }
})
s.on('connection-error', console.error)
s.connect(function () {
  console.log('Ready')
})

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)

function shutdown () {
  s.close(function () {
    process.exit(0)
  })
}
