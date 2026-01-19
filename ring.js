import { RingApi } from 'ring-client-api'
import { EventEmitter } from 'events'
import { getRefreshTokenFromEnv, updateRefreshTokenInEnv } from './util.js'
import RtpSequencer  from './rtp-sequencer.js'

const {
  CAMERA_NAME
} = process.env

class Ring extends EventEmitter {
  constructor() {
    super()
    this.ringApi = null
    this.currentCall = null
    this.camera = null
    this.sip = null
    this.initiatingCall = false
    this.receivingAudio = false
    this.rtpSequencer = new RtpSequencer()
    this.battery = null
    this.connected = false
  }

  // 1) Initialize the Ring API
  initialize() {
    const refreshToken = getRefreshTokenFromEnv()
    this.ringApi = new RingApi({ refreshToken, debug: true })

    this.ringApi.onRefreshTokenUpdated.subscribe(async ({ newRefreshToken }) => {
      console.log('RING - Refresh token updated')
      updateRefreshTokenInEnv(newRefreshToken)
    })
    
    return this.ringApi.getCameras().then((cameras) => {
        if (!cameras.length) {
          return reject(new Error('No cameras found in the location.'))
        }
        
        for (let camera of cameras) {
            if (camera.isDoorbot && camera.name == CAMERA_NAME) {
                this.camera = camera
                console.log(`Attaching button listener to ${camera.name}`)
            }
        }
    })
  }

  // 2) Initiate a live call
  initiateCall() {
    if (this.initiatingCall) return
    this.initiatingCall = true
    
    return new Promise(async (resolve, reject) => {
      if (!this.ringApi) {
        return reject(new Error('Ring not initialized. Call initialize() first!'))
      }

      try {
        console.log(`RING - Starting live call on camera: ${this.camera.name}`)
        const call = await this.camera.startLiveCall()
        this.currentCall = call

        // Listen for call ended
        call.onCallEnded.subscribe(() => {
          console.log('RING - Call ended')
          this.emit('callEnded')
        })

        // Listen for call answered
        call.connection.onCallAnswered.subscribe((sdp) => {
          console.log('RING - Call answered, SDP received')
          this.emit('callEstablished')
        })

        // Start playing ringback for demonstration
        call.activateCameraSpeaker()
        
        // Listen for audio RTP
        call.connection.onAudioRtp.subscribe((rtpPacket) => {
          if (!this.receivingAudio) {
            this.receivingAudio = true
            this.emit('receivingAudio')
          }
          if (this.sip) {
            this.sip.sendAudioPacket(rtpPacket, false)
          }
        })

        // We’ve initiated the call
        resolve()
      } catch (err) {
        console.error('RING - Error initiating call:', err)
        reject(err)
      }
    })
  }
  
  listen() {
    this.camera.onDoorbellPressed.subscribe(() => {
      console.log(`RING - Button pressed`)
      this.emit('buttonPressed', this.camera)
    });
    this.camera.onData.subscribe((data) => {
      this.battery = data.health.battery_percentage
      this.connected = data.health.connected
      console.log('RING - Battery', this.battery)
    })
  }
  
  sendAudioPacket(rtp, isTone = false) {
    // If we haven't configured a destination, do nothing
    if (!this.currentCall) return

    // Use the utility to decide if we drop or forward
    const shouldForward = this.rtpSequencer.process(rtp, isTone)
    if (!shouldForward) return

    this.currentCall.sendAudioPacket(rtp)
  }
  
  pipeAudio(sip) {
    this.sip = sip
  }

  getBattery() {
    return this.battery
  }

  isConnected() {
    return this.connected
  }

  // 4) End the Ring call
  cleanup() {
    if (this.currentCall) {
      console.log('RING - Stopping the live call...')
      this.currentCall.stop()
      this.currentCall = null
    }
  }
}

// Export a singleton instance
export const ring = new Ring()

