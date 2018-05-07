const gridSize = require('./config/gridsize.js');
const byteSize = 8;

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
                if (this.data[x*gridSize + y]) {
                    row += '█';
                } else {
                    row += ' ';
                }
            }
            console.log(row);
        }
    }

    buffer() {
        if (this.data.length != gridSize * gridSize) {
            throw 'Incorrect image size; aborting';
        }

        const buffer = Buffer.alloc(Math.ceil(this.data.length / byteSize));
        let byte = 0x00;
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i]) {
                byte |= 1 << (i % byteSize);
            }

            if (i % byteSize == byteSize - 1) {
                buffer.writeUInt8(byte, Math.floor(i / byteSize));
                byte = 0x00;
            }
        }

        return buffer;
    }

    static empty() {
        const data = [];

        for (let i = 0; i < gridSize*gridSize; i++) {
            data[i] = false;
        }

        return new Image(data);
    }

    static random(probability) {
        if (probability === undefined) {
            probability = 0.25;
        }

        const image = Image.empty();

        for (let i = 0; i < gridSize * gridSize; i++) {
            if (Math.random() < probability) {
                image.data[i] = true;
            }
        }

        return image;
    }

    static fromImage(imagePath) {
        sharp(inputBuffer)
            .resize(320, 240);
    }
}

module.exports = Image;
