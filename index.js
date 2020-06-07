import instantiateManager from "./Managers";
import akkajs from "akkajs";
import $worker from 'inline-web-worker';

export const system = akkajs.ActorSystem.create();

/** @class SyncComponent
 * Akkomponents are called composite components in the paper. I chose this name because composite components
 * are rather verbose.
 *
 * This class serves as the main class inherited by SyncComponent */
export class SyncComponent {
    constructor(props) {
        /*Creates an empty state object.*/
        this.initState({});

        /*Extract the provided proxy object from the props*/
        this.props = props;

        /*Still needs to be provided*/
        this.proxy = null
    }

    initState(state) {
        this.state = new Proxy(state, {
            /* When a new value is set, update is called. */
            set: (obj, prop, value) => {
                obj[prop] = value;
                return Akko.update(this);
            }})
    };

    componentWillMount() {
        return null;
    }

    componentDidMount() {
        return null;
    }

    componentWillUnmount() {
        return null;
    }

    componentDidUnmount() {
        return null;
    }

    componentWillUpdate(nextProps, nextState) {
        return null;
    }

    componentDidUpdate(prevProps, prevState) {
        return null;
    }

    render() {
        return null;
    }
}


/**@class AsyncComponent
 *
 * This is very similar to SyncComponent, except that it extends akkajs.Actor. Hence, lots of code duplication had to be
 * done due to the lack of interfaces in plain JavaScript
 *
 * */
export class AsyncComponent extends akkajs.Actor {
    constructor(props) {
        super();

        this.initState({});

        this.props = Object.fromEntries(Object.entries(props).filter(([key, value]) => key !== "proxy"));

        this.proxy = props.proxy;

        this.placeholder = {elementName: 'div', attributes: {}, children: []};

        this.receive = this.receive.bind(this);
    }

    /*Handles all incoming messages*/
    async receive(call) {
        switch (call.method) {
            case "mount": {
                this.sender().tell({
                    method: 'mount',
                    renderedElement: await this.render(),
                    placeholder: call.placeholder,
                    actor: call.actor
                });
                break;
            }
            case "receive": {
                this.props = call.props;
                this.sender().tell({
                    method: 'receive',
                    nextRenderedElement: await this.render(),
                    actor: call.actor
                });
                break;
            }
            case "event": {
                const event = call.event;
                switch(typeof event) {
                    //If object, then the special syntax to use Web Workers is requested
                    case "object": {

                        //Warning! This code is very ugly and at best experimental
                        const fn = event.fn;
                        const arg = event.arg;

                        /*Create an inline worker that gets the function with its arguments, deserializes them, executes
                        * them and returns the result.
                        * */
                        $worker().create(msg => {
                            const {fn, arg} = JSON.parse(msg.data);
                            const actualFun = eval(fn);
                            const actualArgs = JSON.parse(arg);
                            self.postMessage(JSON.stringify(actualFun(actualArgs)))
                        }).run(JSON.stringify({
                            //Serialize all content to JSON
                            fn: fn.toString(),
                            arg: JSON.stringify(arg)
                        })).then(json => {
                            const newState = JSON.parse(json.data);
                            /*Assign new value*/
                            Object.entries(newState).forEach(([key, value]) => this.state[key] = value)
                        });
                        break;
                    }
                    //If function, just execute it
                    case "function": event(); break;
                }
                break;
            }
        }
    }

    /*Initializes this.state as a proxy*/
    initState(state) {
        this.state = new Proxy(state, {
            /* When a new value is set, update is called. */
            set: (obj, prop, value) => {
                obj[prop] = value;
                return Akko.update(this);
            }})
    };

    componentWillMount() {
        return null;
    }

    componentDidMount() {
        return null;
    }

    componentWillUnmount() {
        return null;
    }

    componentDidUnmount() {
        return null;
    }

    componentWillUpdate(nextProps, nextState) {
        return null;
    }

    componentDidUpdate(prevProps, prevState) {
        return null;
    }

    componentIsPlaceheld() {
        return null;
    }

    async render() {
        return null;
    }
}


/**@class
 *
 * Fallback actor, as explained in the paper
 * It deals with all the events that would otherwise be handled by the (conceptual) main thread
 * */
class FallBack extends akkajs.Actor {
    constructor() {
        super();

        this.receive = this.receive.bind(this);
    }

    receive(call) {
        if(call.method === "event")
            call.event();
    }
}

/**@class Updater
 *
 * The special Updater class as explained in the paper
 * */
class Updater extends akkajs.Actor {
    constructor() {
        super();

        this.receive = this.receive.bind(this);

        this.buffer = [];

        this.cycle = null;
    }

    receive(call) {
        switch(call.method) {
            /*Initializes a interval loop that flushes the buffer every 16 ms (~ 60fps)*/
            case "start": {
                this.cycle = setInterval(() => {
                    this.buffer.forEach((component, index) => {
                        const rendered = component.render();
                        rendered.attributes = component.props;
                        component.proxy.receive(rendered, Akko.fallback);
                    });

                    this.buffer = [];
                }, 16);
                break;
            }
            case "enqueue": {
                const { component } = call;
                const alreadyInQueue = this.buffer.indexOf(component);

                if(alreadyInQueue === -1)
                    this.buffer.push(component);
                else
                    this.buffer[alreadyInQueue] = component;
                break;
            }
        }
    }
}

/**@export main object representing the framework to be used for initial mounting of the app to the DOM*/
const Akko = {
    SyncComponent: SyncComponent,
    AsyncComponent: AsyncComponent,
    updater: system.spawn(new Updater()),
    fallback: system.spawn(new FallBack()),
    mount: (rootComponent, rootNode) => {
        const rootManager = instantiateManager(rootComponent);
        const node = rootManager.mount(Akko.fallback);
        rootNode.appendChild(node);

        Akko.updater.tell({method: 'start'});

        return rootManager.getPublicInstance();
    },
    update: component => {

        Akko.updater.tell({method: 'enqueue', component});

        return true;
    }
};

export default Akko;