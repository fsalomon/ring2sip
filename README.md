# Ring2SIP: Forward Ring Doorbell Calls to SIP and Vice Versa

This project allows you to forward Ring Doorbell calls to SIP and vice versa. It has been tested with the [Ring Video Doorbell 4](https://ring.com/support/products/doorbells/video-doorbell-4) and Asterisk PBX and chan_pjsip.

## Features

- **Ring-to-SIP**: Forward incoming Ring Doorbell calls (button press) to a specified SIP extension or ring group.
- **SIP-to-Ring**: Your SIP extensions can initiate calls to the Ring Doorbell.

# Why?
The Ring App works fine for families, but not for businesses: 
- Off-duty staff shouldn't be bothered with Ring Alerts.
- My PBX has so many features that can be useful for a Doorbell as well: routing/hunt groups, time-based announcements and more.
- Ring doesn't support SSO. I don't want to manually maintain a walled-off user database.
- Not another App at the workplace!

## Prerequisites

1. **Node**: Requires a machine with Node.js and FFmpeg installed. Tested with Debian Linux.
2. **Networking** The machine running this code and your PBX must be located on the same private network. Your Ring Doorbell can be on a completely different network.
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
- Optionally, set `NOTIFY_URL` if you want a URL to be called for every button press on your doorbell.

### Testing
- Run the code: `node index.js`. Uncomment `doConnect()` in `index.js` to establish a connection without a trigger.
- Test Ring originated call: If you don't get the `buttonPressed` event, your refresh token might be broken. Check `DEBUG=ring node index.js` and read the [Wiki Article](https://github.com/dgreif/ring/wiki/Refresh-Tokens).
- Test SIP originated call: Call your `SIP_USER` from any extension. If you don't get the `inboundCall` event, check if your `SIP_USER` is registering correctly.

### Running as a Daemon
Use `supervisord` or a similar tool to keep the process running. Note: the process will exit after each call because I'm lazy. If you want to map multiple cameras you will have to run multiple processes.

---

## Docker

Setup:
- `git clone https://github.com/fsalomon/ring2sip && cd ring2sip`
- `docker build -t ring2sip .`
- `docker run --network host --name ring2sip --restart=always -d ring2sip`
- `docker exec -it ring2sip npx -p ring-client-api ring-auth-cli`
- `docker cp .env ring2sip:/app/.env`
- `docker restart ring2sip`

Useful commands:
- `docker logs ring2sip`
- `docker exec ring2sip supervisorctl status`
- `docker exec -it ring2sip tail -n 100 -f /var/log/nodeapp.log`

---

## Limitations

- **No Video**: Currently, only audio is supported as my SIP phones don't not support video. Adding video support should be straightforward.
- **No PCMU**: My implementation only supports Opus codec since that's what my Ring Video Doorbell 4 uses. Some (older?) Ring Doorbells seem to use PCMU. If you want support for that, please DIY.
- **No NAT**: This tool must be running on the same private network (or the same machine) as your PBX. VPN works. If you need NAT support, please DIY.
- **No Cloud PBX**: See "No NAT". If you can VPN into your Cloud PBX, it should be okay but see "No Security".
- **No Security**: Server `INVITE`s are not authenticated. *Do not expose this tool to the internet* or you will get ghost calls or worse. You have been warned!
- **No Session Timer**: `Session-Expires` headers are ignored. Re-`INVITE` is not implemented. Most PBX use 30 mins, that should be enough for a doorbell :-)

---

## Final notes
This code is provided "as-is" without warranty or support. Thanks to [dgreif/ring](https://github.com/dgreif/ring) which this is based on.
