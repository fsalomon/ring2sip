import sipLib from 'sip'
import digest from 'sip/digest.js'
import { RtpPacket } from 'werift'
import { EventEmitter } from 'events'
import { createSocket } from "dgram";
import RtpSequencer  from './rtp-sequencer.js'

const {
  SIP_DOMAIN,
  SIP_PORT,
  SIP_DEST,
  SIP_USER,
  SIP_PASS,
  LOCAL_IP,
  LOCAL_RTP_PORT,
  LOCAL_SIP_PORT
} = process.env

function rstring() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 9; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

class Sip extends EventEmitter {
  constructor() {
    super()
    this.sipSession = null
    this.inviteRequest = null
    this.authSession = { realm: SIP_DOMAIN }
    this.isSipStackStarted = false
    this.initiatingCall = false
    this.serverRtpInfo = null
    this.udp = createSocket('udp4');
    this.udp.bind(LOCAL_RTP_PORT, LOCAL_IP, () => {
      console.log(`SIP - RTP Socket bound to ${LOCAL_IP}:${LOCAL_RTP_PORT}`);
    })
    this.rtpSequencer = new RtpSequencer()

    this.registerInterval = null
    this.registerExpires = 600 // seconds (example)
    this.currentCallId = null  // track inbound calls or single call scenario

    this.registered = false
  }

  //--------------------------------------------------------------------------
  // Public Methods
  //--------------------------------------------------------------------------

  initialize(debug = false) {
    if (this.isSipStackStarted) return

    sipLib.start({
      address: LOCAL_IP,
      port: LOCAL_SIP_PORT,
      logger: debug ? {
        send: function(m, target) { console.log('send', m) },
        recv: function(m, target) { console.log('recv', m) },
        error: function(e) { console.log('error', e) }
      } : null
    }, (request) => {
      console.log(`SIP - Received request: ${request.method}`)

      if (request.method === 'BYE') {
        this._handleBye(request)
      }
      else if (request.method === 'INVITE') {
        this._handleInboundInvite(request)
      }
      else if (request.method === 'OPTIONS') {
        const response = sipLib.makeResponse(request, 200, 'OK')
        sipLib.send(response)
      }
    })

    this.isSipStackStarted = true
    
    return Promise.resolve()
  }

  register() {
    if (this.registerInterval) {
      // Already registering/registered
      return
    }

    const sendRegister = (expires = this.registerExpires) => {
      // pessimistic by default until we hear back
      let replied = false

      // small guard: if we never get a response, don't lie forever
      const timeoutMs = 8000
      const t = setTimeout(() => {
        if (!replied) {
          this.registered = false
          this.emit('registrationChanged', this.registered)
        }
      }, timeoutMs)

      const callId = rstring()
      const registerRequest = {
        method: 'REGISTER',
        uri: `sip:${SIP_DOMAIN}`,
        headers: {
          to: { uri: `sip:${SIP_USER}@${SIP_DOMAIN}` },
          from: {
            uri: `sip:${SIP_USER}@${SIP_DOMAIN}`,
            params: { tag: rstring() }
          },
          'call-id': callId,
          cseq: { method: 'REGISTER', seq: 1 },
          contact: [{
            uri: `sip:${SIP_USER}@${LOCAL_IP}:${LOCAL_SIP_PORT}`,
            params: { expires }
          }],
          'max-forwards': 70,
          'user-agent': 'SipToRing/1.0',
          'Expires': expires
        }
      }

      sipLib.send(registerRequest, (response) => {
        replied = true
        clearTimeout(t)

        if (response.status === 401 && response.headers['www-authenticate']) {
          this._retryWithDigestAuth(
            registerRequest, 
            response,
            'SIP - REGISTER success (after auth).',
            'SIP - REGISTER failed:',
            (authResp) => {
              const ok = authResp && authResp.status >= 200 && authResp.status < 300
              const changed = this.registered !== ok
              this.registered = ok
              if (changed) this.emit('registrationChanged', this.registered)
            }
          )
        }
        else if (response.status >= 200 && response.status < 300) {
          console.log('SIP - REGISTER success.')
          const changed = this.registered !== true
          this.registered = true
          if (changed) this.emit('registrationChanged', this.registered)
        }
        else {
          console.error(`SIP - REGISTER failed: ${response.status} ${response.reason}`)
          const changed = this.registered !== false
          this.registered = false
          if (changed) this.emit('registrationChanged', this.registered)
        }
      })
    }

    // Immediately send a REGISTER
    sendRegister(this.registerExpires)

    // Keep re-registering every <registerExpires> seconds
    this.registerInterval = setInterval(() => {
      sendRegister(this.registerExpires)
    }, this.registerExpires * 1000)
  }

  isRegistered() {
    return this.registered
  }

  initiateCall() {
    if (this.initiatingCall) return
    this.initiatingCall = true
    
    console.log(`SIP - Initiating call to extension ${SIP_DEST} on ${SIP_DOMAIN}...`)
    
    const sessionId = Date.now()
    this.inviteRequest = {
      method: 'INVITE',
      uri: `sip:${SIP_DEST}@${SIP_DOMAIN}`,
      headers: {
        to: { uri: `sip:${SIP_DEST}@${SIP_DOMAIN}` },
        from: {
          uri: `sip:${SIP_USER}@${SIP_DOMAIN}`,
          params: { tag: rstring() }
        },
        'call-id': rstring(),
        cseq: { method: 'INVITE', seq: 1 },
        contact: [{ uri: `sip:${SIP_USER}@${LOCAL_IP}:${LOCAL_SIP_PORT}` }],
        'max-forwards': 70,
        'content-type': 'application/sdp'
      },
      content: this._buildLocalSdp(sessionId)
    }

    sipLib.send(this.inviteRequest, (response) => {
      this._handleInviteResponse(response)
    })
  }

  cleanup() {
    // If there's a live call, send BYE
    if (this.sipSession && this.sipSession.headers) {
      console.log('SIP - Sending BYE to terminate call...')
      const response = this.sipSession
      const byeUri =
        response.headers?.contact?.[0]?.uri ||
        response.headers?.to?.uri

      if (!byeUri) {
          console.log('SIP - No BYE target URI found (missing Contact/To). Skipping BYE.')
      } else {
        const request = {
          method: 'BYE',
          uri: byeUri,
          headers: {
            to: response.headers.to,
            from: response.headers.from,
            'call-id': response.headers['call-id'],
            cseq: { method: 'BYE', seq: response.headers.cseq.seq + 1 },
            via: response.headers.via
          }
        }
        sipLib.send(request)
      }

      const request = {
          method: 'BYE',
          uri: response.headers.contact[0].uri,
          headers: {
            to: response.headers.to,
            from: response.headers.from,
            'call-id': response.headers['call-id'],
            cseq: { method: 'BYE', seq: response.headers.cseq.seq + 1 },
            via: response.headers.via
          }
      }
      sipLib.send(request)
    } 
    // If we have an INVITE in progress, send CANCEL
    else if (this.inviteRequest) {
      console.log('SIP - Sending CANCEL to terminate call...')
      const response = this.inviteRequest
      const request = {
        method: 'CANCEL',
        uri: response.uri,
        headers: {
          to: response.headers.to,
          from: response.headers.from,
          'call-id': response.headers['call-id'],
          cseq: { method: 'CANCEL', seq: response.headers.cseq.seq + 1 },
          via: response.headers.via
        }
      }
      sipLib.send(request)
    }

    // Unregister (send REGISTER with Expires=0)
    if (this.registerInterval) {
      clearInterval(this.registerInterval)
      this.registerInterval = null

      // we are no longer "registered" from our app's POV
      if (this.registered !== false) {
        this.registered = false
        this.emit('registrationChanged', this.registered)
      }

      // Optional: Send a REGISTER to remove our contact
      const unregisterRequest = {
        method: 'REGISTER',
        uri: `sip:${SIP_DOMAIN}`,
        headers: {
          to: { uri: `sip:${SIP_USER}@${SIP_DOMAIN}` },
          from: {
            uri: `sip:${SIP_USER}@${SIP_DOMAIN}`,
            params: { tag: rstring() }
          },
          'call-id': rstring(),
          cseq: { method: 'REGISTER', seq: 1 },
          contact: [{
            uri: `sip:${SIP_USER}@${LOCAL_IP}:${LOCAL_SIP_PORT}`,
            params: { expires: 0 }
          }],
          'max-forwards': 70,
          'Expires': 0
        }
      }

      const sendUnregister = (req) => {
        sipLib.send(req, (response) => {
          if (response.status === 401 && response.headers['www-authenticate']) {
            console.log('SIP - Unregister unauthorized. Retrying with Digest Authentication...')
            this._retryWithDigestAuth(
              req,
              response,
              'SIP - Unregister success (after auth).',
              'SIP - Unregister failed:',
              () => {}
            )
          } else if (response.status >= 200 && response.status < 300) {
            console.log('SIP - Unregister success.')
          } else {
            console.error(`SIP - Unregister failed: ${response.status} ${response.reason}`)
          }
        })
      }

      sendUnregister(unregisterRequest)
    }

    // Close the UDP socket
    if (this.udp) {
      this.udp.close()
      this.udp = null
    }
    this.sipSession = null
    this.inviteRequest = null
  }

  pipeAudio(ring) {
    this.udp.on('message', (message) => {
      const rtpPacket = RtpPacket.deSerialize(message)
      ring.sendAudioPacket(rtpPacket, false)
    })
  }

  sendAudioPacket(rtp, isTone = false) {
    if (!this.serverRtpInfo) return

    // Use RtpSequencer to decide if we drop or forward
    const shouldForward = this.rtpSequencer.process(rtp, isTone)
    if (!shouldForward) return

    rtp.header.payloadType = this.serverRtpInfo.payloadType
    this.udp.send(rtp.serialize(), this.serverRtpInfo.port, this.serverRtpInfo.destination)
  }

  //--------------------------------------------------------------------------
  // Internal Helpers
  //--------------------------------------------------------------------------

  /**
   * Centralized method to handle 401 + Digest Authentication
   */
  _retryWithDigestAuth(request, response, successLog, errorLog, callback) {
    console.log('SIP - Unauthorized (401). Retrying with Digest Authentication...')
    digest.signRequest(this.authSession, request, response, {
      user: SIP_USER,
      password: SIP_PASS
    })
    request.headers.cseq.seq += 1

    sipLib.send(request, (authResp) => {
      if (authResp.status >= 100 && authResp.status < 300) {
        console.log(successLog)
      } else {
        console.error(`${errorLog} ${authResp.status} ${authResp.reason}`)
      }
      callback(authResp)
    })
  }

  _handleBye(request) {
    const ourCallId = this.sipSession?.headers['call-id']
    const receivedCallId = request.headers['call-id']
    
    sipLib.send(sipLib.makeResponse(request, 200, 'OK'))

    if (ourCallId && receivedCallId && ourCallId === receivedCallId) {
      console.log('SIP - Received BYE for our call. Sending 200 OK, ending call.')
      this.sipSession = null
      this.emit('callEnded')
    } else {
      console.log('SIP - Received BYE with mismatched or missing call-id. Ignoring.')
    }
  }

  /**
   * Handle inbound INVITE. We'll auto-answer only if OPUS is offered.
   * If OPUS is not found, reject with 488 Not Acceptable Here.
   */
  _handleInboundInvite(request) {
    if (this.initiatingCall) return
    this.initiatingCall = true
    
    console.log('SIP - Inbound call, checking offered codecs...')

    // Keep track of this call to handle BYE properly
    this.currentCallId = request.headers['call-id']

    // Parse the remote SDP
    const remoteSdp = request.content || ''
    const remoteInfo = this._parseSdpForOpus(remoteSdp)
    
    if (!remoteInfo) {
      // No OPUS found, reject
      console.log('SIP - Remote did not offer OPUS. Rejecting call.')
      const response = sipLib.makeResponse(request, 488, 'Not Acceptable Here')
      sipLib.send(response)
      return
    }

    // Store the server RTP info so we can send audio to them
    this.serverRtpInfo = remoteInfo

    // Send 100 Trying
    sipLib.send(sipLib.makeResponse(request, 100, 'Trying'))
    
    this.emit('inboundCall')

    // Optional: Send 180 Ringing if you want to simulate "ringing"
    sipLib.send(sipLib.makeResponse(request, 180, 'Ringing'))

    console.log('SIP - Offering 200 OK with local OPUS SDP...')

    // Build 200 OK with local SDP
    const sessionId = Date.now()
    const okResponse = sipLib.makeResponse(request, 200, 'OK')
    okResponse.headers['content-type'] = 'application/sdp'
    okResponse.content = this._buildLocalSdp(sessionId)

    sipLib.send(okResponse)
    
    this.sipSession = okResponse

    // The inbound call is now "established" from our perspective
    // (SIP library will handle the ACK check behind the scenes)

    this.emit('callEstablished', this.serverRtpInfo)
  }

  _handleInviteResponse(response) {
    if (!this.inviteRequest) return

    // 401 => unauthorized, re-send with Digest
    if (response.status === 401 && response.headers['www-authenticate']) {
      this._retryWithDigestAuth(
        this.inviteRequest,
        response,
        'SIP - INVITE success (after auth).',
        'SIP - INVITE failed:',
        (authResp) => this._handleInviteResponse(authResp)
      )
      return
    }
    else if (response.status >= 100 && response.status < 200) {
      // Provisional responses
      if (response.status === 180) {
        this.emit('ringing')
      }
    }
    else if (response.status >= 200 && response.status < 300) {
      console.log(`SIP - Call established: ${response.status} ${response.reason}`)
      this.sipSession = response

      // Parse SDP from the response
      this.serverRtpInfo = this._parseSdpForOpus(response.content)

      // Send ACK
      sipLib.send({
        method: 'ACK',
        uri: response.headers.contact[0].uri,
        headers: {
          to: response.headers.to,
          from: response.headers.from,
          'call-id': response.headers['call-id'],
          cseq: { method: 'ACK', seq: response.headers.cseq.seq },
          via: response.headers.via
        }
      })

      // Let others know we've established the call
      this.emit('callEstablished', this.serverRtpInfo)
    } 
    else {
      console.error(`SIP - Call failed: ${response.status} ${response.reason}`, response)
      this.inviteRequest = null
      this.emit('callFailed', { status: response.status, reason: response.reason })
    }
  }

  /**
   * Parse the remote SDP, find if OPUS is offered, and return
   * the destination/port/payloadType for OPUS. If not found, return null.
   */
  _parseSdpForOpus(sdp) {
    if (!sdp) return null

    const lines = sdp.split('\n').map(l => l.trim())
    
    // Find "m=audio" line
    const mLine = lines.find(line => line.startsWith('m=audio'))
    if (!mLine) {
      return null
    }

    // Example: m=audio 49170 RTP/AVP 0 96 97
    const mMatch = mLine.match(/m=audio\s+(\d+)\s+RTP\/\S+\s+(.+)/)
    if (!mMatch) return null
    
    const port = parseInt(mMatch[1], 10)
    // All listed payload types (e.g. "0 96 97")
    const payloadTypesInM = mMatch[2]
      .split(' ')
      .map(num => parseInt(num, 10))
      .filter(n => !isNaN(n))

    // c=IN IP4 x.x.x.x
    let destination = '127.0.0.1'
    const cLine = lines.find(line => line.startsWith('c=IN IP4'))
    if (cLine) {
      const cMatch = cLine.match(/c=IN IP4\s+(\S+)/)
      if (cMatch) {
        destination = cMatch[1]
      }
    }

    // We need to find an a=rtpmap line that references OPUS and also
    // confirm that payload type is in the m=audio line above.
    let opusPayloadType = null
    
    lines.forEach(line => {
      // Example: a=rtpmap:96 OPUS/48000/2
      if (line.startsWith('a=rtpmap:')) {
        const rtpmapMatch = line.match(/a=rtpmap:(\d+)\s+([\w\-]+)/)
        if (!rtpmapMatch) return
        
        const pt = parseInt(rtpmapMatch[1], 10)
        const codec = rtpmapMatch[2].toUpperCase() // OPUS, PCMU, G729, etc.
        
        if (codec === 'OPUS' && payloadTypesInM.includes(pt)) {
          opusPayloadType = pt
        }
      }
    })

    if (!opusPayloadType) {
      // No OPUS offered
      return null
    }

    console.log(`SIP - Parsed SDP (OPUS found). destination=${destination}, port=${port}, opusPayload=${opusPayloadType}`)
    return { destination, port, payloadType: opusPayloadType }
  }

  _buildLocalSdp(sessionId) {
    return [
      'v=0',
      `o=- ${sessionId} ${sessionId} IN IP4 ${LOCAL_IP}`,
      's=-',
      `c=IN IP4 ${LOCAL_IP}`,
      't=0 0',
      'm=audio 8000 RTP/AVP 96',
      'a=rtpmap:96 OPUS/48000/2',
      'a=fmtp:96 useinbandfec=1;minptime=10',
      'a=ptime:20',
      'a=maxptime:150',
      'a=sendrecv',
      'm=video 0 RTP/AVP 99',
      'a=inactive',
    ].join('\r\n') + '\r\n';
  }
}

export const sip = new Sip()

