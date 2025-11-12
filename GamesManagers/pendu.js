// gameManager.js
import fs from "fs-extra"
import path from "path"
import RoleManager from "./werewolve-utils/roleManager.js"
import { getUser, saveUser } from "../userStorage.js";


const DATA_FILE = path.join(process.cwd(), "games/pendu.json")
const WORDS_FILE = path.join(process.cwd(), "GamesManagers/mots.json")

const HANGMANPICS = [`
  +---+
   |       |
           |
           |
           |
           |
=========`, `
   +---+
   |       |
  O      |
           |
           |
           |
=========`, `
  +---+
   |       |
  O      |
  |       |
           |
           |
=========`, `
  +---+
   |       |
  O      |
 /|       |
           |
           |
=========`, `
  +---+
   |       |
  O      |
 /|\\     |
           |
           |
=========`, `
 +---+
   |       |
  O      |
 /|\\     |
 /        |
           |
=========`, `
  +---+
   |       |
  O      |
 /|\\     |
 / \\     |
           |
=========`]



// --- Utilities ---
function delay(ms) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}

function loadGames() {
    return {}
}

function saveGames(games) {
    let temp = { ...games }
    fs.writeFileSync(DATA_FILE, JSON.stringify(temp, null, 2))
}


// --- Main Manager ---
export class PenduManager {
    constructor() {
        this.games = loadGames()
    }



    async addUserPoints(playerJid, whatsapp, points, reason, gamescount = 0) {
        if (!playerJid || !whatsapp || !reason) return false
        console.log(`Adding ${points} points to ${playerJid} for ${reason}`, whatsapp?.ids)
        let user = getUser(playerJid)
        let arr = {}
        arr[reason] = points

        if (!user) {
            saveUser({ jid: playerJid, lid: whatsapp.ids?.lid || null, groups: [whatsapp.groupJid], dateCreated: Date.now(), pushName: whatsapp.raw?.pushName || ' ', games: { PENDU: gamescount }, points: 50, pointsTransactions: [arr] })
        } else {
            if (!user.groups.some(g => g === whatsapp.groupJid)) {
                user.groups.push(whatsapp.groupJid)
            }
            if (whatsapp?.ids?.lid && whatsapp.ids?.lid !== user.lid && whatsapp.sender === playerJid) {
                user.lid = whatsapp.ids.lid
            }
            user.points += points
            user.games.PENDU += gamescount
            user.pointsTransactions.push(arr)
            user = saveUser(user)
        }
        return true
    }



    isPlaying(groupId) {
        const game = this.games[groupId]
        if (game) return true
        return false
    }

    getPlayerGroupJid(playerJid) {
        const grouparr = Object.entries(this.games).find(arr => arr[1].players.some(_p => _p.jid === playerJid))
        return grouparr ? grouparr[0] : null
    }

    getPlayerGroupData(playerJid) {
        const grouparr = Object.entries(this.games).find(arr => arr[1].players.some(_p => _p.jid === playerJid))
        return grouparr ? grouparr : null
    }

    getGroupData(groupJid) {
        return this.games[groupJid]
    }

    getPlayerJidFromNumber(groupId, number) {
        const game = this.games[groupId]
        return game?.players[parseInt(number)]?.jid
    }

    async createGame(groupId, whatsapp) {
        if (this.games[groupId]) {
            await whatsapp.reply("🔄️ la partie va être réinitialisée !")
        }

        const words = fs.readJSONSync(WORDS_FILE).filter(w => w.label.length > 3)
        const word = words[Math.floor(Math.random() * words.length)].label


        console.log(word);
        if (!word) {
            await whatsapp.reply("❌ Une erreur est survenue lors de la création du mot. Veuillez réessayer.")
            return
        }
        this.games[groupId] = {
            state: "SET_WORD",
            creator: whatsapp.sender,
            players: [],
            word: (new String(word)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
            displayWord: "_".repeat(word.length),
            guessedLetters: [],
            wrongLetters: [],
            rounds: -1
        }

        await whatsapp.reply("🪢 Nouvelle partie du Pendu")
        await this.startGame(groupId, whatsapp)

    }


    async startGame(groupId, whatsapp) {
        const game = this.games[groupId]
        if (!game || game.state !== "SET_WORD") return

        game.state = "PLAYING"

        await whatsapp.sendMessage(groupId, `La partie commence !\n\n${HANGMANPICS[0]}\n\nMot à deviner :\n ${game.displayWord.split("").join(" ")}\n\nEnvoyez une lettre pour commencer à jouer !`)

    }

    async resolveGame(groupId, whatsapp) {
        const game = this.games[groupId]
        if (!game) return
        const playerScores = game.players.map(p => {
            const correctCount = p.answers.reduce((sum, a) => sum += a.correct ? 1 : 0, 0)
            const incorrectCount = p.answers.reduce((sum, a) => sum += !a.correct ? 1 : 0, 0)

            return { jid: p.jid, correctCount, incorrectCount }
        })
        await whatsapp.sendMessage(groupId, `Scores:\n\n${playerScores.map(p => `@${p.jid.split('@')[0]}:\n✅ *${p.correctCount}* lettres correctes\n❌ *${p.incorrectCount}* lettres incorrectes \n *+${(p.correctCount) - p.incorrectCount} points*`).join('\n\n')}`, playerScores.map(p => p.jid))
        for (let p of playerScores) {
            const points = (p.correctCount) - p.incorrectCount
            await this.addUserPoints(p.jid, whatsapp, points, "PENDU", 1)
        }
        await whatsapp.sendMessage(groupId, `envoie *"!pendu"* Pour jouer à nouveau`)
        delete this.games[groupId]

    }

    async giveLetter(groupId, voterJid, letter, whatsapp) {
        const game = this.games[groupId]
        if (!game || game.state !== "PLAYING") return
        if (letter.length !== 1 || !letter.match(/[a-z]/i)) {
            return
        }

        if (game.guessedLetters.includes(letter)) {
            await whatsapp.sendMessage(groupId, `Mouf, La lettre *${letter}* a déjà été proposée !`, [voterJid])
            return
        }

        const player = game.players.find(p => p.jid === voterJid)

        if (!player) {
            await whatsapp.sendMessage(groupId, `Youpiii @${voterJid.split('@')[0]} a rejoin la partie`, [voterJid])
            game.players.push({ jid: voterJid, answers: [{ letter, correct: game.word.includes(letter) }] })
        } else {
            player.answers.push({ letter, correct: game.word.includes(letter) })
        }

        game.guessedLetters.push(letter)

        if (game.word.includes(letter)) {
            // Correct letter
            let newDisplay = ""
            for (let i = 0; i < game.word.length; i++) {
                if (game.word[i] === letter) {
                    newDisplay += letter
                } else {
                    newDisplay += game.displayWord[i]

                }
            }

            game.displayWord = newDisplay

            await whatsapp.sendMessage(groupId, `🎉 Bravo ! La lettre *${letter}* est dans le mot.\n\n${HANGMANPICS[game.wrongLetters.length]}\n\nMot à deviner :\n ${game.displayWord.split("").join(" ")}`)
        } else {
            // Wrong letter
            game.wrongLetters.push(letter)
            await whatsapp.sendMessage(groupId, `❌ Oops ! La lettre *${letter}* n'est pas dans le mot.\n\n${HANGMANPICS[game.wrongLetters.length]}\n\nMot à deviner :\n ${game.displayWord.split("").join(" ")}`)
        }
        if (game.displayWord === game.word) {
            await whatsapp.sendMessage(groupId, `🏆 Félicitations ! Le mot *${game.word}* a été deviné correctement !`)
            await this.resolveGame(groupId, whatsapp)
            return
        }
        if (game.wrongLetters.length >= HANGMANPICS.length - 1) {
            await whatsapp.sendMessage(groupId, `💀 La partie est terminée ! Le mot était *${game.word}*.\n\n${HANGMANPICS[HANGMANPICS.length - 1]}`)
            await this.resolveGame(groupId, whatsapp)
            return
        }

        saveGames(this.games)

    }

    async stopGame(groupId, whatsapp) {
        const game = this.games[groupId]
        if (!game) return

        await whatsapp.sendMessage(groupId, `*🏆 Partie annulé!*`)
        await whatsapp.sendMessage(groupId, `envoie *"!pendu"* pour jouer à nouveau`)
        delete this.games[groupId]
        saveGames(this.games)
        return
    }

    async handleShortHand(groupId, playerJid, choice, whatsapp) {
        const game = this.games[groupId]
        if (!game) return

        if (game.state === "PLAYING") {
            await this.giveLetter(groupId, playerJid, choice.toLowerCase(), whatsapp)
        }

    }

}
