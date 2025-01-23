export default class RtpSequencer {
  constructor() {
    this.ignoreTones = false          // Once speech starts, ignore future tone packets
    this.highestLocalSeq = -1         // Tracks highest local sequence number so far
    this.speechOffset = null          // We set this when the first speech packet arrives
  }

  /**
   * Process a single RTP packet and decide:
   *   - Should we drop it? (return false)
   *   - If not, update its sequenceNumber, return true to indicate it's ok to forward.
   *
   * @param {RtpPacket} rtp        - RTP packet (with header.sequenceNumber, etc.)
   * @param {boolean}   isTone     - Whether this packet is tone or speech
   *
   * @returns {boolean}            - true if the packet should be forwarded, false if dropped
   */
  process(rtp, isTone) {
    // If we've already started speech, ignore new tone packets
    if (isTone && this.ignoreTones) {
      return false
    }

    // If this is the very first speech packet, switch to ignoring tones
    // and compute the offset so speech won't go backward relative to tones
    if (!isTone && !this.ignoreTones) {
      this.ignoreTones = true
      if (this.highestLocalSeq >= 0) {
        console.log('RTP SEQUENCER: starting speech');
      }
      const originalSeq = rtp.header.sequenceNumber & 0xffff
      // The first speech packet's local seq = highestLocalSeq + 1
      this.speechOffset = ((this.highestLocalSeq + 1) - originalSeq) & 0xffff
    }

    // Map the sequence number
    const originalSeq = rtp.header.sequenceNumber & 0xffff
    let localSeq

    if (isTone) {
      // Tones use their native sequence
      localSeq = originalSeq
    } else {
      // For speech, apply offset if set, else 0
      const offset = this.speechOffset ?? 0
      localSeq = (originalSeq + offset) & 0xffff
    }

    // Update highestLocalSeq if this is ahead
    if (localSeq > this.highestLocalSeq) {
      this.highestLocalSeq = localSeq
    }

    // Assign the mapped sequence
    rtp.header.sequenceNumber = localSeq

    // Return true => caller should forward the packet
    return true
  }
}

