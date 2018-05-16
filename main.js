const fs = require('fs');
const Image = require('./image.js');

const mockArduino = process.argv.includes('--test') || process.argv.includes('-t');
const printReturns = false;
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
    image.show();

    port.write(image.buffer(), function (err) {
        if (err) {
            return console.log('Error on write: ', err.message);
        }
        console.log('Wrote: ', image.buffer());
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

    const fileExists = fs.existsSync(file);

    if (file && !fileExists) {
        console.error('No such file', file);
    }

    if (file && fileExists) {
        console.log('Inputing file', file);

        if (file.split('.').pop() == 'gif') {
            Image.fromGif(file)
                .then(writeImages);
        } else {
            Image.fromImageFile(file)
                .then(writeImage);
        }
        return;
    }

    console.log('Making random images');
    setInterval(function () {
        writeImage(Image.random());
    }, 2500);
});

if (printReturns) {
    let recentData = '';
    let printTimeout;
    port.on('data', function (data) {
        recentData += data.toString('utf8');

        if (recentData.length > 100) {
            printTimeout && clearTimeout(printTimeout);
            console.log('Data:', recentData);
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
