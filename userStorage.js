import fs from "fs"
import path from "path"

const USER_FOLDER = path.join(process.cwd(), "../users")
const killWithPowers = 5
export const POINTS_LIST = {
    joinGame: 1,
    WinAsVillager: 3,
    WinAsWolve: 10, 
    WinAsLover: 15,
    StartSuccessfulGame: 0,
    deathPenatly: -1,
    changeVotePenalty: -2,
    wolfEat: 3,
    hunterKillsWolf: killWithPowers,
    witchPoisonWolf: killWithPowers,
    votedWolf: killWithPowers,
    votedInnocent: -15,
    didntVote: -10,
    prostituteProtected: killWithPowers,
    doctorProtected: killWithPowers,
    witchProtected: killWithPowers,
    cupidonlinkWolf: killWithPowers,
    votedAsTanner : 5,
}

export function saveUser(user) {
    if (!fs.existsSync(path.join(USER_FOLDER, user.jid + '.json'))) {
        fs.writeFileSync(path.join(USER_FOLDER, user.jid + '.json'), JSON.stringify({
            ...user,
            roleHistory: {} // Nouveau champ pour l'historique des rôles par groupe
        }, null, 2))
        return user
    }

    const SavedUser = JSON.parse(fs.readFileSync(path.join(USER_FOLDER, user.jid + '.json')))
    fs.writeFileSync(path.join(USER_FOLDER, user.jid + '.json'), JSON.stringify({ 
        ...SavedUser, 
        ...user,
        // Conserver l'historique des rôles lors des mises à jour
        roleHistory: SavedUser.roleHistory || {}
    }, null, 2))
    return JSON.parse(fs.readFileSync(path.join(USER_FOLDER, user.jid + '.json')))
}

export function getUser(jid) {
    if (!fs.existsSync(USER_FOLDER)) fs.mkdirSync(USER_FOLDER, { recursive: true })

    if (!fs.existsSync(path.join(USER_FOLDER, jid + '.json'))) return null
    try {
        return JSON.parse(fs.readFileSync(path.join(USER_FOLDER, jid + '.json')))
    } catch (error) {
        return null
    }
}

export function getAllUsers() {
    if (!fs.existsSync(USER_FOLDER)) fs.mkdirSync(USER_FOLDER, { recursive: true })

    const playerFileList = fs.readdirSync(USER_FOLDER)
    let players = {}
    playerFileList.forEach(pfile => {
        players[pfile.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(USER_FOLDER, pfile)))
    })
    return players
}