import instantiateComponent from "./ProxyComponent";
import akkajs from "akkajs";

export const system = akkajs.ActorSystem.create();

/** @class (abstract) Main component class, inherited by SyncComponent and AsyncComponent */
class Akkomponent {
    constructor(props) {
        /*Creates an empty state object.*/
        this.initState({});

        /*Creates an empty props object.*/
        this.props = props;
    }

    initState(state) {
        this.state = new Proxy(state, {
            /* When a new value is set, update is called. */
            set: (obj, prop, value) => {
                obj[prop] = value;
                return Akko.update();
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
                this.sender().tell({method: 'receive', nextRenderedElement: await this.akkomponent.render()});
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
    element: null,
    containerNode: null,
    mount: (element, containerNode) => {

        /*Save root and containing node for later use*/
        Akko.element = element;
        Akko.containerNode = containerNode;

        const rootComponent = instantiateComponent(element);
        const node = rootComponent.mount();

        containerNode.appendChild(node);
        node._internalInstance = rootComponent;

        return rootComponent.getPublicInstance();
    },
    unmount: containerNode => {
        const node = containerNode.firstChild;
        const rootComponent = node._internalInstance;

        rootComponent.unmount();
        containerNode.innerHTML = '';
    },
    update: () => {
        const prevNode = Akko.containerNode.firstChild;
        if(prevNode) {
            /*If there's already something mounted*/
            const prevRootComponent = prevNode._internalInstance;
            const prevElement = prevRootComponent.currentElement;

            /*Do a quick diff.*/
            if(prevElement.elementName === Akko.element.elementName) {
                /*If the types are the same, propagate an update down the DOM tree*/
                prevRootComponent.receive(Akko.element);
            } else {
                /*Otherwise, wipe out what's currently mounted and mount again*/
                this.unmount(Akko.containerNode);
                Akko.mount(Akko.element, Akko.containerNode)
            }
            return true;
        } else {
            return false;
        }
    }
};

export default Akko;