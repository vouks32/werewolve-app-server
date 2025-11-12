import { HorizontalAlign, Jimp, loadFont, measureTextHeight, ResizeStrategy } from 'jimp';
import fs from 'fs';

import { SANS_10_BLACK, SANS_128_BLACK, SANS_16_BLACK, SANS_32_BLACK, SANS_64_BLACK } from 'jimp/fonts';

async function createCombinedImage() {
  const canvasWidth = 600;
  const canvasHeight = 600;
  const text = 'Hello World';
  const bottomImagePath = 'images/death0.jpg';
  const outputImagePath = 'output-image.png';
  const verticalMargin = 20;

  try {
    // 1. Create a new white canvas
    const canvas = new Jimp({width: canvasWidth, height: canvasHeight, color: 0xFFFFFFFF});

    // 2. Load the font for the text
    const font = await loadFont(SANS_32_BLACK); // Ensure the font file exists in the specified path

    // 3. Load the bottom image
    const bottomImage = await Jimp.read(bottomImagePath);

    // Resize the bottom image to fit the canvas width while maintaining aspect ratio
    bottomImage.resize({w: canvasWidth, h : Jimp.AUTO});

    // 4. Print the text at the top
    const textHeight = measureTextHeight(font, text, canvasWidth);
    canvas.print({
      font,
      x : 0,
      y : verticalMargin, 
      text : {
        text: text,
        alignmentX: HorizontalAlign.CENTER
      },
      maxWidth : canvasWidth
    });

    // 5. Composite the bottom image onto the canvas
    const compositeY = textHeight + verticalMargin*2;
    canvas.composite(bottomImage, 0, compositeY);

    canvas.crop({x: 0, y: 0, w :canvasWidth, h :compositeY + bottomImage.height});
    // 6. Save the final image
    await canvas.write(outputImagePath);
    console.log(`Image saved to ${outputImagePath}`);
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

createCombinedImage();



async function insertImage() {
  // 1. Charger le modèle de journal
  const template = await Jimp.read("images/journal.png");

  // 2. Charger l'image à insérer
  const photo = await Jimp.read("images/death0.jpg");

  // 3. Définir les coordonnées et dimensions de la zone "IMAGE"
  // ⚠️ À ajuster selon la position réelle du cadre dans ton template
  const x = 20;   // position horizontale
  const y = 170;  // position verticale
  const width = 550;  // largeur du cadre image
  const height = 490; // hauteur du cadre image

  // 4. Redimensionner l'image à la taille du cadre
  photo.cover({ w: width, h: height }) // garde le ratio tout en remplissant


  // 5. Paste it on the template
  template.composite(photo, x, y);

  // 6. Load a font (you can use Jimp.FONT_SANS_32_BLACK or WHITE, etc.)
  const font = await loadFont(SANS_10_BLACK);

  // 7. Add text — example: “Community Cleanup Day”
  const text = "Community Cleanup Day";

  // 8. Define text position (adjust as needed)
  const textX = 60;
  const textY = 80;

  // 9. Print text on the image
  template.print(
    font,
    textX,
    textY,
    {
      text,
      alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
    },
    500, // max text width
    100  // max text height
  );

  // 5. Coller l'image dans le template
  template.composite(photo, x, y);

  // 6. Enregistrer le résultat final
  await template.write("images/journal_with_image.png");

  console.log("✅ Image insérée avec succès !");
}

//insertImage().catch(console.error);
