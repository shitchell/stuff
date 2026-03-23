# Cardboard Call

Cardboard Call is a peer-to-peer video call designed for Google Cardboard. One phone sends its camera feed, and the other displays it as a side-by-side stereoscopic view for VR viewing. No app install required -- it runs entirely in the browser.

**Live site:** [shitchell.github.io/stuff/site/cardboard-call/](https://shitchell.github.io/stuff/site/cardboard-call/)

**Note:** [VR Mesh](../vr-mesh/) is the successor to Cardboard Call with multi-peer support, optional camera sharing, PIP overlays, and configurable TURN servers.

## How to Use

1. Open the page on the **sender's** phone and tap **Send Video**. The camera activates and a room code + QR code appear.
2. On the **receiver's** phone, either:
   - Scan the QR code with your camera app (opens the page with the room pre-filled), or
   - Open the page, tap **Receive Video**, and type in the room code.
3. The receiver's screen switches to a fullscreen stereoscopic view. Slide the phone into a Cardboard headset.
4. Tap the screen to reveal the **scale slider**, which adjusts the video size to fit your headset's lenses. Controls auto-hide after 4 seconds.

## Multiple Receivers

Multiple receivers can connect to the same sender simultaneously. The sender's status shows the receiver count (e.g., "Connected! (3 receivers)").

## Camera Flip

The sender can toggle between front and rear cameras using the **Flip Camera** button. The button is hidden if the device only has one camera.

## Configuration

The TURN server is hardcoded in `app.js`. For personal use this is fine. If you fork this project and want to use your own TURN server, edit the `ICE_SERVERS` array near the top of `app.js`.

## Technical Notes

- Uses PeerJS for WebRTC signaling via their free cloud server.
- Room codes are formatted as `ABCD-1234` (letters exclude I, L, O to avoid ambiguity).
- The receiver creates a 1x1 canvas stream as a dummy to satisfy PeerJS's call API, since it only needs to receive video, not send it.
- Fullscreen and landscape orientation lock are requested automatically. Both fail silently if unsupported.
- A debug panel is always available via the red "DBG" button in the top-right corner.
