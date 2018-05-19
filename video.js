const exec = require('child_process').exec;
const Image = require('./image.js');
const RollingBuffer = require('./rolling_buffer.js');

class Video {

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
    constructor(videoPath, opts) {
        this.videoPath = videoPath;

        opts = opts || {};
        this.fps = opts.fps || 10;
        this.bufferSize = opts.bufferSize || 50; // frames in advance to hold a buffer
        this.bufferRatio = opts.bufferRatio || 1;
        this.frameBatchSize = opts.frameBatchSize || 10;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        this.length = await this.duration();
        this.buffer = new RollingBuffer(this.productionFunction.bind(this), {
            targetSize: this.bufferSize,
            skipPrebuffer: false
        });

        await this.buffer.prebuffer();

        this.initialized = true;
    }

    async play(eachFrame) {
        await this.initialize();

        this.startTime = new Date();
        this.playNextFrame(eachFrame);

        this.bufferInterval = setInterval((function () {
            this.buffer.produce();
        }).bind(this), 1000/this.fps/this.bufferRatio);
    }

    async playNextFrame(eachFrame) {
        const frame = await this.buffer.consume({
            sleepTime: 1000/this.fps/this.bufferRatio
        });

        if (frame === null) {
            return;
        }

        eachFrame(frame);

        const realTime = new Date() - this.startTime;
        const lag = realTime - 1000*this.buffer.playHead / this.fps;
        console.log(Video.secondsToTimeString(this.buffer.playHead / this.fps) + ' (lag: ' + lag + 'ms)');

        this.playTimeout = setTimeout((function () {
            this.playNextFrame(eachFrame);
        }).bind(this), Math.max(0, 1000/this.fps - lag));
    }

    pause() {
        clearInterval(this.playTimeout);
        clearInterval(this.bufferInterval);
    }

    /*
     * Returns a promise to a
     */
    productionFunction(head) {
        return new Promise((async function (resolve, reject) {
            const time = head / this.fps;
            if (time >= this.length) {
                return resolve(null);
            }

            const num = this.frameBatchSize;

            const start = Video.secondsToTimeString(time);
            const duration = Video.secondsToTimeString(num / this.fps);

            const outfile = './tmp/video-frame-' + Math.floor(Math.random() * 1e12) + '-%d.png';
            const cmd = 'ffmpeg -loglevel error ' +
                '-i ' + this.videoPath +
                ' -ss ' + start +
                ' -vf fps=' + this.fps +
                ' -vf scale=8:8' +
                ' -t ' + duration +
                ' ' + outfile;

            exec(cmd, async function(err, stdout, stderr) {
                if (err) {
                    reject(err);
                    return;
                }

                if (stderr) {
                    reject(stderr);
                    return;
                }

                const frames = [];
                for (let i = 0; i < num; i++) {
                    const frame = await Image.fromImageFile(outfile.replace('%d', i+1), {
                        removeAfter: true,
                        prescaled: true
                    });

                    frames.push(frame);
                }


                resolve(frames);
            });
        }).bind(this));
    }

    /*
     * Returns a promise of the video length in seconds
     */
    duration() {
        return new Promise((function (resolve, reject) {
            const cmd = 'ffmpeg -i ' + this.videoPath + ' 2>&1 | grep "Duration"';

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

        }).bind(this));
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

}

module.exports = Video;
