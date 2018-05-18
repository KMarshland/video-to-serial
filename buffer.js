const sleep = require('./sleep');

class Buffer {

    /*
     * Constructor
     *
     * productionFunction: should return a promise to an array of objects to store in the buffer
     *
     * Options:
     *  targetSize: size beyond which it won't produce
     *  skipPrebuffer: whether to skip prebuffering on creation
     */
    constructor(productionFunction, opts) {
        opts = opts || {};

        this.targetSize = opts.targetSize || 50;

        this.bufferHead = 0;
        this.playHead = 0;
        this.buffer = {};

        this.productionFunction = productionFunction;

        if (!opts.skipPrebuffer) {
            this.prebuffer();
        }
    }

    /*
     * Prebuffers, so that there's some padding
     */
    async prebuffer() {
        while (this.bufferHead < this.targetSize && !this.done) {
            await this.produce();
        }
    }

    /*
     * Calls an async productionFunction, and stores the output in the buffer
     * Expects production function to return an array of objects to store in the buffer
     */
    async produce() {
        if (this.done) {
            return;
        }

        if (this.bufferHead - this.playHead >= this.targetSize) {
            return;
        }

        const outputs = await this.productionFunction();

        if (outputs.length === 0) {
            this.done = true;
            return;
        }

        for (let i = 0; i < outputs.length; i++) {
            this.buffer[this.bufferHead++] = output;
        }
    }

    /*
     * Consumes an object from the buffer
     * If there isn't anything in the buffer, then sleep until there is
     * If it can't produce any more, then resolve with null immediately
     *
     * Options:
     *  sleepTime: Time in ms to sleep if the buffer is empty. Defaults to 10ms
     */
    consume(opts) {
        opts = opts || {};

        return new Promise((async function (resolve, reject) {
            if (this.done && this.playHead >= this.bufferHead) {
                return resolve(null);
            }

            while (!this.buffer[this.playHead]) {
                await sleep(opts.sleepTime || 10);
            }

            const output = this.buffer[this.playHead];
            delete this.buffer[this.playHead];
            this.playHead++;

            resolve(output);
        }).bind(this));
    }

}

module.exports = Buffer;
