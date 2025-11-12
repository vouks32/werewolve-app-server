// roleManager.js
class RoleManager {
    static getRoleDistribution(playerCount) {
        // Define role percentages (adjust as needed)
        const distribution = {
            WEREWOLF: Math.max(1, Math.floor(playerCount * 0.2)),
            MAYOR: playerCount >= 4 ? 1 : 0,
            MADMAN: playerCount >= 14 ? 2 : playerCount >= 5 ? 1 : 0,
            HUNTER: playerCount >= 5 ? 1 : 0,
            TANNER: playerCount >= 7 ? 1 : 0,
            PROSTITUTE: playerCount >= 8 ? 1 : 0,
            CUPID: playerCount >= 9 ? 1 : 0,
            SEER: playerCount >= 10 ? 1 : 0,
            DOCTOR: playerCount >= 12 ? 1 : 0,
            WITCH: playerCount >= 13 ? 1 : 0,
            SERIALKILLER: playerCount > 14 ? 1 : 0,
            PYROMANIAC: playerCount >= 15 ? 1 : 0
        };

        // Calculate total special roles
        const specialRolesNAMES = Object.keys(distribution)
        const specialRolesCount = Object.values(distribution).reduce((sum, count) => sum + count, 0);

        // Fill remaining slots with villagers
        distribution.VILLAGER = Math.max(0, playerCount - specialRolesCount);

        if (playerCount > 6) {
            const randomRole = "VILLAGER"
            if (distribution[randomRole] > 0 && playerCount > 5 && Math.random() < 0.5) {
                distribution[randomRole] -= 1
                distribution.MADMAN += 1
            }
        }

        return distribution;
    }

    static generateRoles(playerCount) {
        const distribution = this.getRoleDistribution(playerCount);
        const roles = [];

        // Add roles based on distribution
        for (const [role, count] of Object.entries(distribution)) {
            for (let i = 0; i < count; i++) {
                roles.push(role);
            }
        }


        for (let v = 0; v < 7; v++) {
            // Shuffle roles
            for (let i = roles.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [roles[i], roles[j]] = [roles[j], roles[i]];
            }
        }

        return roles;
    }

    static validateRoleDistribution(roles) {
        const counts = {};
        for (const role of roles) {
            counts[role] = (counts[role] || 0) + 1;
        }

        // Ensure at least one werewolf
        if (!counts.WEREWOLF || counts.WEREWOLF < 1) {
            return false;
        }

        // Ensure not too many werewolves (max 1/3 of players)
        if (counts.WEREWOLF > Math.ceil(roles.length / 3)) {
            return false;
        }

        return true;
    }
}

export default RoleManager;