# Eloise's Colouring

A colouring app for a three-year-old, made to run on a phone. It's a single self-contained `index.html` with no installs and no internet needed after it loads (only the Fredoka font is fetched from Google Fonts).

This is version 3.0, a rebuild of the earlier "Eloise's App". The 34 original pictures, the magic paints and the stickers carry over. Ten new pictures are added: Flower, Sun, Boat, Hot air balloon, plus a Kiwi, Sheep, Tūī, Beach, Pavlova and Christmas tree.

## What's new for Eloise
- **Home screen of big picture cards**, sorted into Animals, Party, Go!, Outside and Mine. There's also a **Surprise!** card (a new random picture each time) and a **blank page** for free drawing.
- **Keep colouring** card that reopens her last unfinished picture with one tap.
- **It can talk and play sounds (off until you turn them on).** Each colour, tool, sticker and picture is said out loud, so she doesn't need to read. Every paint pot plays its own music note, and you'll hear pops, boings and a fanfare.
- **Stay inside the lines.** The crayon and glitter wand only paint the space where the stroke starts.
- **Five chunky tools:** paint bucket, crayon, magic glitter wand, stickers and eraser, plus thin, medium and fat sizes.
- **Rainbow progress bar** that fills up as she colours each space.
- **Helping hand.** After a quiet moment, a pointing hand shows a space still waiting for colour.
- **Big celebration.** Confetti, balloons and fireworks, the picture wiggles, a voice says "Well done, Eloise!", she earns a gold star, and a big green arrow takes her to the next picture.
- **Pictures come to life.** When she finishes, the picture moves in its own way and makes its own sound: the cat hops and says "Meow!" with floating hearts, the car drives off and comes back puffing smoke, the rocket blasts off, and the fish swims with bubbles. Tapping the twirling star on the progress bar plays it again.
- Clearing the picture needs a press-and-hold, and Undo can bring it back.

## For grown-ups (press and hold the gear for 1.5 seconds)
- Change the child's name
- Turn sounds, talking, stay-inside-the-lines and the helping hand on or off. **Sound and talking start off** until you turn them on.
- Make a colouring page from a photo of family, a pet or a toy. It appears in Mine and as the "Keep colouring" picture.
- Set a time limit (10 to 45 minutes). One minute before the end she's told "One more minute". At the end the app says goodbye and shows a sleepy moon screen until a grown-up starts a new turn. A new turn also starts by itself after a 30-minute break.
- Add a special colour of your own
- Save the current picture to the phone as a PNG
- Full screen (where the browser allows it)
- Delete saved pictures

Pictures and stars are kept in this browser's local storage on this phone.

## Installing it on a phone like a real app
This folder is a complete installable web app. It has an app icon and a home-screen name, opens full screen with no browser bars, and keeps working with no internet after the first visit.

1. Publish it with GitHub Pages: in the repository go to **Settings → Pages**, choose **Deploy from a branch**, pick the branch that has this folder, and use the `/ (root)` folder. After a minute it's live at `https://brendono-svg.github.io/try-again/eloise-colouring/`.
2. Open that address on the phone.
   - **Android (Chrome):** menu ⋮ → **Install app** (or **Add to Home screen**).
   - **iPhone (Safari):** Share → **Add to Home Screen**.
3. Open it from the new **Colouring** icon.

Updates you publish are picked up the next time the app opens with internet.

## Files
- `index.html`: the whole app
- `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png`, `favicon-48.png`, `icon.svg`: app name and icons
- `sw.js`: offline support
