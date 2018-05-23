const process = require('process');
const spawn = require('child_process').spawn;
const sleep = require('./sleep.js');

const vlcExecutable = '/Applications/VLC.app/Contents/MacOS/VLC';

class VLCControl {

    /*
     * Options
     *  debug: prints all output
     *
     */
    constructor(opts) {
        opts = opts || {};
        this.debug = opts.debug;

        const child = spawn(vlcExecutable, [
            '--control',
            'rc',
            '--rc-fake-tty'
        ]);
        this.responded = false;

        child.stdout.on('data', (function (data) {
            if (this.debug) {
                process.stdout.write(data.toString('utf8'));
            }
            this.responded = true;

            const single = data.toString('utf8').split("\n")[0].trim();

            if (single == '1') {
                this.paused = false;
            } else if (single == '0') {
                this.paused = true;
            }
        }).bind(this));

        child.stderr.on('data', (function (data) {
            if (this.debug) {
                process.stderr.write(data.toString('utf8'));
            }
            this.responded = true;
        }).bind(this));

        this.child = child;
    }

    /*
     * Sends a command to VLC
     * See below for possible commands
     * Waits until it's open
     */
    sendCommand(command) {
        if (!this.responded) {
            setTimeout((function () {
                this.sendCommand(command);
            }).bind(this), 10);
            return;
        }

        this.responded = false;

        // make sure it ends in a newline
        if (command[command.length - 1] != "\n") {
            command += "\n";
        }

        process.stdout.write(command);
        this.child.stdin.write(command);
    }

    async loadVideo(videoPath) {
        this.sendCommand("add " + videoPath);
    }

    async play() {
        const playing = await this.isPlaying();

        if (!playing) {
            this.sendCommand("pause");
        }
    }

    async pause() {
        const playing = await this.isPlaying();

        if (playing) {
            this.sendCommand("pause");
        }
    }

    async isPlaying() {
        this.sendCommand('is_playing');

        while (!this.responded) {
            await sleep(0);
        }

        console.log(this.paused);

        return this.paused;
    }

    seek(seconds) {
        console.log('Seeking');
        this.sendCommand('seek ' + seconds);
    }
}

module.exports = VLCControl;

// const vlc = new VLCControl({
//     debug: true
// });
// vlc.loadVideo("/Users/kaimarshland/Desktop/Shrek.mp4");

/*
+----[ CLI commands ]
| add XYZ  . . . . . . . . . . . . . . . . . . . . add XYZ to playlist
| enqueue XYZ  . . . . . . . . . . . . . . . . . queue XYZ to playlist
| playlist . . . . . . . . . . . . .  show items currently in playlist
| search [string]  . .  search for items in playlist (or reset search)
| delete [X] . . . . . . . . . . . . . . . . delete item X in playlist
| move [X][Y]  . . . . . . . . . . . . move item X in playlist after Y
| sort key . . . . . . . . . . . . . . . . . . . . . sort the playlist
| sd [sd]  . . . . . . . . . . . . . show services discovery or toggle
| play . . . . . . . . . . . . . . . . . . . . . . . . . . play stream
| stop . . . . . . . . . . . . . . . . . . . . . . . . . . stop stream
| next . . . . . . . . . . . . . . . . . . . . . .  next playlist item
| prev . . . . . . . . . . . . . . . . . . . .  previous playlist item
| goto, gotoitem . . . . . . . . . . . . . . . . .  goto item at index
| repeat [on|off]  . . . . . . . . . . . . . .  toggle playlist repeat
| loop [on|off]  . . . . . . . . . . . . . . . .  toggle playlist loop
| random [on|off]  . . . . . . . . . . . . . .  toggle playlist random
| clear  . . . . . . . . . . . . . . . . . . . . .  clear the playlist
| status . . . . . . . . . . . . . . . . . . . current playlist status
| title [X]  . . . . . . . . . . . . . . set/get title in current item
| title_n  . . . . . . . . . . . . . . . .  next title in current item
| title_p  . . . . . . . . . . . . . .  previous title in current item
| chapter [X]  . . . . . . . . . . . . set/get chapter in current item
| chapter_n  . . . . . . . . . . . . . .  next chapter in current item
| chapter_p  . . . . . . . . . . . .  previous chapter in current item
|
| seek X . . . . . . . . . . . seek in seconds, for instance `seek 12'
| pause  . . . . . . . . . . . . . . . . . . . . . . . .  toggle pause
| fastforward  . . . . . . . . . . . . . . . . . . set to maximum rate
| rewind . . . . . . . . . . . . . . . . . . . . . set to minimum rate
| faster . . . . . . . . . . . . . . . . . .  faster playing of stream
| slower . . . . . . . . . . . . . . . . . .  slower playing of stream
| normal . . . . . . . . . . . . . . . . . .  normal playing of stream
| rate [playback rate] . . . . . . . . . .  set playback rate to value
| frame  . . . . . . . . . . . . . . . . . . . . . play frame by frame
| fullscreen, f, F [on|off]  . . . . . . . . . . . . toggle fullscreen
| info [X] . .  information about the current stream (or specified id)
| stats  . . . . . . . . . . . . . . . .  show statistical information
| get_time . . . . . . . . .  seconds elapsed since stream's beginning
| is_playing . . . . . . . . . . . .  1 if a stream plays, 0 otherwise
| get_title  . . . . . . . . . . . . . the title of the current stream
| get_length . . . . . . . . . . . .  the length of the current stream
|
| volume [X] . . . . . . . . . . . . . . . . . .  set/get audio volume
| volup [X]  . . . . . . . . . . . . . . .  raise audio volume X steps
| voldown [X]  . . . . . . . . . . . . . .  lower audio volume X steps
| achan [X]  . . . . . . . . . . . .  set/get stereo audio output mode
| atrack [X] . . . . . . . . . . . . . . . . . . . set/get audio track
| vtrack [X] . . . . . . . . . . . . . . . . . . . set/get video track
| vratio [X] . . . . . . . . . . . . . . .  set/get video aspect ratio
| vcrop, crop [X]  . . . . . . . . . . . . . . . .  set/get video crop
| vzoom, zoom [X]  . . . . . . . . . . . . . . . .  set/get video zoom
| vdeinterlace [X] . . . . . . . . . . . . . set/get video deinterlace
| vdeinterlace_mode [X]  . . . . . . .  set/get video deinterlace mode
| snapshot . . . . . . . . . . . . . . . . . . . . take video snapshot
| strack [X] . . . . . . . . . . . . . . . . .  set/get subtitle track
| hotkey, key [hotkey name]  . . . . . . . . . . simulate hotkey press
|
| vlm  . . . . . . . . . . . . . . . . . . . . . . . . .  load the VLM
| set [var [value]]  . . . . . . . . . . . . . . . . . set/get env var
| save_env . . . . . . . . . . . .  save env vars (for future clients)
| alias [cmd]  . . . . . . . . . . . . . . . . set/get command aliases
| description  . . . . . . . . . . . . . . . . .  describe this module
| license  . . . . . . . . . . . . . . . . print VLC's license message
| help, ? [pattern]  . . . . . . . . . . . . . . . . .  a help message
| longhelp [pattern] . . . . . . . . . . . . . . a longer help message
| lock . . . . . . . . . . . . . . . . . . . .  lock the telnet prompt
| logout . . . . . . . . . . . . . .  exit (if in a socket connection)
| quit . . . . . . . .  quit VLC (or logout if in a socket connection)
| shutdown . . . . . . . . . . . . . . . . . . . . . . .  shutdown VLC
 */