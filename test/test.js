const hashcash = require('../')
const crypto = require('crypto')
const _ = require('lodash')
const waterfall = require('promise-waterfall')

const chai = require('chai')
chai.should()

describe('hashcash', () => {
  const hash = new Uint8Array(crypto.randomBytes(32))
  let nonce
  if (typeof window !== 'undefined') {
    it('hashes should match', (done) => {
      const prehash = new Uint8Array([1, 2, 3, 4])
      window.crypto.subtle.digest("SHA-256", prehash).then((_browserHash) => {
        const browserHash = new Uint8Array(_browserHash)
        const webpackHash = new Uint8Array(crypto.createHash('sha256').update(prehash).digest())
        browserHash.should.deep.equal(webpackHash)
        done()
      })
    })
  }
  it('should solve nonce', () => {
    return hashcash.solveNonce(hash, 8).then((_nonce) => {
      nonce = _nonce
    })
  })
  it('should verify nonce', () => {
    return hashcash.verify(hash, 8, nonce).should.equal(true)
  })
  describe('timers', () => {
    _.range(10).map((difficulty) => {
      it(`difficulty: ${difficulty}`, () => {
        return getAverageTime(hash, difficulty, 10).then((averageTime) => {
          console.log(averageTime)
        })
      })
    })
  })
})

function getSample(hash, difficulty) {
  let startedAt = Date.now()
  return hashcash.solveNonce(hash, difficulty).then(() => {
    endedAt = Date.now()
    return endedAt - startedAt
  })
}

function getSamples(hash, diffuculty, count) {
  const times = []
  return waterfall(_.range(count).map(() => {
    return () => {
      return getSample(hash, diffuculty).then((time) => {
        times.push(time)
      })
    }
  })).then(() => {
    return times
  })
}

function getAverageTime(hash, difficulty, count) {
  return getSamples(hash, difficulty, count).then((times) => {
    return _.sum(times) / count
  })
}
