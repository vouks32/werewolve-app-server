export const asnwers = {
    getStartNight: () => {
        const ans = [
            "🌙 La nuit est tombée... \nSeules les prostituées rodent.... Du moins... c'est ce qu'elles pensent.",
            "🌙 Le village s'endort... \nLes rues sont vides...\nEnfin... Presque!.",
            "🌙 Le ciel devient sombre et tout le monde s'endort... \nLes rues sont vides... si ce n'est que pour les prostitués\nEnfin... Presque!.",
        ]

        return ans[Math.floor(Math.random() * ans.length)]
    },
    getStartProstituteDeath: () => {
        const ans = [
            "💄 Avant même de recevoir le premier coup🍆, la prostitué vois sa tête être arraché par un monstre poilu.",
            "💄 Un cadavre à moitié nu, talon haute, rouge à lèvre foncé... \nUne pute est morte ce soir!.",
            "💄 La prostitué a visité un loup garou, RIP la pute 💀",
        ]

        return ans[Math.floor(Math.random() * ans.length)]
    },
    getStartProstituteSave: () => {
        const ans = [
            "🌙 La nuit est tombée... \nSeules les prostituées rodent.... Du moins... c'est ce qu'elles pensent.",
            "🌙 Le village s'endort... \nLes rues sont vides...\nEnfin... Presque!.",
            "🌙 Le ciel devient sombre et tout le monde s'endort... \nLes rues sont vides... si ce n'est que pour les prostitués\nEnfin... Presque!.",
        ]

        return ans[Math.floor(Math.random() * ans.length)]
    },
}