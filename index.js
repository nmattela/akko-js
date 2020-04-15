import instantiateComponent from "./ProxyComponent";
import akkajs from "akkajs";

export const system = akkajs.ActorSystem.create();

/** @class (abstract) Main component class, inherited by SyncComponent and AsyncComponent */
class Akkomponent {
    constructor(props) {
        /*Creates an empty state object.*/
        this.initState({});

        /*Creates an empty props object.*/
        this.props = Object.fromEntries(Object.entries(props).filter(prop => prop[0] !== "proxy"));

        /*Gets the ProxyComponent*/
        this.proxy = props.proxy
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

export class AsyncComponent extends Akkomponent {
    constructor(props) {
        super(props);

        this.worker = new Worker('AsyncComponentDelegator.worker.js');
        this.worker.postMessage({
            method: 'init',
            akkomponent: JSON.parse(JSON.stringify(this))
        });

        this.placeholder = {elementName: 'div', attributes: {}, children: []}
    }

    componentIsPlaceheld() {
        return null;
    }

    async render() {
        return null;
    }
}

/**@export main object to be used for initial mounting of the app to the DOM*/
const Akko = {
    mount: (element, containerNode) => {
        const rootComponent = instantiateComponent(element);
        const node = rootComponent.mount();

        containerNode.appendChild(node);

        return rootComponent.getPublicInstance();
    },
    update: component => {
        const rendered = component.render();
        component.proxy.receive(rendered);

        return true;
    }
};

export default Akko;