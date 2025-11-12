import axios from "axios";
import * as cheerio from "cheerio";

export async function parseWiktionary(word, lang = ["Français", "Anglais"]) {
    const url = `https://fr.wiktionary.org/wiki/${encodeURIComponent(word.toLowerCase())}`;
    console.log(`Fetching: ${url}`);

    try {
        // Fetch the page
        const { data: html } = await axios.get(url);
        // Load HTML into cheerio
        const $ = cheerio.load(html);
        // Retrieve the title
        const title = $("#firstHeading").text().trim();

        // Retrieve all section headers (e.g., Étymologie, Prononciation, Verbe, etc.)
        const sections = [];
        $("h2").each((_, el) => {
            const sectionTitle = $(el).text().trim();
            const sectionId = $(el).attr("id") || "";
            if (sectionTitle !== "Sommaire")
                sections.push({ sectionTitle, sectionId });
        });

        return {
            title,
            url,
            sections,
            found: sections.some(s => lang.includes(s.sectionTitle)),
        };
    } catch (err) {
        console.log("Error fetching or parsing page:", err.message);
        return null;
    }
}

// Example usage
(async () => {
    const word = process.argv[2] || "food";
    const wiktionary = await parseWiktionary(word);
    if (!wiktionary) return;

    console.log("Title:", wiktionary.title);
     console.log("Corresponds:", wiktionary.found);
     console.log("Sections found:", wiktionary.sections.map(s => s.sectionTitle));
})();
