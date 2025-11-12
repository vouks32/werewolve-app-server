// gameManager.js
import fs from "fs"
import path from "path"
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load categories and questions
const categories = JSON.parse(fs.readFileSync(path.join(__dirname, 'categories.json')));
const allQuestions = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json')));

const DATA_FILE = path.join(process.cwd(), "games/quiz.json")

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
    if (!fs.existsSync(DATA_FILE)) 
    return JSON.parse(fs.readFileSync(DATA_FILE))
}

function saveGames(games) {
    let temp = { ...games }
    Object.entries(temp).forEach(arr => { temp[arr[0]].timer = [null, null, null] })
    fs.writeFileSync(DATA_FILE, JSON.stringify(temp, null, 2))
}

function shuffleAnswers(correct, incorrect) {
    let r = [{ correct: true, answer: correct }].concat(incorrect.map(i => { 
        return { correct: false, answer: i } 
    }))

    for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [r[i], r[j]] = [r[j], r[i]];
    }
    return r
}

// --- Main Manager ---
export class QuizManagerFR {
    constructor() {
        this.games = loadGames()
    }

    isPlaying(groupId) {
        return !!this.games[groupId]
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
            await whatsapp.reply("⚠️ Un jeu Quiz est déjà en cours dans ce groupe.")
            return
        }

        this.games[groupId] = {
            state: "WAITING_CATEGORY",
            creator: whatsapp.sender,
            players: [],
            questions: [],
            categoryVotes: {},
            rounds: -1,
            timer: [null, null, null],
        }

        saveGames(this.games)
        await whatsapp.reply("🎮 Nouveau jeu Quiz créé ! \nEnvoyez le *numéro* pour voter pour une catégorie (1 minute).")
        await whatsapp.sendMessage(groupId, "🎮 Choisissez une catégorie : \n\n" + 
            categories.map((c, i) => `[${i + 1}] - *${c.name}*`).join('\n'))

        this.games[groupId].timer[0] = setTimeout(async () => {
            await this.startGame(groupId, whatsapp)
        }, 60 * 1000)
        
        this.games[groupId].timer[1] = setTimeout(async () => {
            await whatsapp.sendMessage(groupId, "🎮 30 secondes restantes pour voter ! \nEnvoyez le *numéro*.")
        }, 30 * 1000)
        
        this.games[groupId].timer[2] = setTimeout(async () => {
            await whatsapp.sendMessage(groupId, "🎮 15 secondes restantes avant le début du jeu !")
        }, 45 * 1000)
    }

    async castVoteCategory(groupId, voterJid, categoryIndex, whatsapp) {
        const game = this.games[groupId]
        if (!game || game.state !== "WAITING_CATEGORY") return

        if (categoryIndex >= categories.length || categoryIndex < 0) {
            await whatsapp.reply("⚠️ Numéro invalide.\nVeuillez envoyer un *numéro* valide.")
            return
        }

        game.categoryVotes[voterJid] = categories[parseInt(categoryIndex)]
        saveGames(this.games)

        await whatsapp.reply(`✅ (@${voterJid.split('@')[0]}) a voté pour *${categories[parseInt(categoryIndex)].name}*`, [voterJid])
    }

    async startGame(groupId, whatsapp) {
        const game = this.games[groupId]
        if (!game || game.state !== "WAITING_CATEGORY") return

        game.state = "ASSIGNING_QUESTIONS"

        // Count votes and determine winning category
        const voteCount = {}
        for (const voter in game.categoryVotes) {
            const category = game.categoryVotes[voter]
            voteCount[category.slug] = (voteCount[category.slug] || 0) + 1
        }

        let winningCategory = categories[0]
        let maxVotes = 0
        for (const slug in voteCount) {
            if (voteCount[slug] > maxVotes) {
                winningCategory = categories.find(c => c.slug === slug)
                maxVotes = voteCount[slug]
            }
        }

        await whatsapp.sendMessage(groupId, `✅ ${maxVotes} personne(s) ont voté pour ${winningCategory.name}`)

        // Get questions for the selected category
        const categoryQuestions = allQuestions.filter(q => q.category === winningCategory.slug)
        
        if (categoryQuestions.length < 10) {
            await whatsapp.sendMessage(groupId, "❌ Pas assez de questions pour cette catégorie. Le jeu est annulé.")
            delete this.games[groupId]
            saveGames(this.games)
            return
        }

        // Shuffle and select 10 questions
        const shuffledQuestions = [...categoryQuestions].sort(() => Math.random() - 0.5).slice(0, 10)
        
        // Prepare questions with shuffled answers
        game.questions = shuffledQuestions.map(question => ({
            ...question,
            answers: shuffleAnswers(question.answer, question.badAnswers)
        }));

        saveGames(this.games)

        await whatsapp.sendMessage(groupId, "Le quiz commence !")
        await this.sendQuestion(groupId, whatsapp)
    }

    async sendQuestion(groupId, whatsapp) {
        const game = this.games[groupId]
        if (!game) return

        game.state = "ANSWERING"
        game.rounds += 1

        if (game.rounds >= game.questions.length) {
            await this.stopGame(groupId, whatsapp)
            return
        }

        saveGames(this.games)

        const currentQuestion = game.questions[game.rounds]
        const questionText = currentQuestion.question
        const answers = currentQuestion.answers

        await whatsapp.sendMessage(groupId, 
            `*Question ${game.rounds + 1}/${game.questions.length}*\n\n` +
            `*${questionText}*\n\n` +
            answers.map((a, i) => `*[${i + 1}]* - ${a.answer}`).join('\n') +
            `\n\nRépondez en envoyant le *numéro*`
        )

        await whatsapp.sendMessage(groupId, "⏰ 60 secondes pour répondre!")

        // Set timers
        game.timer[0] = setTimeout(async () => {
            await this.resolveQuestion(groupId, whatsapp)
        }, 60 * 1000)
        
        game.timer[1] = setTimeout(async () => {
            await whatsapp.sendMessage(groupId, "⏰ 30 secondes restantes!")
        }, 30 * 1000)
        
        game.timer[2] = setTimeout(async () => {
            await whatsapp.sendMessage(groupId, "⏰ 15 secondes restantes!")
        }, 45 * 1000)
    }

    async resolveQuestion(groupId, whatsapp) {
        const game = this.games[groupId]
        if (!game) return
        
        game.state = "RESOLVING"
        const currentQuestion = game.questions[game.rounds]
        const correctAnswerIndex = currentQuestion.answers.findIndex(a => a.correct)

        // Process answers
        const playerAnswers = []
        game.players.forEach(player => {
            const answer = player.answers.find(a => a.questionIndex === game.rounds)
            if (answer) {
                playerAnswers.push({
                    jid: player.jid,
                    correct: answer.answerIndex === correctAnswerIndex
                })
            }
        })

        await whatsapp.sendMessage(groupId, 
            `La réponse était:\n✅ *[${correctAnswerIndex + 1}] - ${currentQuestion.answers[correctAnswerIndex].answer}*\n\n` +
            `Résultats:\n` +
            playerAnswers.map(a => `${a.correct ? '✅' : '❌'} @${a.jid.split('@')[0]}`).join('\n'),
            playerAnswers.map(a => a.jid)
        )

        // Wait a moment before next question
        await delay(3000)
        await this.sendQuestion(groupId, whatsapp)
    }

    async answerQuestion(groupId, voterJid, answerIndex, whatsapp) {
        const game = this.games[groupId]
        if (!game || game.state !== "ANSWERING") return

        const player = game.players.find(p => p.jid === voterJid)
        const currentQuestion = game.questions[game.rounds]

        if (!player) {
            // New player joining
            game.players.push({
                jid: voterJid,
                answers: [{
                    questionIndex: game.rounds,
                    answerIndex: answerIndex,
                    correct: currentQuestion.answers[answerIndex].correct
                }]
            })
            await whatsapp.sendMessage(groupId, `👋 @${voterJid.split('@')[0]} a rejoint le jeu`, [voterJid])
        } else {
            // Existing player answering
            player.answers.push({
                questionIndex: game.rounds,
                answerIndex: answerIndex,
                correct: currentQuestion.answers[answerIndex].correct
            })
        }

        saveGames(this.games)
        await whatsapp.sendMessage(groupId, `👉 @${voterJid.split('@')[0]} a répondu`, [voterJid])
    }

    async stopGame(groupId, whatsapp) {
        const game = this.games[groupId]
        if (!game) return

        // Calculate scores
        const scores = game.players.map(player => ({
            jid: player.jid,
            score: player.answers.filter(a => a.correct).length
        })).sort((a, b) => b.score - a.score)

        await whatsapp.sendMessage(groupId, 
            `*🏆 Fin du jeu!*\n\nClassement:\n` +
            scores.map((p, i) => `${i + 1}. @${p.jid.split('@')[0]} - ${p.score} point(s)`).join('\n'),
            scores.map(p => p.jid)
        )
        
        await whatsapp.sendMessage(groupId, `Envoyez *"!quiz"* pour rejouer`)
        delete this.games[groupId]
        saveGames(this.games)
    }

    async handleShortHand(groupId, playerJid, choice, whatsapp) {
        const game = this.games[groupId]
        if (!game) return

        if (game.state === "ANSWERING") {
            await this.answerQuestion(groupId, playerJid, choice, whatsapp)
        } else if (game.state === "WAITING_CATEGORY") {
            await this.castVoteCategory(groupId, playerJid, choice, whatsapp)
        }
    }
}