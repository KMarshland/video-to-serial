const Deque = require('double-ended-queue');
const sleep = require('./sleep');

class RollingBuffer {

    /*
     * Constructor
     *
     * productionFunction: should return a promise to an array of objects to store in the buffer
     *
     * Options:
     *  targetSize: size beyond which it won't produce
     */
    constructor(productionFunction, opts) {
        opts = opts || {};

        this.targetSize = opts.targetSize || 50;

        this.bufferHead = 0;
        this.playHead = 0;
        this.buffer = new Deque();

        this.productionFunction = productionFunction;
    }

    /*
     * Prebuffers, so that there's some padding
     */
    async prebuffer() {
        while (this.buffer.length < this.targetSize && !this.done) {
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

        if (this.buffer.length >= this.targetSize) {
            return;
        }

        const startTime = new Date();
        const outputs = await this.productionFunction(this.bufferHead);

        if (outputs === null) {
            this.done = true;
            return;
        }

        for (let i = 0; i < outputs.length; i++) {
            this.buffer.enqueue(outputs[i]);
        }

        this.bufferHead += outputs.length;

        console.log('Avg latency: ' + Math.round((new Date() - startTime) / outputs.length) + 'ms (' + outputs.length + ' items)');
    }

    /*
     * Enqueues a single item
     */
    enqueue(item) {
        this.buffer.enqueue(item);
        this.bufferHead++;
    }

    /*
     * Consumes an object from the buffer
     * If there isn't anything in the buffer, then sleep until there is
     * If it can't produce any more, then resolve with null immediately
     *
     * Options:
     *  sleepTime: Time in ms to sleep if the buffer is empty. Defaults to 10ms
     */
    async consume(opts) {
        opts = opts || {};

        if (this.done && this.buffer.length === 0) {
            return null;
        }

        while (this.buffer.length === 0) {
            await sleep(opts.sleepTime || 10);
        }

        this.playHead++;

        return this.buffer.dequeue();
    }

}

module.exports = RollingBuffer;
