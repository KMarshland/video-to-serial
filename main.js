
const SerialPort = require('serialport');
const Image = require('./image.js');

const baud = 9600;
const portLocation = '/dev/cu.SLAB_USBtoUART';

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

port.on('open', function() {
    Image.fromImageFile("./images/arrow.jpg")
        .then(writeImage);
});

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
