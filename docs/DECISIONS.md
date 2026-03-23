# VR Video Call Project — Decisions

---

## Session: 2026-03-21 / 2026-03-22 — Cardboard Call + VR Mesh Design & Implementation

**Context:** The user wanted to build a static webpage for peer-to-peer video
calls displayed in stereoscopic split-screen for phone VR headsets. Started with
a simple one-way "Cardboard Call" page, then evolved the concept into a
bidirectional peer mesh ("VR Mesh") with optional camera sharing, PIP views, and
configurable TURN servers. Both pages were designed, implemented, debugged on
real phones, and taken through 5 rounds of code review in a single session.

**GVP source:** Inferred inline

### Inferred Goals/Values (no GVP file)

- **G1: Fun side project** — build something entertaining for use with friends
  and cheap phone VR headsets
- **G2: Static hosting** — must work on GitHub Pages with no backend
- **V1: Simplicity** — vanilla JS, no frameworks, no build step
- **V2: Mobile-first** — primary use is phones inside VR headsets
- **V3: Portability** — anyone should be able to fork and run with their own
  config
- **P1: Ship what works** — get it working, then iterate
- **P2: Stability over features** — keep working code stable, build new features
  separately

---

### D1: Camera Source

> Whether the sender should use front, rear, or toggleable camera

- **Chosen:** User-toggleable between front and rear camera
- **Rationale:** user said, "there simply might be use-cases where front / back is more desirable"
- **Note:** User also wants to expand this to list ALL cameras (phones with 3+ cameras, USB cameras on computers). user said, "listing ALL cameras available (for phones with more than 2 back cameras or computers with USB cameras attached). maximum flexibility for configurable setups"
- **Maps to:** G1
- **Tags:** camera, UX

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Rear camera only | discussed | Default to environment-facing camera | Not discussed |
| Front camera only | discussed | Default to selfie camera | Not discussed |

---

### D2: Connection Method

> How two phones find each other for the P2P call

- **Chosen:** Room code + QR code (both options)
- **Rationale:** user said, "QR is just convenient when the room code is obtuse characters"
- **Maps to:** G2, V1
- **Tags:** connection, UX

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Room code only | discussed | Share a short code verbally | Not discussed |
| QR code only | discussed | Scan QR to connect | Not discussed |

---

### D3: Head Tracking

> Whether the receiver's VR view should incorporate gyroscope head tracking

- **Chosen:** No head tracking — flat video displayed in stereoscopic split
- **Rationale:** user agreed with claude's recommendation. Claude said, "the sender is streaming a standard camera feed, so head tracking doesn't add much. The stereoscopic split is really just for the immersive 'window into their world' feel through the Cardboard headset"
- **Maps to:** V1
- **Tags:** VR, scope

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Head tracking controls virtual camera | discussed | Receiver looks around 360 view | "this only makes sense if the sender is streaming 360 video, which standard phone cameras don't do" |
| Head tracking for minor parallax | discussed | Small adjustments based on orientation | Not discussed |

---

### D4: File Structure

> Single HTML file vs subdirectory

- **Chosen:** Subdirectory (`site/cardboard-call/`)
- **Rationale:** user chose option B. Claude noted, "Given the scope (PeerJS library, camera handling, QR generation, stereoscopic rendering), it'll be a decent amount of code"
- **Maps to:** V1
- **Tags:** architecture

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Single HTML file | discussed | Everything inline like braille.html | Not discussed |

---

### D5: VR Mesh — Separate Page vs Replace Cardboard Call

> Whether the mesh rework should replace cardboard-call or be a new page

- **Chosen:** New separate page (`site/vr-mesh/`), replace later
- **Rationale:** user said, "B for now since the cardboard call is stable. once this is stable, we can delete the cardboard call"
- **Maps to:** P1, P2
- **Tags:** architecture, migration

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Same directory, shared files | discussed | Add mesh.html sharing CSS/JS | Not discussed |
| Replace cardboard-call entirely | discussed | Mesh is a superset of the simple version | user said, "B for now since the cardboard call is stable" |

---

### D6: VR Mesh — Page Name

> What to call the new mesh video page

- **Chosen:** "VR Mesh" at `site/vr-mesh/`
- **Rationale:** user said, "vr mesh :)"
- **Maps to:** G1
- **Tags:** naming

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| AR Team Call | discussed | ar-team-call | Not discussed |
| Cardboard Mesh | discussed | cardboard-mesh | user said, "neither of us is actually using Google Cardboard :p" |
| Phone VR Mesh | discussed | phone-vr | Not discussed |
| VR Call | discussed | vr-call | Not discussed |

---

### D7: VR Mesh — Peer Roles

> Whether room creator has special host powers or all peers are equal

- **Chosen:** Equal peers — host role is only for discovery, no special permissions
- **Rationale:** user chose option A ("Equal peers"). Claude noted, "simpler, and fits the mesh philosophy. PeerJS handles this naturally since each peer connects to each other peer independently"
- **Maps to:** V1
- **Tags:** architecture, networking

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Host model | discussed | Room dies when creator leaves | Not discussed |

---

### D8: VR Mesh — Stream Selection UI

> How users pick which stream to watch in VR

- **Chosen:** Setup screen before entering VR — pick streams in lobby, enter VR with selections
- **Rationale:** user chose option A. Claude said, "fiddling with dropdowns while your phone is in a headset is miserable"
- **Maps to:** V2
- **Tags:** UX, VR

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| In-VR overlay | discussed | Stream selection as overlay inside stereo view | "fiddling with dropdowns while your phone is in a headset is miserable" |

---

### D9: VR Mesh — Camera Sharing

> Whether cameras auto-activate on join

- **Chosen:** Opt-in — join without camera, toggle "Share Camera" when ready
- **Rationale:** user chose option B. Claude noted, "The laptop-on-table use case only needs one device sharing. And it avoids surprise camera permission prompts"
- **Maps to:** V1, G1
- **Tags:** camera, UX

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Auto-share on join | discussed | Camera activates automatically | "avoids surprise camera permission prompts on devices that are only there to watch" |
| Ask on join | discussed | Prompt yes/no for camera | Not discussed |

---

### D10: VR Mesh — PIP Position

> Where the picture-in-picture overlay appears in VR

- **Chosen:** User-choosable corner (TL, TR, BL, BR)
- **Rationale:** user chose option B. User said, "different scenes might have different 'dead' areas that are more fitting for a PIP"
- **Maps to:** V2
- **Tags:** VR, UX

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Fixed bottom-right | discussed | Standard PIP convention | user said, "different scenes might have different 'dead' areas that are more fitting for a PIP" |
| Fixed bottom-center | discussed | Split between both eyes | Not discussed |

---

### D11: VR Mesh — Peer Names

> How peers are identified in the room

- **Chosen:** Auto-generated fun name as placeholder + user-entered name with localStorage persistence
- **Rationale:** user said, "text input for the username on the join screen, and it reads from localStorage to see if a name is saved. if not, it autogenerates a fun name as a placeholder (not actual input value set). if the user leaves the name empty, that placeholder gets used"
- **Maps to:** V2, G1
- **Tags:** UX, identity

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Auto-generated only | discussed | Random names like "Blue Fox" | Not discussed |
| User-entered only | discussed | Text input required | Not discussed |
| Just numbers | discussed | "Peer 1", "Peer 2" | Not discussed |

---

### D12: VR Mesh — Room Creation

> How rooms are created and joined

- **Chosen:** Single input field that acts as both create and join — type a custom room name or leave empty for auto-generated code. Combo input with dropdown arrow for room history from localStorage.
- **Rationale:** user said, "i'd have an input box with a little arrow next to it so that it also acts as both an input box and a drop down? and a placeholder that similarly includes a randomly generated code that gets used if left blank"
- **Maps to:** V1, V2
- **Tags:** UX, rooms

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Separate Create/Join buttons | discussed | Two distinct actions | User preferred unified input — "No Create vs Join distinction" was the result |

---

### D13: VR Mesh — Configuration

> How ICE/TURN servers are configured

- **Chosen:** `config.json` file loaded at startup, merged with defaults. Gitignored with `config.example.json` committed.
- **Rationale:** user asked, "can we set that up via a JSON config? that way we could separate this out at some point to its own repo and easily allow people to configure their own TURN server"
- **Maps to:** V3
- **Tags:** configuration, portability

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Hardcoded in JS | discussed | Like cardboard-call does | user wanted portability for potential repo separation |

---

### D14: Self-Hosted TURN Server

> Whether to use a free third-party TURN service or self-host

- **Chosen:** Self-hosted coturn on shitchell.com (155.138.200.212:3478)
- **Rationale:** user said, "can we add a TURN server to my shitchell server?" after free Open Relay credentials were found to be dead
- **Maps to:** G2, P1
- **Tags:** infrastructure, networking

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Open Relay (metered.ca) free tier | discussed | Free TURN with static credentials | Credentials were dead/deprecated |
| ExpressTURN free tier | discussed | Free TURN, requires signup | Not discussed beyond initial search |
| No TURN server | discussed | Accept NAT traversal failures | Phone-to-phone connections failed without TURN |

---

### D15: VR Controls Outside #vr-view

> Where VR overlay controls (exit, scale slider) live in the DOM

- **Chosen:** Controls as a sibling `<div>` outside `#vr-view`, with `position: fixed; z-index: 2147483647`
- **Rationale:** Discovered through debugging that elements inside `#vr-view` are invisible when `documentElement` is the fullscreen element (mobile fullscreen stacking context). User confirmed after testing, "it works!"
- **Maps to:** V2
- **Tags:** mobile, fullscreen, CSS

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Controls inside #vr-view | discussed | Original implementation | Invisible on mobile fullscreen |
| Fullscreen #vr-view instead of documentElement | discussed | Would keep controls in same stacking context | Broke video rendering — black screen |
| Transparent tap layer | discussed | Overlay div to capture taps | Blocked exit zone and scale controls |
| Tap directly on video elements | discussed | click + touchend on videos | Unreliable on mobile, touchstart broke video playback |
| Gear button + visible controls | discussed | Always-visible buttons | User said, "changing it so that the X and slider show up on tap, not all the time" |

---

### D16: VR Scale Controls — Tap to Show

> How VR controls (exit X, scale slider) are revealed

- **Chosen:** Tap anywhere to show controls for 4 seconds, then auto-hide
- **Rationale:** user said, "the X and slider show up on tap, not all the time :p when you enter VR mode, all you see is the main view (and optional PIP). when you tap, it shows the X to exit and the blue slider at the bottom (no gear icon)"
- **Maps to:** V2
- **Tags:** VR, UX

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Always visible | discussed | Exit and scale always shown | user said, "show up on tap, not all the time" |
| Gear button toggle | discussed | Visible gear icon to toggle scale | user said, "no gear icon" |

---

### D17: Centralized Peer Management Pattern

> How PeerJS peer instances are created and torn down

- **Chosen:** `replacePeer()` helper + `handleIncomingConnection()` — all peer
  creation goes through one function that destroys old peers and registers common
  listeners
- **Rationale:** Code review round 3 identified that "the fundamental problem is
  that `myPeer` is reassigned in multiple places (`joinRoom`, `becomeHost`,
  `attemptHostHandoff` x2) without a centralized 'tear down old peer, set up new
  peer' function." This eliminated 5 issues in one refactor.
- **Maps to:** V1
- **Tags:** architecture, refactor

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Per-function peer setup | discussed | Each code path manages its own peer | Led to leaked instances, missing handlers, duplicate listeners |

---

### D18: Debug Infrastructure

> How debugging works on mobile devices

- **Chosen:** `config.debug` flag enables `window.__logs` capture (capped at 1000)
  and a red "DBG" button with Refresh/Copy for on-device log inspection
- **Rationale:** user said, "in the config, we'll have a debug flag that adds the DBG button in the corner to copy/paste debug information"
- **Maps to:** V2, P1
- **Tags:** debugging, mobile

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| Always-on logging | claude considered | Log without config flag | Overhead in production |
| Remote devtools only | claude considered | Use Chrome remote debugging | Not practical when phone is in a headset |

---

### D19: Wake Lock API

> Preventing screen dimming during VR headset use

- **Chosen:** Acquire Screen Wake Lock on entering VR, release on exit
- **Rationale:** Code review round 4 suggested it. Reviewer said, "For a VR app meant to be used in a phone headset, the screen will likely dim or lock after the system timeout"
- **Maps to:** V2, G1
- **Tags:** VR, mobile

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| No wake lock | discussed | Let screen dim naturally | Screen dims while phone is in headset — bad UX |

---

### D20: URL Tracking for Room Persistence

> Whether the URL updates when joining a room

- **Chosen:** `history.replaceState` sets `?room=XXXX` on join, auto-joins on
  page load if param present, clears on leave
- **Rationale:** user said, "can we have some flavor of URL tracking so that when i join a room it updates the URL? so when i refresh on the room config page, it keeps me in that room?"
- **Maps to:** V2
- **Tags:** UX, navigation

**Considered:**

| Alternative | Source | Description | Why not? |
|---|---|---|---|
| No URL tracking | discussed | Original implementation — refresh loses room | user wanted refresh persistence |

---

### Future Enhancements Noted

- **D1 expansion:** List all available cameras (not just front/rear toggle) for
  phones with 3+ cameras and computers with USB cameras. User said, "maximum
  flexibility for configurable setups"
