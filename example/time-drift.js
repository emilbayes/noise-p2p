const compare = require('compare')
const CappedArray = require('@emilbayes/capped-array')

class Drift {
  constructor () {
    this._drift = new CappedArray(101)
    this._ping = new CappedArray(101)

    this.drift = { mean: 0, stddev: 0, median: 0 }
    this.ping = { mean: 0, stddev: 0, median: 0 }
  }

  add (diff, delta) {
    const ping = delta / 2
    const drift = diff

    this._ping.push(ping)
    this._drift.push(drift + ping)

    Object.assign(this.drift, this._stats(this._drift))
    Object.assign(this.ping, this._stats(this._ping))
  }

  _stats (samples) {
    if (samples.length === 1) return { mean: samples[0], stddev: 0, median: samples[0] }

    const mean = samples.reduce(sum, 0) / samples.length
    const variance = samples.map((xi) => (xi - mean) ** 2).reduce(sum, 0) / samples.length
    const stddev = Math.sqrt(variance)

    const left = mean - stddev
    const right = mean + stddev
    const inrange = samples.filter((xi) => {
      return xi > left && xi < right
    }).sort(compare)

    const median = inrange.length > 0 ? inrange[inrange.length / 2 | 0] : samples[0]

    return { mean, stddev, median }

    function sum (s, n) {
      return s + n
    }
  }

  now () {
    return Date.now() - this.drift.median
  }
}

module.exports = Drift
