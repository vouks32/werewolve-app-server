import fs from "fs";
import path from "path";
import { getUser, saveUser, getAllUsers } from "../userStorage.js";
import { parseWiktionary } from "./guessword-utils/checkword.js";

const DATA_FILE = path.join(process.cwd(), "games/wordgame.json");

const VOWELS = ["A", "E", "I", "O", "U", "Y", "A", "E", "I", "O", "U", "Y", "È", "É", "Ê",];
const CONSONANTS = "BCÇDFGHJKLMNPQRSTVWXZBCDFGHJKLMNPQRSTVWXZÇ".split("");

export class WordGameManager {
    constructor() {
        this.games = this.loadGames();
    }

    // ---------------- UTILS ----------------

    loadGames() {
        return {}
        if (!fs.existsSync(DATA_FILE)) return {}
        return JSON.parse(fs.readFileSync(DATA_FILE))
    }

    saveGames(games) {
        let temp = { ...games }
        Object.entries(temp).forEach(arr => { temp[arr[0]].timer = null })
        fs.writeFileSync(DATA_FILE, JSON.stringify(temp, null, 2))
    }

    generateLetters() {
        const vowelCount = Math.floor(Math.random() * 3) + 6; // entre 6 et 8 voyelles
        const consonantCount = 18 - vowelCount;

        const v = [...VOWELS]
        const c = [...CONSONANTS]

        const vowels = Array.from({ length: vowelCount }, () => {
            let n = Math.floor(Math.random() * v.length)
            return v.splice(n, 1)[0]
        }
        );
        const consonants = Array.from({ length: consonantCount }, () => {
            let n = Math.floor(Math.random() * c.length)
            return c.splice(n, 1)[0]
        }
        );
        const letters = [...vowels, ...consonants].sort(() => Math.random() - 0.5);
        return letters;
    }

    async addPoints(playerJid, whatsapp, points, reason) {
        let user = getUser(playerJid);
        if (!user) {
            saveUser({
                jid: playerJid,
                groups: [whatsapp.groupJid],
                points: 50 + points,
                games: { WORDGAME: 1 },
                pointsTransactions: [{ [reason]: points }],
            });
        } else {
            if (!user.groups.includes(whatsapp.groupJid)) user.groups.push(whatsapp.groupJid);
            user.points += points;
            user.games.WORDGAME = (user.games.WORDGAME || 0) + 1;
            user.pointsTransactions.push({ [reason]: points });
            saveUser(user);
        }
    }

    // ---------------- LOGIC ----------------
    async createGame(groupId, whatsapp) {
        if (this.games[groupId]) {
            await whatsapp.reply("🧩 Une partie est déjà en cours !");
            return;
        }

        const letters = this.generateLetters();
        this.games[groupId] = {
            groupId,
            letters,
            state: "WAITING_PLAYERS",
            players: {}, // {jid: {words:[], score:0, currentWord: null, currentScore: 0}}
            timer: null,
            currentRound: 0,
            totalRounds: 5,
            roundTimer: null
        };
        this.saveGames();

        await whatsapp.sendMessage(
            groupId,
            `🎮 *Début du jeu de lettres !*\n\nRejoignez la partie avec *!play _pseudo_* dans les prochains 120 secondes !`,
            Object.keys(getAllUsers())
        );

        // Timer de 90 secondes pour rejoindre
        this.games[groupId].timer = setTimeout(async () => {
            await this.startGame(groupId, whatsapp);
        }, 120 * 1000);

        // Rappels
        setTimeout(async () => {
            if (this.games[groupId]?.state === "WAITING_PLAYERS") {
                await whatsapp.sendMessage(groupId, "⏰ 60 secondes restantes pour rejoindre !");
            }
        }, 60 * 1000);

        setTimeout(async () => {
            if (this.games[groupId]?.state === "WAITING_PLAYERS") {
                await whatsapp.sendMessage(groupId, "⏰ 30 secondes restantes pour rejoindre !");
            }
        }, 90 * 1000);
    }

    async joinGame(groupId, playerJid, pseudo, whatsapp) {
        const game = this.games[groupId];
        if (!game || game.state !== "WAITING_PLAYERS") {
            await whatsapp.reply("❌ Aucune partie en attente de joueurs !");
            return;
        }

        if (game.players[playerJid]) {
            await whatsapp.reply("❌ Tu as déjà rejoint la partie !");
            return;
        }

        game.players[playerJid] = {
            jid: playerJid,
            words: [],
            score: 0,
            currentWord: null,
            currentScore: 0,
            name: pseudo || whatsapp.raw?.pushName || `Joueur-${Object.keys(game.players).length + 1}`
        };
        this.saveGames();

        const names = Object.values(game.players).map((p, i) => `[${i + 1}] - *${p.name}* (@${p.jid.split('@')[0]}) ` + (!p.isDead ? `😀` : `☠️ [${p.role}]`)).join("\n")
        const mentions = Object.values(game.players).map((p, i) => p.jid)

        await whatsapp.reply(`✅ Tu as rejoint!\n\nListe des joueurs:\n\n${names}`, mentions)
    }

    async startGame(groupId, whatsapp) {
        const game = this.games[groupId];
        if (!game || game.state !== "WAITING_PLAYERS") return;

        const playerCount = Object.keys(game.players).length;
        if (playerCount <= 3) {
            await whatsapp.sendMessage(groupId, "❌ Pas assez de joueurs pour commencer la partie !");
            delete this.games[groupId];
            this.saveGames();
            return;
        }

        game.state = "PLAYING";
        game.currentRound = 1;
        this.saveGames();

        await whatsapp.sendMessage(
            groupId,
            `🎮 *Début de la partie !*`
        );

        await this.startRound(groupId, whatsapp);
    }

    async startRound(groupId, whatsapp) {
        const game = this.games[groupId];
        if (!game || game.state !== "PLAYING") return;


        const letters = this.generateLetters();
        game.letters = letters;
        this.saveGames();

        await whatsapp.sendMessage(
            groupId,
            `🔄 *Manche ${game.currentRound}/${game.totalRounds}*\n\nVous avez 90 secondes pour proposer un mot !\n\nLettres : \n*${game.letters.join(" ")}*`,
            Object.keys(game.players)
        );

        // Réinitialiser les mots actuels pour cette manche
        Object.keys(game.players).forEach(jid => {
            game.players[jid].currentWord = null;
            game.players[jid].currentScore = 0;
        });
        this.saveGames();

        // Timer de la manche (30 secondes)
        game.roundTimer = setTimeout(async () => {
            await this.endRound(groupId, whatsapp);
        }, 90 * 1000);
        // Timer de la manche (30 secondes)
        game.roundTimer = setTimeout(async () => {
            await whatsapp.sendMessage(groupId, `⏰ 30 secondes restantes !\n\nLettres : \n*${game.letters.join(" ")}*`);
        }, 60 * 1000);
        // Timer de la manche (30 secondes)
        game.roundTimer = setTimeout(async () => {
            await whatsapp.sendMessage(groupId, `⏰ 15 secondes restantes !\n\nLettres : \n*${game.letters.join(" ")}*`);
        }, 75 * 1000);
    }

    async endRound(groupId, whatsapp) {
        const game = this.games[groupId];
        if (!game || game.state !== "PLAYING") return;

        // Ajouter les scores de la manche aux scores totaux
        Object.keys(game.players).forEach(jid => {
            const player = game.players[jid];
            if (player.currentWord) {
                player.score += player.currentScore;
                player.words.push(player.currentWord);
            }
        });
        this.saveGames();

        // Vérifier si c'est la dernière manche
        if (game.currentRound >= game.totalRounds) {
            await this.endGame(groupId, whatsapp);
        } else {
            game.currentRound++;
            this.saveGames();
            await this.startRound(groupId, whatsapp);
        }
    }

    async handleWord(whatsapp) {
        const groupId = whatsapp.groupJid;
        const word = whatsapp.text.trim().toUpperCase();
        const game = this.games[groupId];
        const player = game.players[whatsapp.senderJid];

        if (!game || game.state !== "PLAYING") return;

        // Vérifier que le joueur est dans la partie
        if (!game.players[whatsapp.senderJid]) {
            // await whatsapp.reply("❌ Tu n'es pas dans cette partie !");
            return;
        }

        const letters = [...game.letters];
        for (const char of word) {
            const idx = letters.indexOf(char);
            if (idx === -1) {
                await whatsapp.reply(`❌ @${player.jid.split('@')[0]} la Lettre "${char}" n'est pas parmit les lettres que tu peux utiliser !`, [player.jid]);
                return;
            }
            letters.splice(idx, 1);
        }


        if (Object.values(game.players).some(p => p.currentWord === word)) {
            await whatsapp.reply(`❌ @${player.jid.split('@')[0]} Le mot *"${word}"* a déjà été proposé par un autre joueur dans cette manche! remet toi en question!`, [player.jid]);
            return;
        }

        const wordDef = await parseWiktionary(word);

        if (!wordDef || !wordDef.found) {
            await whatsapp.reply(`❌ @${player.jid.split('@')[0]} Le mot "${word}" n'existe ni en anglais, ni en français, fallait faire l'école.`, [player.jid]);
            return;
        }

        const score = word.length; // 1 point par lettre

        if (player.currentWord) {
            await whatsapp.reply(`🔄️ @${player.jid.split('@')[0]} a remplacé *"${player.currentWord}"* par *"${word}"*`, [player.jid]);
        } else {
            await whatsapp.reply(`✅ @${player.jid.split('@')[0]} a proposé *"${word}"* (+${score} points)`, [player.jid]);
        }
        // Remplacer le mot actuel du joueur
        player.currentWord = word;
        player.currentScore = score;
        this.saveGames();
    }

    async endGame(groupId, whatsapp) {
        const game = this.games[groupId];
        if (!game) return;

        game.state = "ENDED";

        // Trier les joueurs par score
        const results = Object.entries(game.players)
            .map(([jid, data]) => ({
                jid,
                name: data.name,
                score: data.score,
                words: data.words
            }))
            .sort((a, b) => b.score - a.score);

        // Préparer le podium
        const podium = results
            .map(
                (data, i) =>
                    (i == 0 ? '🥇' : i == 1 ? '🥈' : i == 2 ? '🥉' : '[' + (i + 1) + '] - ') + ` @${data.jid.split('@')[0]} — *${data.score} lettres*`
            )
            .join("\n\n");

        await whatsapp.sendMessage(
            groupId,
            `🏆 *Fin du jeu !*\n\nClassement final :\n\n${podium}`,
            results.map(r => r.jid)
        );

        // Donner les points au gagnant
        const winner = results[0];
        const winner2 = results[1];
        const winner3 = results[2];
        const pointsToAdd = Object.values(game.players).length * 2 - Math.round(Object.values(game.players).length / 2);
        const pointsToAdd2 = Math.round(pointsToAdd / 2);
        const pointsToAdd3 = Math.round(pointsToAdd / 3);

        await whatsapp.sendMessage(
            groupId,
            `🎉 @${winner.jid.split('@')[0]} reçoit *${pointsToAdd} points* !\n` +
            `🎉 @${winner2.jid.split('@')[0]} reçoit *${pointsToAdd2} points* !\n` +
            `🎉 @${winner3.jid.split('@')[0]} reçoit *${pointsToAdd3} points* !\n`
            ,
            [winner.jid]
        );

        await this.addPoints(winner.jid, whatsapp, pointsToAdd, "Gagnant du jeu de mots");
        await this.addPoints(winner2.jid, whatsapp, pointsToAdd2, "2eme Gagnant du jeu de mots");
        await this.addPoints(winner3.jid, whatsapp, pointsToAdd3, "3eme Gagnant du jeu de mots");

        await whatsapp.sendMessage(
            groupId,
            `Envoie *"!mots"* pour jouer à nouveau !`,
        );
        delete this.games[groupId];
        this.saveGames();
    }

    isPlaying(groupId) {
        return !!this.games[groupId];
    }


    async stopGame(groupId, whatsapp) {
        const game = this.games[groupId]
        if (!game) return

        await whatsapp.sendMessage(groupId, `*🏆 Partie annulé!*`)
        await whatsapp.sendMessage(groupId, `envoie *"!mots"* pour jouer à nouveau`)
        delete this.games[groupId]
        this.saveGames(this.games)
        return
    }

}