import instantiateComponent from "./ProxyComponent";
import akkajs from "akkajs";
import $worker from 'inline-web-worker';

export const system = akkajs.ActorSystem.create();

/** @class (abstract) Main component class, inherited by SyncComponent and AsyncComponent */
class Akkomponent {
    constructor(props) {
        /*Creates an empty state object.*/
        this.initState({});

        this.props = Object.fromEntries(Object.entries(props).filter(([key, value]) => key !== "proxy"));

        this.proxy = props.proxy;
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

export class SyncComponent extends Akkomponent {
    constructor(props) {
        super(props);
    }

}

export class AsyncComponent extends akkajs.Actor {
    constructor(props) {
        super();

        this.initState({});

        this.props = Object.fromEntries(Object.entries(props).filter(([key, value]) => key !== "proxy"));

        this.proxy = props.proxy;

        this.placeholder = {elementName: 'div', attributes: {}, children: []};

        this.receive = this.receive.bind(this);
    }

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

                switch(typeof call.event) {
                    case "object": {
                        const fn = call.event.fn;
                        const arg = call.event.arg;

                        $worker().create(msg => {
                            const {fn, arg} = JSON.parse(msg.data);
                            const actualFun = eval(fn);
                            const actualArgs = JSON.parse(arg)
                            self.postMessage(JSON.stringify(actualFun(actualArgs)))
                        }).run(JSON.stringify({
                            fn: fn.toString(),
                            arg: JSON.stringify(arg)
                        })).then(json => {
                            const newState = JSON.parse(json.data);
                            Object.entries(newState).forEach(([key, value]) => this.state[key] = value)
                        });
                        break;
                    }
                    case "function": call.event(); break;
                }

                break;
            }
        }
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

    componentIsPlaceheld() {
        return null;
    }

    async render() {
        return null;
    }
}

class UpdateCycleActor extends akkajs.Actor {
    constructor() {
        super();

        this.receive = this.receive.bind(this);

        this.queue = [];

        this.cycle = null;
    }

    receive(call) {
        switch(call.method) {
            case "start": {
                this.cycle = setInterval(() => {
                    this.queue.forEach((component, index) => {
                        const rendered = component.render();
                        rendered.attributes = component.props;
                        component.proxy.receive(rendered, null);
                    });

                    this.queue = [];
                }, 16);
                break;
            }
            case "enqueue": {
                const { component } = call;
                const alreadyInQueue = this.queue.indexOf(component);

                if(alreadyInQueue === -1)
                    this.queue.push(component);
                else
                    this.queue[alreadyInQueue] = component;
                break;
            }
        }
    }
}

/**@export main object to be used for initial mounting of the app to the DOM*/
const Akko = {
    cycle: system.spawn(new UpdateCycleActor()),
    mount: (element, containerNode) => {
        const rootComponent = instantiateComponent(element);
        const node = rootComponent.mount(null);
        containerNode.appendChild(node);

        Akko.cycle.tell({method: 'start'})

        return rootComponent.getPublicInstance();
    },
    update: component => {

        Akko.cycle.tell({method: 'enqueue', component});

        return true;
    }
};

export default Akko;