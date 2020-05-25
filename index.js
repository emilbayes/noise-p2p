const hyperswarm = require('hyperswarm')
const sodium = require('sodium-native')
const noise = require('noise-peer')
const streamx = require('streamx')
const parallel = require('run-parallel')
const lpstream = require('length-prefixed-stream')
const Nanoresource = require('nanoresource/emitter')
const pump = require('pump')

class Peer extends Nanoresource {
  constructor (socket, behaviour) {
    super()

    this.socket = socket
    this.behaviour = behaviour

    this.remotePublicKey = null
  }

  _open (cb) {
    const done = (err) => {
      this.socket.off('connected', done)
      this.socket.off('error', done)

      if (err == null && this.behaviour.open) this.behaviour.open(this)

      return cb(err)
    }

    this.socket.once('handshake', ({ remoteStaticKey }) => {
      this.remotePublicKey = Buffer.from(remoteStaticKey)
    })

    this.socket.once('connected', done)
    this.socket.once('error', done)

    this.socket.once('end', this.close.bind(this))

    this.messenger = new streamx.Duplex({
      write: (data, cb) => {
        if (this.behaviour.message) this.behaviour.message(this, data)
        cb()
      }
    })

    pump(
      this.socket,
      lpstream.decode(),
      this.messenger,
      lpstream.encode(),
      this.socket,
      (err) => {
        if (this.behaviour.error && err) this.behaviour.error(this, err)
      }
    )
  }

  send (msg) {
    return this.messenger.push(msg)
  }

  _close (cb) {
    if (this.behaviour.close) this.behaviour.close(this)

    this.socket.end(null, cb)
  }
}

class Server extends Nanoresource {
  constructor ({
    topic,
    keyPair,
    clientKeys,

    open,
    message,
    error,
    close
  }) {
    super()
    this.topic = topic
    this.keyPair = keyPair
    this.clientKeys = clientKeys
    this.swarm = hyperswarm({
      ephemeral: false,
      maxPeers: 32,
      maxServerSockets: Infinity,
      maxClientSockets: -1,
      queue: {
        multiplex: false
      }
    })

    this.behaviour = { open, message, error, close }

    this.active = new Set()
    this.swarm.on('connection', this._onconnection.bind(this))
  }

  _open (cb) {
    this.swarm.join(this.topic, {
      announce: true,
      lookup: false
    }, cb)
  }

  _onconnection (socket, info) {
    var p = new Peer(noise(socket, false, {
      pattern: 'XK',
      staticKeyPair: this.keyPair,
      onstatickey: (remoteKey, cb) => {
        const valid = this.clientKeys.some(k => sodium.sodium_memcmp(remoteKey, k))

        if (valid === false) return cb(new Error('Invalid key', remoteKey.toString('hex')))
        return cb()
      }
    }), this.behaviour)

    p.open((err) => {
      if (err) return this.emit('connection-error', err)
      this.active.add(p)
    })

    socket.on('close', () => {
      this.active.delete(p)
    })
  }

  publish (message, cb) {
    parallel(Array.from(this.active, c => cb => c.send(message, cb)), function (err) {
      if (cb) return cb(err)
    })
  }

  listen (cb) {
    this.open(cb)
  }

  _close (cb) {
    this.swarm.leave(this.topic, () => {
      parallel(Array.from(this.active, c => c.close.bind(c)), (err) => {
        return cb(err)
      })
    })
  }
}

class Client extends Nanoresource {
  constructor ({
    topic,
    serverKey,
    keyPair,

    open,
    message,
    error,
    close
  }) {
    super()
    this.topic = topic
    this.keyPair = keyPair
    this.serverKey = serverKey
    this.swarm = hyperswarm({
      ephemeral: true,
      maxPeers: 3,
      maxServerSockets: -1,
      maxClientSockets: 3,
      queue: {
        multiplex: false
      }
    })

    this.behaviour = { open, message, error, close }
    this.active = new Set()

    this.swarm.on('connection', this._onconnection.bind(this))
  }

  _open (cb) {
    this._reconnect(cb)
  }

  _reconnect (cb) {
    if (this.active.size > 0) {
      this.emit('reconnect')
      return cb()
    }

    this.swarm.join(this.topic, {
      announce: false,
      lookup: true
    }, () => {
      setTimeout(() => this._reconnect(cb), 5000)
    })
  }

  _onconnection (socket, info) {
    var p = new Peer(noise(socket, true, {
      pattern: 'XK',
      remoteStaticKey: this.serverKey,
      staticKeyPair: this.keyPair
    }), this.behaviour)

    p.open((err) => {
      if (err) return this.emit('connection-error', err)
      this.active.add(p)
    })

    socket.on('close', () => {
      this.active.delete(p)

      this._reconnect(() => {})
    })
  }

  publish (message, cb) {
    parallel(Array.from(this.active, c => cb => c.send(message, cb)), function (err) {
      return cb(err)
    })
  }

  connect (cb) {
    this.open(cb)
  }

  _close (cb) {
    this.swarm.leave(this.topic, () => {
      parallel(Array.from(this.active, c => c.close.bind(c)), (err) => {
        return cb(err)
      })
    })
  }
}

module.exports = { Server, Client }
