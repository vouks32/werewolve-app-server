
// import ffmpeg from "fluent-ffmpeg"
// import fs from "fs"
// const generateThumbnail = (inputPath, outputPath = "thumb.jpg") => {
//     return new Promise((resolve, reject) => {
//         ffmpeg(inputPath)
//             .on("end", () => resolve(fs.readFileSync(outputPath)))
//             .on("error", reject)
//             .screenshots({
//                 count: 1,
//                 filename: outputPath,
//                 folder: ".",
//                 size: "320x240"
//             })
//     })
// }

// generateThumbnail('./gifs/wolf2.gif')
let obj = { dog: "yes", cat: 'no' }
let timer = setTimeout(() => console.log(timer), 1000)
//console.log(((60 * 60 * 3) - (Math.floor((new Date()).valueOf() / 1000) % (60 * 60 * 3)))/60)
console.log(timer._idlePrev)
console.log(timer._idleNext)