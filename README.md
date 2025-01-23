# Ring2SIP: Forward Ring Doorbell Calls to SIP and Vice Versa

This project allows you to forward Ring Doorbell calls to SIP and vice versa. It has been tested with the [Ring Video Doorbell 4](https://ring.com/support/products/doorbells/video-doorbell-4) and Asterisk PBX and chan_pjsip.

# Why?
The Ring App works fine for families, but not for businesses: 
- Ring doesn't support SSO. I don't want to manually maintain a walled-of user database.
- Off-duty staff shouldn't be bothered with Ring Alerts.
- My PBX has so many features that can be useful for a Doorbell as well: routing/hunt groups, time-based announcements and more.

## Features

- **Ring-to-SIP**: Forward incoming Ring Doorbell calls (button press) to a specified SIP extension or ring group.
- **SIP-to-Ring**: Your SIP extensions can initiate calls to the Ring Doorbell.

## Prerequisites

1. **Node**: Requires a machine with Node.js and FFmpeg installed. Tested with Debian Linux.
2. **Networking** The machine running this code and your PBX must be located on the same private network.
2. **OPUS Codec**: Ensure your PBX supports Opus audio. Ensure your Ring camera is using Opus.

## Setup

- Clone this repository and install dependencies: `git clone https://github.com/fsalomon/ring2sip && cd ring2sip && npm install`.
- Copy the example environment file and edit it: `cp .env.example .env`.

### Setting up `.env`
- Obtain your `REFRESH_TOKEN` using [ring-auth-cli](https://github.com/dgreif/ring/wiki/Refresh-Tokens).
- Create a new extension on your PBX and set these variables:
  - `SIP_DOMAIN` the IP address of your PBX
  - `SIP_PORT` the SIP port of your PBX (probably 5060)
  - `SIP_USER` your new user, probably the extension number
  - `SIP_PASS` a very secure password
- Choose an extension or ring group on your PBX to forward Ring calls to and set it as `SIP_DEST`.
- Specify your `CAMERA_NAME`. It must be unique across locations (or you will need to modify my code).
- Configure your local machine settings:
  - `LOCAL_IP` (must be static, or you will need to modify my code).
  - `LOCAL_SIP_PORT`, `LOCAL_RTP_PORT` (use any free ports).

### Testing
- Run the code: `node index.js`. Uncomment `doConnect()` in `index.js` to establish a connection without a trigger.
- Test Ring originated call: If you don't get the `buttonPressed` event, your refresh token might be broken. Check `DEBUG=ring node index.js` and read the [Wiki Article](https://github.com/dgreif/ring/wiki/Refresh-Tokens).
- Test SIP originated call: Call your `SIP_USER` from any extension. If you don't get the `inboundCall` event, check if your `SIP_USER` is registering correctly.

### Running as a Daemon
Use `supervisord` or a similar tool to keep the process running. Note: the process will exit after each call because I'm lazy. If you want to map multiple cameras you will have to run multiple processes.

---

## Limitations

- **No Video**: Currently, only audio is supported as my SIP phones don't not support video. Adding video support should be straightforward.
- **No PCMA**: The implementation only supports Opus codec since that's what my Ring Video Doorbell 4 uses.
- **No NAT**: This tool must be running on the same private network (or the same machine) as your PBX. VPN works.
- **No Cloud PBX**: See "No NAT"
- **No Security**: Do not expose this tool to the internet or you will get ghost calls or worse. You have been warned!
- **No Session Timer**: Most PBX use 30 mins, that should be enough for a doorbell :-)

---

## Final notes
This code is provided "as-is" without warranty or support. Thanks to [dgreif/ring](https://github.com/dgreif/ring) which this is based on.
