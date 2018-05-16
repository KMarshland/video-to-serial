const printPartial = false;

function test(onFunction, opts) {
    opts = opts || {};
    const brightness = opts.brightness || 1;
    const brightnessBits = opts.brightnessBits || 1;

    const maxBrightness = Math.pow(2, brightnessBits) - 1;

    let onTimes = 0;
    let toPrint = '';
    for (let i = 0; i < maxBrightness; i++) {
        if (onFunction(brightness, i, brightnessBits)) {
            onTimes ++;
            toPrint += '1';
        } else {
            toPrint += '0';
        }
    }
    const message = 'Brightness ' + brightness + ' on ' + onTimes + ' times (bits: ' + brightnessBits + ')';
    if (onTimes != brightness) {
        console.error(message);
        console.log(toPrint);
    }
    return onTimes == brightness;
}

function verify(onFunction) {
    let succeeded = true;
    for (let i = 0; i <= 3; i++) {
        const brightnessBits = Math.pow(2, i);

        for (let brightness = 0; brightness < Math.pow(2, brightnessBits); brightness++) {
            succeeded = succeeded && test(onFunction, {
                brightness: brightness,
                brightnessBits: brightnessBits
            });
            if (!succeeded) {
                break;
            }
        }
    }
    return succeeded;
}

let dist = {};
const succeeded = verify(function (brightness, i, brightnessBits) {

    if (!dist[brightnessBits]) {
        dist[brightnessBits] = {};
    }

    if (!dist[brightnessBits][brightness]) {
        dist[brightnessBits][brightness] = generateDistribution(brightness, Math.pow(2, brightnessBits) - 1);
    }

    return (dist[brightnessBits][brightness] >> i) & 1;
});

console.log(succeeded);

function generateDistribution(brightness, length, depth) {
    depth = depth || 0;

    let tabs = '';
    for (let i = 0; i < depth; i++) {
        tabs += '\t';
    }
    printPartial && console.log(tabs + "B: " + brightness + "; L: " + length);

    if (brightness === 0) {
        printPartial && console.log(tabs + '  R: 0');
        return 0b0;
    }

    if (length == 1) {
        printPartial && console.log(tabs + '  R: 1');
        return 0b1;
    }

    let anchor = Math.floor(length/2);
    let leftBits = Math.floor(brightness/2);

    let left = generateDistribution(leftBits, anchor, depth + 1); // put one bit to the left of the anchor
    let right = generateDistribution(brightness - leftBits, length - anchor, depth + 1); // put one bit to the left of the anchor

    printPartial && console.log(tabs + '  A: ' + anchor + '; L: ' + pad(left.toString(2), length) + '; R: ' + pad(right.toString(2), length));

    return (left << Math.ceil(length/2)) | right;
}

function printDistribution(i, length) {
    console.log('0b' + pad(generateDistribution(i, length).toString(2), length));
}

function pad(num, size) {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
}
