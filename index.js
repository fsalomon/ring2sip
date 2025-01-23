import 'dotenv/config'
import { sip } from './sip.js'
import { ring } from './ring.js'
import { tones } from './tones.js'

// Initialize
Promise.all([
    sip.initialize(),
    ring.initialize()
]).then(() => {
    tones.initialize(sip, ring)
    console.log('INDEX - Initialized.')

    // Setup event listeners for SIP
    sip.on('ringing', () => {
      console.error('INDEX - SIP ringing')
      // for Ring button initiated all, the ring speaker should not play the ringback tone unless sip is actually ringing
      tones.sipRinging()
    })

    sip.on('callEstablished', (rtpInfo) => {
      console.log('INDEX - SIP call established')
      tones.sipReady()
      ring.pipeAudio(sip)
    })

    sip.on('callFailed', (err) => {
      console.error('INDEX - SIP call failed:', err)
      fullCleanup()
    })

    sip.on('callEnded', () => {
      console.log('INDEX - SIP call ended. Cleaning up everything.')
      fullCleanup()
    })
    
    sip.on('inboundCall', () => {
      console.log('INDEX - Inbound SIP call. Initiating RING call.')
      ring.initiateCall()
    })

    // Setup event listeners for Ring
    ring.on('callEstablished', () => {
      console.log('INDEX - Ring call established')
      sip.pipeAudio(ring)
    })

    ring.on('receivingAudio', () => {
      console.log('INDEX - Receiving audio from Ring')
      tones.ringReady()
    })

    ring.on('callEnded', () => {
      console.log('INDEX - Ring call ended. Cleaning up everything.')
      fullCleanup()
    })

    ring.on('buttonPressed', (camera) => {
      console.log(`INDEX - Button pressed for ${camera.name}`)
      doConnect()
    })

    sip.register()
    ring.listen()
    //doConnect() // for testing purposes
})

process.on('SIGINT', () => {
  console.log('\nINDEX - Caught Ctrl+C. Cleaning up and exiting...')
  fullCleanup()
})

// Functions
function fullCleanup() {
  sip.cleanup()
  ring.cleanup()
  tones.cleanup();
  setTimeout(() => {
    // give sip some time to cleanup
    process.exit(0)
  }, 200);
}

function doConnect(camera) {
    Promise.all([
      sip.initiateCall(),
      ring.initiateCall()
    ])
      .then(() => {
        console.log('INDEX - Both calls initiated in parallel.')
      })
      .catch((err) => {
        console.error('INDEX - Error initiating calls:', err)
        fullCleanup()
      })
}
