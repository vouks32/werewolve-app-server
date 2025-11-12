Perfect 👌🏽 You basically want a **system design / code architecture** for your Werewolf WhatsApp bot using **Baileys**, not the actual code. Let’s break this down into the main components and responsibilities so you can implement step by step.

---

# 🏗️ Structure of the Node.js Werewolf Game Bot (Baileys)

## 1. **Entry Point**

* **`index.js`** (or `bot.js`)

  * Initializes the Baileys socket.
  * Handles authentication (QR code or saved session).
  * Listens for incoming messages (`sock.ev.on("messages.upsert", ...)`).
  * Routes commands (`!startgame`, `!play`, etc.) to a **Game Manager**.

---

## 2. **Core Modules**

### (a) **Game Manager (`gameManager.js`)**

* Responsible for **one game instance per group**.
* Stores:

  * `players`: array of `{ jid, isPlaying, isDead, role }`.
  * `state`: `"WAITING_PLAYERS" | "ASSIGNING_ROLES" | "NIGHT" | "DAY" | "ENDED"`.
  * `timers`: for waiting (5 mins to join, 5 mins for night actions, etc.).
* Exposes functions:

  * `startGame(groupId)`
  * `joinGame(groupId, playerJid)`
  * `assignRoles(groupId)`
  * `startNightPhase(groupId)`
  * `startDayPhase(groupId)`
  * `endGame(groupId, result)`
* Maintains game data in **memory** + synced to a **JSON file** (for persistence if bot restarts).

---

### (b) **Role Handler (`roles.js`)**

* Defines all roles and their night/day actions:

  ```js
  {
    WEREWOLF: { team: "WOLF", nightAction: selectVictim },
    SEER: { team: "VILLAGER", nightAction: inspectPlayer },
    DOCTOR: { team: "VILLAGER", nightAction: protectPlayer },
    VILLAGER: { team: "VILLAGER", nightAction: null },
    // etc.
  }
  ```
* Each action is a function that:

  * Sends private DM to player via Baileys.
  * Collects their response (choice of victim, etc.).
  * Returns the decision to `gameManager`.

---

### (c) **Phase Controller (`phaseController.js`)**

* Orchestrates the sequence:

  * **Night Phase**:

    * DM all players.
    * Collect and resolve actions (wolves pick victim, doctor saves, seer inspects).
    * After timer ends → apply results.
  * **Day Phase**:

    * Announce night results in group.
    * Handle lynch voting (collect votes in group or DMs).
    * Apply execution + role reveals + cascades (Hunter, Lovers).
  * Repeats cycle until win condition reached.

---

### (d) **Vote Manager (`voteManager.js`)**

* Handles **group voting system**:

  * Stores votes `{ voterJid: targetJid }`.
  * Tallies votes when timer expires or all players voted.
  * Announces results.
  * Resolves ties (revote or “no lynch”).

---

### (e) **Win Condition Checker (`winChecker.js`)**

* After each cycle (night/day), checks:

  * Villagers win? (no wolves left)
  * Wolves win? (wolves ≥ non-wolves)
  * Lovers win? (only two lovers alive)
* Informs `gameManager` to end the game if conditions met.

---

### (f) **Storage Manager (`storage.js`)**

* Reads/writes JSON for:

  * Active games.
  * Player states.
* Example structure:

  ```json
  {
    "groupJid1": {
      "players": [{ "jid": "...", "isPlaying": true, "isDead": false, "role": "WEREWOLF" }],
      "state": "NIGHT",
      "dayNumber": 2
    }
  }
  ```

---

## 3. **Message Handling**

* **Command Parser** (`commands.js`):

  * Reads group/private messages, strips prefix (`!`).
  * Routes to relevant Game Manager function.
* **Group Messages**:

  * `!startgame` → initiates new game lobby.
  * `!play` → joins lobby if waiting.
* **Private Messages**:

  * Bot sends prompts for role actions.
  * Players reply with target JID/number → stored as their choice.

---

## 4. **Timers / Scheduling**

* Use `setTimeout` or a job scheduler for:

  * 5-minute join window.
  * 5-minute night actions.
  * Day vote deadline.
* Each phase ends **either when all inputs are collected** or timer expires.

---

## 5. **Game Lifecycle**

### 1. Lobby Creation

* `!startgame` in group.
* Bot enters `WAITING_PLAYERS` state.
* 5-minute join window for `!play`.
* Every join → bot sends updated player list.

### 2. Assign Roles

* After timer → assign roles (wolves ≈ 20% of players).
* Save to JSON.

### 3. Night Phase

* Bot privately prompts:

  * Wolves → pick victim.
  * Doctor → pick who to save.
  * Seer → pick who to inspect.
  * Others → “you sleep peacefully.”
* Timer ends → apply results.

### 4. Day Phase

* Bot announces deaths/events in group.
* Group votes → lynch one player.
* Apply death cascades (Hunter shoots, Lover suicides).
* Check win conditions.

### 5. Repeat

* Loop Night → Day until win/lose condition met.

### 6. Game End

* Bot announces winner.
* Clears game state from JSON.

---

## 6. **Error Handling & Safeguards**

* Prevent players from joining twice.
* Ignore commands if not in correct phase.
* Gracefully handle bot restarts (reload JSON state).
* Ensure only group admins can `!startgame`.

---

👉🏽 So, in summary:

* **`index.js`**: Entry point, Baileys setup.
* **`gameManager.js`**: Orchestrates whole game.
* **`roles.js`**: Role definitions + abilities.
* **`phaseController.js`**: Night/Day orchestration.
* **`voteManager.js`**: Handles group voting.
* **`winChecker.js`**: Endgame conditions.
* **`storage.js`**: JSON persistence.
* **`commands.js`**: Command parsing/routing.

---

Do you want me to also draw you a **flowchart of the state machine** (WAITING → ASSIGNING → NIGHT → DAY → END) so you can visualize the game cycle before coding?
