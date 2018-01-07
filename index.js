const defunction = require('defunction')
const crypto = require('crypto')
const Promise = require('bluebird')
const Bn = require('bn.js')
const Emitter = require('events')

const solveNonceWorkerUtf8 = `

  function solveNonce(hash, threshold) {
    const nonce = crypto.getRandomValues(new Uint8Array(32))
    const noncedHash = new Uint8Array(64)
    noncedHash.set(nonce)
    noncedHash.set(hash, 32)
    return crypto.subtle.digest("SHA-256", noncedHash).then((solutionArrayBuffer) => {
      const solution = new Uint8Array(solutionArrayBuffer)
      for (let i = 0; i < 32; i++) {
        if (threshold[i] > solution[i]) {
          return nonce
        } else if (threshold[i] < solution[i]) {
          return solveNonce(hash, threshold)
        }
      }
      return solveNonce(hash, threshold)
    })
  }

  onmessage = function onmessage(event) {
    solveNonce(event.data.hash, event.data.threshold).then((nonce) => {
      postMessage({ id: event.data.id, nonce })
    })
  }
`

const hashcash = module.exports

hashcash.emitter = new Emitter

hashcash.getThreshold = defunction(['number'], 'Uint8Array', function getThreshold(difficulty) {
  const twoBn = new Bn(2)
  const expBn = new Bn(256 - difficulty)
  const thresholdBn = twoBn.pow(expBn).sub(new Bn(1))
  return thresholdBn.toArrayLike(Uint8Array, 'be', 32)
})

let solveNonceWorker

hashcash.getSolveNonceWorker = defunction([], 'Worker', function getWorker() {
  if (solveNonceWorker) {
    return solveNonceWorker
  }
  const solveNonceWorkerBlob = new Blob([solveNonceWorkerUtf8], {type: 'application/javascript'});
  solveNonceWorker = new Worker(URL.createObjectURL(solveNonceWorkerBlob))

  solveNonceWorker.onmessage = function onmessage(event) {
    hashcash.emitter.emit('nonce', event.data)
  }

  return solveNonceWorker
})

hashcash.solveNonce = defunction(['Uint8Array', 'number'], '=>Uint8Array', function solveNonce(hash, difficulty) {

  const threshold = hashcash.getThreshold(difficulty)

  if (typeof window !== 'undefined' && typeof window.Worker !== 'undefined') {
    return new Promise((resolve, reject) => {

      const id = Math.random()
      const solveNonceWorker = hashcash.getSolveNonceWorker()

      const onNonce = (data) => {
        if ( data.id !== id ) { return }
        hashcash.emitter.removeListener('nonce', onNonce)
        resolve(data.nonce)
      }

      hashcash.emitter.on('nonce', onNonce)

      solveNonceWorker.postMessage({ id, hash, threshold })
    })
  }


  const hashBuffer = new Buffer(hash)
  const thresholdBuffer = new Buffer(threshold)

  let nonceBuffer
  let noncedHashBuffer
  let solutionBuffer
  do {
    nonceBuffer = crypto.randomBytes(32)
    noncedHashBuffer = Buffer.concat([nonceBuffer, hashBuffer])
    solutionBuffer = crypto.createHash('sha256').update(noncedHashBuffer).digest()
  } while(
    Buffer.compare(thresholdBuffer, solutionBuffer) === -1
  )
  return Promise.resolve(new Uint8Array(nonceBuffer))
})

hashcash.verify = defunction(['Uint8Array', 'number', 'Uint8Array'], 'boolean', function verify(hash, difficulty, nonce) {
  const threshold = hashcash.getThreshold(difficulty)
  const noncedHash = new Uint8Array(64)
  noncedHash.set(nonce)
  noncedHash.set(hash, 32)
  const solution = new Uint8Array(crypto.createHash('sha256').update(noncedHash).digest())
  for (let i = 0; i < 32; i++) {
    if (threshold[i] > solution[i]) {
      return true
    } else if (threshold[i] < solution[i]) {
      return false
    }
  }
  return false
})
