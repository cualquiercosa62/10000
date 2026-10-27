# Diez Mil (10.000) — online

Play 10.000 with five dice: 2 to 8 players, friends or computer players, each on their own phone or computer.
No accounts, no database.

## Try it on your computer

1. Install Node.js (version 18 or newer) from https://nodejs.org
2. Open a terminal in this folder and run: `npm start`
3. Open http://localhost:3000

(Only people on your own Wi-Fi can reach this. To play with friends far away, put it online below.)

## Put it online for free (Render, about 10 minutes)

1. Make a free account at https://github.com
2. Click **+ → New repository**, name it `diezmil`, keep it Public, click **Create repository**.
3. On the next screen click **uploading an existing file**, drag in everything from this folder
   (`server.js`, `bot.js`, `package.json`, `README.md` and the `public` folder with `index.html` and `rules.js`), then click **Commit changes**.
4. Make a free account at https://render.com and sign in with GitHub.
5. Click **New → Web Service**, pick your `diezmil` repository.
6. Settings: Runtime **Node**, Build command `npm install`, Start command `npm start`, Instance type **Free**.
   Click **Create Web Service**.
7. After a minute or two Render shows a link like `https://diezmil-xxxx.onrender.com`. Send it to your friends.

### How to play together
- One person types their name, picks how the game ends, and clicks **Create table**. A 4-letter code appears.
- Or press **Play against the computer** to start straight away on your own.
- Everyone else opens the same link, types their name, and picks that table (or types the code).
- The host can add computer players, then clicks **Start the game**.

### Good to know
- On Render's free plan the site falls asleep after 15 minutes with no visitors. The first visit after that takes
  about 30 seconds to wake up. Tables in progress are lost when it sleeps or restarts, so finish a game in one sitting.
- Tables with no activity for 12 hours are removed.
