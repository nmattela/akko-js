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

        this.actor = system.spawn(new AsyncComponentDelegator(this))
        this.placeholder = {elementName: 'div', attributes: {}, children: []}
    }

    componentIsPlaceheld() {
        return null;
    }

    async render() {
        return null;
    }
}

/**@actor AsyncComponentDelegator
 * */
class AsyncComponentDelegator extends akkajs.Actor {
    constructor(akkomponent) {
        super();

        this.akkomponent = akkomponent;
        this.receive = this.receive.bind(this);
    }

    async receive(call) {
        switch(call.method) {
            case 'receive': {
                this.akkomponent.props = call.props;
                this.sender().tell({
                    method: 'receive',
                    nextRenderedElement: await this.akkomponent.render()
                });
                break;
            }
            case 'mount': {
                this.sender().tell({
                    method: 'mount',
                    renderedElement: await this.akkomponent.render(),
                    publicInstance: this.akkomponent,
                    placeholder: call.placeholder
                });
                break;
            }
        }
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


/*
* Praat over CRUIMel (recap) en async CRUIMel + actors
* Dan zeggen hoe je het implementeerd
* Regels van hoe componenten gemaakt worden en hoe die geimplementeerd zijn
* Regels over wat wel en niet kan
* Hoeft geen code van mijn implementatie te laten zien
* Future work (wat ik nog ga doen, web workers, per instatie asynchroon kunnen maken, implementatie in React)
* */