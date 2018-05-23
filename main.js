const fs = require('fs');
const Image = require('./image.js');
const Video = require('./video.js');

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
    baudRate: baud
});

/*
 * Image should be an array of bits
 */
function writeImage(image) {
    !quietMode && image.show();

    const buffer = image.buffer();
    port.write(buffer, function (err) {
        if (err) {
            return console.log('Error on write: ', err.message);
        }
        !console.log('Wrote: ', buffer);
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
            const video = new Video(file);

            video.play(function (frame) {
                if (!frame) {
                    port.close();
                    return;
                }

                writeImage(frame);
            });

            return;
        }
    }

    console.log('Making random images');
    setInterval(function () {
        writeImage(Image.random());
    }, 2500);
});

if (printReturns) {
    let recentData = '';
    let printTimeout;
    console.log('Waiting for data');
    port.on('data', function (data) {
        recentData += data.toString('utf8');

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
    });
}

