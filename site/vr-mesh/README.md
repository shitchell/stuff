# VR Mesh

VR Mesh is a peer-to-peer video mesh for VR headsets (Google Cardboard, etc.). Multiple people join a room, optionally share their phone cameras, and each person independently chooses which stream to display as a stereoscopic VR view with an optional picture-in-picture overlay. No backend or app install required -- it runs entirely in the browser using WebRTC.

**Live site:** [shitchell.github.io/stuff/site/vr-mesh/](https://shitchell.github.io/stuff/site/vr-mesh/)

## How to Use

### 1. Join a Room

Open the page and enter your name (or accept the auto-generated one like "Blue Fox"). Type a room name or leave it blank for a random code. Tap **Join**.

There is no distinction between creating and joining a room. If nobody else is in the room, you are the first one there. If someone is already in it, you join them.

### 2. Share Your Camera

In the lobby, tap **Share Camera** to start broadcasting your phone's camera. Use the **Flip** button to switch between front and rear cameras. Camera sharing is optional -- you can join a room just to watch.

### 3. Set Up Your View

Under **View Setup**, pick a **Main View** from the dropdown (any peer currently sharing their camera, including yourself). Optionally pick a **PIP View** for a small picture-in-picture overlay and choose which corner it appears in.

### 4. Enter VR

Tap **Enter VR**. The page goes fullscreen in landscape mode and displays the selected stream duplicated side-by-side for stereoscopic viewing. Slide your phone into a VR headset.

- **Tap the screen** to reveal the scale slider and exit button.
- **Scale slider** adjusts the video size to fit your headset's lenses.
- **Exit** (X button at top center) returns you to the lobby.

### 5. Invite Others

A QR code is displayed in the lobby. Others can scan it to jump directly into your room.

## Room Names

You can use any text as a room name -- short codes like "ABCD-1234", words like "the-bros", or anything else. Room names are case-sensitive. If you leave the field blank, a random code is generated.

Previously joined rooms are saved and accessible via the dropdown arrow next to the room input.

## What You Need

- **Phone + VR headset**: For the full stereoscopic experience (Google Cardboard, Merge VR, etc.)
- **Just a browser**: You can join, share your camera, and watch streams without a headset -- the VR view works on any screen

## Configuration

VR Mesh loads settings from `config.json` at startup. Copy the example and fill in your TURN server details:

```
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "debug": false,
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": "turn:YOUR_TURN_SERVER:3478",
      "username": "YOUR_USERNAME",
      "credential": "YOUR_CREDENTIAL"
    }
  ]
}
```

- **`debug`**: Set to `true` to enable the on-screen debug log panel (tap the red "DBG" button).
- **`iceServers`**: STUN servers work for most connections. A TURN server is needed when peers are behind restrictive NATs (common on mobile networks).

If `config.json` is missing or fails to load, the app falls back to Google's public STUN server only.

`config.json` is gitignored. `config.example.json` is committed as a template.
