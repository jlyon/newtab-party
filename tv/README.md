# newtab.party for Google TV

An Android TV / Google TV app that plays the daily game at https://newtab.party, built for a TV remote, including Bluetooth remotes.

It is a full-screen WebView plus a remote-control layer in `app/src/main/java/party/newtab/tv/MainActivity.java`. No AndroidX or Kotlin, so the only build inputs are a JDK, the Android SDK and Gradle.

## Remote controls

| Button | Remote mode (action games) | Pointer mode (card, board and tap games) |
|---|---|---|
| Arrows | Arrow keys in the game | Move the on-screen cursor (hold to speed up) |
| OK | Enter + Space (start, then the action button; hold to charge) | Tap; hold to drag or long-press |
| Back | Close an open panel, go back, press twice to exit | Same |
| Hold Back | Switch modes | Switch modes |
| Menu, Play/Pause, Info | Switch modes | Switch modes |

The app picks the mode from the game's `controls` text in `games.json`: games that mention arrows, WASD or the D-pad get remote mode, everything else gets the pointer. A manual switch is remembered for that game.

Bluetooth remotes work if they send standard keys: arrows, OK or Enter, and Back or Escape. Gamepads work too (A is OK, B is Back, Y switches modes). Air-mouse remotes drive the page directly, and the virtual cursor hides while they move.

Pair a remote on the TV under Settings, then Remotes & Accessories, then Pair remote or accessory.

## Build

Needs JDK 17 or newer and the Android SDK with platform 36, build-tools and platform-tools. The Gradle wrapper is checked in, so Gradle itself downloads on the first run.

```bash
cd tv
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties   # first time only
./gradlew assembleDebug    # writes app/build/outputs/apk/debug/app-debug.apk
```

## Install on a Google TV

1. On the TV, open Settings, then System, then About, and click Android TV OS build seven times to unlock developer options.
2. In Settings, then System, then Developer options, turn on USB debugging (it also enables network debugging).
3. Find the TV's IP under Settings, then Network & Internet.

```bash
adb connect <tv-ip>:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The app shows up in the TV's Apps row as newtab.party.
