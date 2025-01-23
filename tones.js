import { createSocket } from "dgram";
import { RtpPacket } from 'werift';
import { FfmpegProcess } from '@homebridge/camera-utils';

class Tones {
  constructor() {
    this.sip = null;
    this.ring = null;
    this.isSipReady = false;
    this.isSipRinging = false;
    this.isRingReady = false;
    this.udp = createSocket('udp4');
    this.ffmpegProcess = null;

    this.udp.bind(0, () => {
      console.log(`TONES - RTP socket bound to port ${this.getPort()}`);
    });

    this.udp.on('message', (message, rinfo) => {
      if (this.isSipReady || this.isRingReady) {
        const rtpPacket = RtpPacket.deSerialize(message);
        if (this.isSipReady) {
          this.sip.sendAudioPacket(rtpPacket, true);
        }
        if (this.isRingReady && this.isSipRinging) {
          this.ring.sendAudioPacket(rtpPacket, true);
        }
      }
    });
  }

  manageFfmpegProcess() {
    if (this.isBothReady()) {
      // Kill the process if it's running and both are ready
      if (this.ffmpegProcess) {
        console.log('TONES - Killing FFmpeg process (both SIP and RING are ready)');
        this.ffmpegProcess.stop();
        this.ffmpegProcess = null;
      }
    } else if (!this.ffmpegProcess) {
      // Spawn the process if not already running and at least one is ready
      const port = this.getPort();
      const ffmpegArgs = [
        '-hide_banner',
        '-protocol_whitelist', 'file,udp,rtp,crypto',
        '-re',
        '-i', 'ringback.opus',
        '-acodec', 'libopus',
        '-ac', '2',
        '-ar', '48k',
        '-flags', '+global_header',
        '-f', 'rtp',
        `rtp://127.0.0.1:${port}`,
      ];

      console.log(`TONES - Spawning FFmpeg process with args: ${ffmpegArgs.join(' ')}`);
      this.ffmpegProcess = new FfmpegProcess({
        ffmpegArgs,
        exitCallback: () => {
          console.log('TONES - FFmpeg process exited');
          this.ffmpegProcess = null; // Reset the process reference
        }
      });
    }
  }

  initialize(sip, ring) {
    this.sip = sip;
    this.ring = ring;
  }

  getPort() {
    const address = this.udp.address();
    return address.port;
  }

  sipReady() {
    console.log('TONES - Notified that SIP is ready');
    this.isSipReady = true;
    this.manageFfmpegProcess();
  }

  sipRinging() {
    console.log('TONES - Notified that SIP is ringing');
    this.isSipRinging = true;
  }
  
  ringReady() {
    console.log('TONES - Notified that RING is ready');
    this.isRingReady = true;
    this.manageFfmpegProcess();
  }

  isBothReady() {
    return this.isSipReady && this.isRingReady;
  }

  cleanup() {
    console.log('TONES - Cleaning up resources');
    if (this.ffmpegProcess) {
      console.log('TONES - Stopping FFmpeg process');
      this.ffmpegProcess.stop();
      this.ffmpegProcess = null;
    }
    if (this.udp) {
      console.log('TONES - Closing UDP socket');
      this.udp.close();
      this.udp = null;
    }
    this.isSipReady = false;
    this.isRingReady = false;
  }
}

// Create a singleton instance
export const tones = new Tones();

