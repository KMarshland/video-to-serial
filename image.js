const sharp = require('sharp');
const chalk = require('chalk');
const gifFrames = require('gif-frames');
const fs = require('fs');

const gridSize = require('./config/gridsize.js');
const brightnessBits = require('./config/brightnessbits.js');
const byteSize = 8;
if (byteSize % brightnessBits !== 0) {
    throw "Brightness must fit evenly into bytes"
}

const brightnessDivisor = Math.pow(2, 8 - brightnessBits);
const maxBrightness = Math.pow(2, brightnessBits) - 1;

const storeIntermediateImages = false;

class Image {
    constructor(data) {
        this.data = data;

        if (Array.isArray(data)) {
            this.data = data;
        }
    }

    show() {
        for (let x = 0; x < gridSize; x++) {
            let row = '';
            for (let y = 0; y < gridSize; y++) {
                const brightness = this.data[x*gridSize + y];
                const brightness8Bit = 2*brightness*brightnessDivisor;

                row += chalk.rgb(brightness8Bit, brightness8Bit, brightness8Bit)('█');
            }
            console.log(row);
        }
    }

    buffer() {
        if (this.data.length != gridSize * gridSize) {
            throw 'Incorrect image size; aborting';
        }

        const buffer = Buffer.alloc(Math.ceil(this.data.length*brightnessBits / byteSize));
        let byte = 0x00;
        for (let i = 0; i < this.data.length; i++) {

            byte |= this.data[i] << ((i*brightnessBits) % byteSize);

            if ((i+1)*brightnessBits % byteSize === 0) {
                buffer.writeUInt8(byte, Math.floor(i*brightnessBits / byteSize));
                byte = 0x00;
            }
        }

        return buffer;
    }

    verifyBuffer(buffer) {
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const index = y*gridSize + x;
                const correctValue = this.data[index];

                const relevantByte = buffer.readUInt8(Math.floor(index * brightnessBits / byteSize));
                const shiftDistance = Math.floor((index * brightnessBits) % byteSize);
                const extractedValue = (relevantByte >> shiftDistance) & maxBrightness;

                if (correctValue != extractedValue) {
                    console.log('Correct value: 0x' + correctValue.toString(16));
                    console.log('Extracted value: 0x' + extractedValue.toString(16));
                    console.log('Index: ' + index);
                    console.log('Shift distance: ' + shiftDistance);
                    console.log('Relevant byte: 0x' + relevantByte.toString(16));
                    throw "Invalid buffer";
                }
            }
        }

        console.log("Buffer verified to be correct");
    }

    static empty() {
        const data = [];

        for (let i = 0; i < gridSize*gridSize; i++) {
            data[i] = 0;
        }

        return new Image(data);
    }

    static full() {
        const data = [];

        for (let i = 0; i < gridSize*gridSize; i++) {
            data[i] = maxBrightness;
        }

        return new Image(data);
    }

    static random(probability) {
        if (probability === undefined) {
            probability = 0.25;
        }

        const data = [];

        for (let i = 0; i < gridSize*gridSize; i++) {
            let value = 0;
            if (Math.random() < probability) {
                value = Math.ceil(Math.random() * maxBrightness);
            }
            data.push(value);
        }

        return new Image(data);
    }

    /*
     * Takes raw image data and turns it into an Image object
     * Does so by resizing, turning to greyscale, and quantizing brightness
     *
     * Options
     *  prescaled: If true, skips the scale step
     *  recycle: An Image object that can have its data overwritten (to reduce garbage collector usage)
     */
    static fromRawData(data, opts) {
        return new Promise(function (resolve, reject) {
            let pipeline;
            if (opts.prescaled) {
                pipeline = sharp(data)
                    .greyscale();
            } else {
                pipeline = sharp(data)
                    .resize(gridSize, gridSize)
                    .greyscale();
            }

            if (storeIntermediateImages) {
                pipeline.toFile('tmp/debug-' + new Date().valueOf() + '.png');
            }

            pipeline.raw()
                .toBuffer()
                .catch(reject)
                .then(function (greyscale) {
                    if (opts.recycle) {
                        for (let i = 0; i < greyscale.length; i++) {
                            // quantize the 8 bit grayscale to brightnessBits bits
                            const darkness = Math.floor(greyscale[i] / brightnessDivisor);

                            // invert it, as 255 is max brightness, not black
                            opts.recycle.data[i] = maxBrightness - darkness;
                        }

                        resolve(opts.recycle);
                    } else {
                        let data = [];

                        for (let i = 0; i < greyscale.length; i++) {
                            // quantize the 8 bit grayscale to brightnessBits bits
                            const darkness = Math.floor(greyscale[i] / brightnessDivisor);

                            // invert it, as 255 is max brightness, not black
                            data.push(maxBrightness - darkness);
                        }

                        resolve(new Image(data));
                    }
                });
        });
    }

    /*
     * Loads an image file, and turns it into an Image object
     * Does so by resizing, turning to greyscale, and quantizing brightness
     *
     * Options
     *  removeAfter If true, it deletes the file at imagePath after resolving
     *  prescaled If true, skips the scale step
     */
    static fromImageFile(imagePath, opts) {
        return new Promise(function (resolve, reject) {
            opts = opts || {};

            fs.readFile(imagePath, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                Image.fromRawData(data, opts)
                    .then(function (image) {
                        // delete the file if requested
                        if (opts.removeAfter) {
                            fs.unlink(imagePath, (err)=>{
                                if (err) {
                                    console.error(err);
                                }
                            });
                        }

                        resolve(image);
                    })
                    .catch(reject);
            });
        });
    }

    static fromGif(imagePath) {
        return new Promise(function (resolve, reject) {
            gifFrames({
                url: imagePath,
                outputType: 'png',
                frames: 'all'
            })
                .catch(reject)
                .then(function (frameData) {

                    const frames = [];
                    const basePath = './tmp/image-' + Math.floor(Math.random() * 1e12) + '-';

                    frameData.forEach(function (frame) {

                        const tmpPath = basePath + frame.frameIndex + '.png';

                        let ws = fs.createWriteStream(tmpPath);

                        ws.on('finish', function() {
                            Image.fromImageFile(tmpPath, {removeAfter: true})
                                .catch(reject)
                                .then(function (image) {
                                    frames.push(image);

                                    if (frames.length == frameData.length) {
                                        resolve(frames);
                                    }
                                });
                        });

                        frame.getImage().pipe(ws);
                    });
                });
        });
    }
}

module.exports = Image;
