const exec = require('child_process').exec;
const Image = require('./image.js');
const sleep = require('./sleep');

class Video {

    /*
     * Returns a promise of an image of the video at the given time
     * Expects time to be in seconds
     */
    static videoFrame(videoPath, time) {
        return new Promise(function (resolve, reject) {
            const start = Video.secondsToTimeString(time);
            const outfile = './tmp/video-frame-' + Math.floor(Math.random() * 1e12) + '.png';
            const cmd = 'ffmpeg -loglevel error -i ' + videoPath + ' -ss ' + start + ' -vframes 1 ' + outfile;

            const startTime = new Date();
            exec(cmd, async function(err, stdout, stderr) {
                if (err) {
                    reject(err);
                    return;
                }

                if (stderr) {
                    reject(stderr);
                    return;
                }

                const frame = await Image.fromImageFile(outfile, {
                    removeAfter: true
                });
                console.log(Math.round(new Date() - startTime) + 'ms to generate frame');
                resolve(frame);
            });
        });
    }

    /*
     * Returns a promise of the video length in seconds
     */
    static duration(videoPath) {
        return new Promise(function (resolve, reject) {
            const cmd = 'ffmpeg -i ' + videoPath + ' 2>&1 | grep "Duration"';

            exec(cmd, function(err, stdout, stderr) {
                if (err) {
                    reject(err);
                    return;
                }

                if (stderr) {
                    reject(stderr);
                    return;
                }

                const durationPattern = /Duration: (\d+):(\d+):(\d+)\.(\d+)/;
                if (!durationPattern.test(stdout)) {
                    console.log(stdout);
                    reject('Failed to extract duration');
                    return;
                }

                const parts = stdout.match(durationPattern);
                const hours = parseFloat(parts[1]);
                const minutes = parseFloat(parts[2]);
                const seconds = parseFloat(parts[3]) + parseFloat('0.' + parts[4]);

                resolve(seconds + 60*minutes + 60*60*hours);
            });

        });
    }

    /*
     * Takes a number time, and turns it into a string like 01:02:03.435
     */
    static secondsToTimeString(absSeconds) {
        const ms = Math.floor(1000 * (absSeconds - Math.floor(absSeconds)));
        const seconds = Math.floor(absSeconds % 60);
        const minutes = Math.floor((absSeconds / 60) % 60);
        const hours = Math.floor(absSeconds / 60 / 60);

        function pad(num, size) {
            let s = num + "";
            while (s.length < size) s = "0" + s;
            return s;
        }

        return pad(hours, 2) + ':' + pad(minutes, 2) + ':' + pad(seconds, 2) + '.' + pad(ms, 3);
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

        const videoLength = await Video.duration(videoPath);
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
