const noise = require('noise-peer')

var kp = noise.keygen()

console.log(`
*_PUBLIC_KEY=${kp.publicKey.toString('hex')}
*_SECRET_KEY=${kp.secretKey.toString('hex')}
`)
