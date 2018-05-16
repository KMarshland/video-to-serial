const Image = require('./image.js');
const sleep = require('./sleep');

class Video {

    /*
     * Returns a promise of an image of the video at the given time
     * Expects time to be in seconds
     */
    static videoFrame(videoPath, time) {
        return new Promise(function (resolve, reject) {
            resolve(Image.random());
        });
    }

    /*
     * Takes in a video path, and calls eachFrame on each frame
     * eachFrame is called such that at the same rate as realtime video playback
     * eachFrame is given either an Image object or null. Null means playback is complete
     *
     * Options:
     *  fps Frames per second
     *  bufferSize How many frames to keep in the buffer
     *  bufferRatio How much more frequently to check the buffer than checking video play
     */
    static async fromFile(videoPath, eachFrame, opts) {
        opts = opts || {};
        const fps = opts.fps || 24;
        const bufferSize = opts.bufferSize || 50; // frames in advance to hold a buffer
        const bufferRatio = opts.bufferRatio || 4;

        const buffer = [];
        let bufferHead = 0;
        let playbackHead = 0;

        // TODO: get length of video in seconds
        const videoLength = 10;
        const maxHead = videoLength * fps;

        for (let i = 0; i < Math.min(bufferSize, maxHead); i++) {
            const frame = await Video.videoFrame(videoPath, bufferHead / fps);
            buffer.push(frame);
            bufferHead++;
        }

        // continue buffering
        const bufferInterval = setInterval(async function () {
            // don't prebuffer too far
            if (bufferHead - playbackHead >= bufferSize - 1) {
                return;
            }

            const frame = await Video.videoFrame(videoPath, bufferHead / fps);
            buffer[bufferHead%bufferSize] = frame;
            bufferHead++;

            if (bufferHead >= maxHead) {
                clearInterval(bufferInterval);
            }
        }, 1000/fps/bufferRatio);

        const startTime = new Date();

        // play the movie
        // TODO: instead of an interval, set timeouts so that it can recover from slowness more easily
        const playInterval = setInterval(async function () {
            if (playbackHead >= maxHead) {
                const elapsed = new Date() - startTime;
                console.log('Took ' + Math.round(elapsed/100)/10 + 's (video ' + videoLength + 's)')
                clearInterval(playInterval);
                eachFrame(null);
                return;
            }

            // wait for there to be stuff in the buffer
            while (playbackHead == bufferHead) {
                await sleep(1000/fps/bufferRatio)
            }

            const frame = buffer[playbackHead++ % bufferSize];
            eachFrame(frame);
        }, 1000/fps);
    }

}

module.exports = Video;
