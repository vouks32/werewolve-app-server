export const Insult1 = async (groupId, user, whatsapp, priv = false) => {
    if (!user) return
    const insult = await (await fetch('https://evilinsult.com/generate_insult.php?lang=fr&type=json')).json()

    whatsapp.sendMessage(groupId, `@${user.split('@')[0]} , ` + insult.insult, [user])
}