const { Server } = require('..')
const Drift = require('./time-drift')

// look for peers listed under this topic
const topic = Buffer.from(process.env.TOPIC, 'hex')

const keyPair = {
  publicKey: Buffer.from(process.env.SERVER_PUBLIC_KEY, 'hex'),
  secretKey: Buffer.from(process.env.SERVER_SECRET_KEY, 'hex')
}

const clientKeys = process.env.CLIENT_KEYS.split(',').map(k => Buffer.from(k.trim(), 'hex'))

var gid = 0
var s = new Server({
  topic,
  keyPair,
  clientKeys,

  open (peer) {
    console.log('Connected')

    peer.gid = gid++
    peer.sid = 0
    peer.requests = new Map()
    peer.timing = new Drift()
    peer.poll = setInterval(function () {
      var req = {
        start: peer.timing.now(),
        sid: peer.sid++
      }

      peer.requests.set(req.sid, req)
      peer.send(JSON.stringify(req))
    }, 1000)
  },
  error (peer, err) {
    console.error(err)
  },
  message (peer, message) {
    try {
      var { cid, sid, time } = JSON.parse(message)

      if (sid) {
        var request = peer.requests.get(sid)
        if (request) {
          peer.requests.delete(sid)
          var diff = peer.timing.now() - time
          var delta = peer.timing.now() - request.start

          peer.timing.add(diff, delta)
          console.log(peer.gid, peer.remoteStaticKey.subarray(0, 4).toString('hex'), {
            drift: peer.timing.drift.median.toFixed(2),
            ping: peer.timing.ping.median.toFixed(2)
          })
        }
      }

      if (cid) return peer.send(JSON.stringify({ cid, time: peer.timing.now() }))
    } catch (ex) {
      console.error('Parsing error', message, ex)
    }
  },
  close (peer) {
    clearInterval(peer.poll)
    console.log('Disconnected')
  }
})

s.listen(function () {
  console.log('Ready')
})

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)

function shutdown () {
  s.close(function () {
    process.exit(0)
  })
}
