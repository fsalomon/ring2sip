# Ring2SIP: Forward Ring Doorbell Calls to SIP and Vice Versa

This project allows you to forward Ring Doorbell calls to a SIP extension and vice versa. It has been tested with the [Ring Video Doorbell 4](https://ring.com/support/products/doorbells/video-doorbell-4) and Asterisk PBX systems.

## Features

- **Ring-to-SIP**: Forward incoming Ring Doorbell calls (button press) to a specified SIP extension or ring group.
- **SIP-to-Ring**: Your SIP extensions can initiate calls to the Ring Doorbell

## Prerequisites

1. **Linux System**: Requires a Linux machine with Node.js and FFmpeg installed
2. **Networking** The machine running this code and your PBX must be located on the same private network.
2. **OPUS Codec**: Ensure your PBX supports the Opus for audio. Ensure your Ring camera is using Opus.

## Setup

- Clone this repository and install dependencies: `git clone <repo-url> && cd <repo-folder> && npm install`.
- Copy the example environment file and configure it: `cp .env.example .env`.

### Setting up `.env`
- Obtain your `REFRESH_TOKEN` using [ring-auth-cli](https://github.com/dgreif/ring/wiki/Refresh-Tokens).
- Create a new extension on your PBX and set these variables:
  - `SIP_DOMAIN`, `SIP_PORT`, `SIP_USER`, `SIP_PASS`.
- Choose an extension or ring group on your PBX to forward Ring calls to and set it as `SIP_DEST`.
- Specify your `CAMERA_NAME`. It must be unique across locations (or you will need to modify my code).
- Configure your local network settings:
  - `LOCAL_IP` (must be static, or you will need to modify my code).
  - `LOCAL_SIP_PORT`, `LOCAL_RTP_PORT` (use any free ports).

### Testing
- Run the code: `node index.js`. Uncomment `doConnect()` in `index.js` to establish a connection without a trigger.
- Test Ring originated call. If you don't get the button press event, you refresh token might be broken. Check `DEBUG=ring node index.js`
- Test SIP originated call. Call your `SIP_USER` from any extension.

### Running as a Daemon
Use `supervisord` or a similar tool to keep the process running. Note: the process will exit after each call because I'm lazy.

---

## Limitations

- **No Video**: Currently, only audio is supported as my SIP phones don't not support video. Adding video support should be straightforward.
- **No PCMA**: The implementation only supports Opus codec since that's what my Ring Video Doorbell 4 uses.
- **No NAT**: This tool must be running on the same private network (or the same machine) as your PBX. VPN works.
- **No Cloud PBX**: See "No NAT"
- **No Security**: Do not expose this tool to the internet or you will get ghost calls or worse. You have been warned!

---

## Final notes
This code is provided "as-is" without warranty or support. Thanks to [dgreif/ring](https://github.com/dgreif/ring) which this is based on.
