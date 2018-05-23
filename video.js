const exec = require('child_process').exec;
const spawn = require('child_process').spawn;
const P2J = require('pipe2jpeg');
const Deque = require('double-ended-queue');
const Image = require('./image.js');
const VLCControl = require('./vlc.js');
const RollingBuffer = require('./rolling_buffer.js');
const gridSize = require('./config/gridsize.js');
const sleep = require('./sleep.js');

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
     *  playOnScreen Whether or not to mirror in VLC. Defaults to true
     */
    constructor(videoPath, opts) {
        this.videoPath = videoPath;

        opts = opts || {};
        this.fps = opts.fps || 12;
        this.bufferSize = opts.bufferSize || 1; // frames in advance to hold a buffer
        this.bufferRatio = opts.bufferRatio || 1;
        this.frameBatchSize = opts.frameBatchSize || 12;
        if (opts.playOnScreen === undefined) {
            opts.playOnScreen = true;
        }
        this.playOnScreen = opts.playOnScreen;

        this.recylable = new Deque();

        this.bufferIntervalTime = 1000/this.fps/this.bufferRatio;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        this.length = await this.duration();
        this.buffer = new RollingBuffer(this.productionFunction.bind(this), {
            targetSize: this.bufferSize,
            skipPrebuffer: true
        });
        this.framesBeforePausing = 0;

        this.setUpGenerator();

        if (this.playOnScreen) {
            this.vlc = new VLCControl();
            await this.vlc.loadVideo(this.videoPath);
        }

        this.initialized = true;
    }

    async play(eachFrame) {
        await this.initialize();

        if (this.playOnScreen) {
            this.vlc.play();
        }
        this.startTime = new Date();
        this.playNextFrame(eachFrame);

        this.bufferInterval = setInterval(this.productionFunction.bind(this), this.bufferIntervalTime);
    }

    async playNextFrame(eachFrame) {
        const frame = await this.buffer.consume({
            sleepTime: 1000/this.fps/this.bufferRatio
        });

        if (frame === null) {
            return;
        }

        eachFrame(frame);
        this.recylable.push(frame);

        const realTime = new Date() - this.startTime;
        const lag = realTime - 1000*this.buffer.playHead / this.fps;
        console.log(Video.secondsToTimeString(this.buffer.playHead / this.fps) + ' (lag: ' + lag + 'ms)');

        if (this.buffer.playHead % this.fps == 0) {
            this.vlc.seek(this.buffer.playHead / this.fps);
        }

        this.playTimeout = setTimeout((function () {
            this.playNextFrame(eachFrame);
        }).bind(this), Math.max(0, 1000/this.fps - lag));
    }

    pause() {
        clearTimeout(this.playTimeout);
        clearInterval(this.bufferInterval);
        if (this.playOnScreen) {
            this.vlc.pause();
        }
    }

    /*
     * Sets up the process that extracts frames
     * Sends a SIGTSTP to it, so that it can be resumed when we want more frames
     * On output, it adds it to our buffer
     */
    setUpGenerator() {
        const cmd = 'ffmpeg';

        const args = [
            '-loglevel', 'error',
            '-i',  this.videoPath,
            '-ss', Video.secondsToTimeString(0),
            '-vf', 'fps='+this.fps + ', scale=' + gridSize + ':' + gridSize,
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            'pipe:1' // use STDOUT instead of a file
        ];

        this.p2j = new P2J();

        this.p2j.on('jpeg', this.onFrame.bind(this));

        const child = spawn(cmd, args);

        child.stderr.on('data', (data) => {
            console.error(`child stderr:\n${data}`);
    });

        child.on('close', () => {
            console.log('Closed')
    });

        child.stdout.pipe(this.p2j);

        this.child = child;

        // pause the child
        this.signalChild('SIGTSTP');
    }

    /*
     * Sends a signal to the child, and waits for it to go through
     */
    signalChild(signal) {
        // const oldKilledValue = this.child.killed;
        this.child.killed = false;
        while (!this.child.killed) {
            this.child.kill(signal);
        }
    }

    /*
     * Resumes our ffmpeg frame extraction process until enough frames have been produced
     */
    async productionFunction() {
        while (this.processing) { // forbid multiple production threads bogging things down
            await sleep(10);
        }

        const time = this.buffer.bufferHead / this.fps;
        if (time >= this.length) {
            return;
        }

        this.processing = true;
        this.framesBeforePausing = this.frameBatchSize;
        this.signalChild('SIGCONT');
    }

    /*
     * Called every time a frame comes from the child
     */
    async onFrame(data) {
        this.framesBeforePausing --;
        if (this.framesBeforePausing <= 0) {
            this.signalChild('SIGTSTP');
            this.processing = false;
        }

        const frame = await Image.fromRawData(data, {
            prescaled: false,
            recycle: this.recylable.length ? this.recylable.pop() : null // TODO: race condition?
        });
        this.buffer.enqueue(frame);
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
