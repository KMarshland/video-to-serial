const fs = require('fs');
const Image = require('./image.js');
const Video = require('./video.js');
const sleep = require('./sleep.js');

const mockArduino = process.argv.includes('--test') || process.argv.includes('-t');
const printReturns = process.argv.includes('--print') || process.argv.includes('-p');
const quietMode = process.argv.includes('--quiet') || process.argv.includes('-q');
const SerialPort = mockArduino ? require('serialport/test') : require('serialport');

const baud = 115200;
let portLocation = '/dev/cu.SLAB_USBtoUART';

if (mockArduino) {
    const mockLocation = '/dev/serial-test';
    SerialPort.Binding.createPort(mockLocation, {
        echo: false,
        record: false
    });
    portLocation = mockLocation;
}

const port = new SerialPort(portLocation, {
    baudRate: baud,
    XON: true
});

/*
 * Image should be an array of bits
 */
async function writeImage(image) {
    // TODO: make this drain before writing the next image
    return new Promise(function (resolve, reject) {
        !quietMode && image.show();

        const buffer = image.buffer();
        port.write(buffer, function (err) {
            if (err) {
                return reject( err.message);

            }
            !quietMode && console.log('Wrote: ', buffer);
            resolve();
        });
    });
}

/*
 * Expects an array of images
 */
function writeImages(images, delay) {
    if (!delay) {
        delay = 1000 / images.length;
    }

    let i = 0;

    function writeNext() {
        writeImage(images[i++ % images.length]);
        setTimeout(writeNext, delay);
    }

    writeNext();
}

let video = null;
port.on('open', function() {
    let file = process.argv[process.argv.length - 1];
    if (file[0] == '-' || file == 'main.js') { // ignore normal args
        file = null;
    }

    if (file == 'empty' || file == 'e') {
        writeImage(Image.empty());
        return;
    }

    if (file == 'full' || file == 'f') {
        writeImage(Image.full());
        return;
    }

    const fileExists = fs.existsSync(file);

    if (file && !fileExists) {
        console.error('No such file', file);
    }

    if (file && fileExists) {
        console.log('Inputing file', file);

        if (/gif$/.test(file)) {
            Image.fromGif(file)
                .then(writeImages);
            return;
        }

        if (/png|jpg|jpeg/.test(file)) {
            Image.fromImageFile(file)
                .then(writeImage);
            return;
        }

        if (/mov|mp4|mkv/.test(file)) {
            video = new Video(file);
            playVideo();
            return;
        }
    }

    console.log('Making random images');
    setInterval(function () {
        writeImage(Image.random());
    }, 2500);
});

function playVideo() {
    if (!video) {
        return;
    }

    video.play(async function (frame) {
        if (!frame) {
            port.close();
            return;
        }

        await writeImage(frame);
    });
}

if (video || printReturns) {
    let recentData = '';
    let printTimeout;
    console.log('Waiting for data');
    port.on('data', function (data) {

        const asString = data.toString('utf8');
        if (video && asString.indexOf('pause') != -1) {
            if (video.playing) {
                video.pause();
            } else {
                playVideo();
            }
        }

        if (printReturns) {
            recentData += asString;

            if (recentData.length > 100 || recentData.indexOf("\n") != -1) {
                printTimeout && clearTimeout(printTimeout);
                console.log('Data:');
                console.log(recentData);
                recentData = '';
            } else {
                printTimeout && clearTimeout(printTimeout);
                printTimeout = setTimeout(function () {
                    console.log(recentData);
                    recentData = '';
                }, 50);
            }
        }
    });
}


