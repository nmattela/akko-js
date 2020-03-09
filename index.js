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


/*
/!** @module @nmattela/akko-js *!/

/!** @class Abstract component class, inherited by SyncComponent and AsyncComponent *!/
export class Akkomponent {
    constructor() {

        /!*Creates an empty state object.*!/
        this.initState({});

        /!*Creates an empty props object.*!/
        this.props = {};

        /!*Creates an empty initial node.*!/
        this.node = document.createElement('div');

        /!*Creates an empty identifier. Will change to a unique identifier when component is initialized.*!/
        this.identifier = null;

        /!*Creates an empty children object.*!/
        this.children = {};
    }

    /!** @function Initializes the state. It wraps a Proxy over the given object. *!/
    initState(state) {
        this.state = new Proxy(state, {
            /!* When a new value is set, update is called. *!/
            set: (obj, prop, value) => {
                obj[prop] = value;
                return this.update();
            }
        })
    };

    /!** @function Converts the JSX found within the object to a DOM tree. *!/
    jsx(jsxObject) {
        /!*jsxObject is an object with the following attributes:
        * {
        *   elementName: Name of the element. Can be a string for standard HTML tags, or a class for components
        *   attributes: An object with all the JSX attributes listed inside
        *   children: An array of children (all the tags within two enclosing tags such as <div>...</div>), null if tag is self-closing
        * }
        * *!/

        /!*Very ugly, but essentially we're checking if the parent class of the parent class of the elementName (a given class, if it is not a string) is an Akkomponent*!/
        if(Object.getPrototypeOf(Object.getPrototypeOf(jsxObject.elementName)) === Akkomponent) {
            /!* If so, then we're dealing with a child component.
             * Get the key from the attributes object to identify the child component. *!/
            const key = jsxObject.attributes.key;

            /!* Check if the instance of the component is saved in our children object. *!/
            const maybeComponent = this.children[key];
            let component;

            /!* If it has a key and we already have an instance for this component, we work with the exisiting component *!/
            if(key && maybeComponent) {
                component = maybeComponent
            /!* Otherwise, we know the component does not yet exist... *!/
            } else {
                /!* ... in which case we create a new instance of it and assign a unique identifier *!/
                component = new jsxObject.elementName();
                component.identifier = Akkomponent.uniqueId++;

                if(key)
                    /!* If this child component has a key attribute, we can save it. *!/
                    this.children[key] = component;
                else
                    /!* Otherwise, there is no way for us to identify the child component, meaning that during the next re-render we will have to reinstanciate the component, so we warn the programmer about it. *!/
                    console.error(`Child component ${jsxObject.elementName.name} has no key attribute. The component can therefore not be saved and will lose its state at every re-render. If this component is an AsyncComponent, weird things might happen.`);
            }

            /!* Now that we have the component, we need to check if this child component is a SyncComponent or an AsyncComponent *!/
            if(component instanceof SyncComponent) {
                /!* If it's a SyncComponent, we assign the new attributes and ask it to return its new DOM node. *!/
                component.props = jsxObject.attributes;
                return component.createNode();
            } else if(component instanceof AsyncComponent) {
                /!* If it's an AsyncComponent, we create a "placeholder" called HookBinder.
                 * We also create an actor for this HookBinder and tell it to tell the AsyncComponent to update.*!/
                const hookBinder = new HookBinder(component);
                const hookBinderActor = system.spawn(hookBinder);
                hookBinder.actorInstance = hookBinderActor;
                component.actor.tell(jsxObject.attributes, hookBinderActor);

                /!* We return the HookBinder as a means to placehold the upcoming AsyncComponent DOM node. *!/
                return hookBinder
            }
        } else {
            /!* We are not dealing with a child component, but just with a regular HTML element. *!/

            /!* Create the element *!/
            const element = document.createElement(jsxObject.elementName);


            /!* Set all attributes to the DOM node.
             * Rename all the event attributes (that start with on) to the corresponding HTML events (same name but without the 'on') *!/
            Object.entries(jsxObject.attributes)
                .forEach(attribute => {
                    if(/^on/.test(attribute[0]))
                        element.addEventListener(attribute[0].toLowerCase().replace('on', ''), attribute[1]);
                    else
                        element.setAttribute(attribute[0], attribute[1])
                });

            /!* If it has children (not self-enclosing)... *!/
            if(jsxObject.children)
                /!* ... loop over them and append them to yourself *!/

                /!*Flat needed when dealing with JSX elements that were created by mapping over an array*!/
                jsxObject.children.flat().forEach(child => {
                    if(child instanceof Node) {
                        /!* Child is a node, so just append node as child *!/
                        element.appendChild(child)
                    } else if(child instanceof HookBinder) {
                        const placeholder = document.createElement('akkomponent');
                        placeholder.appendChild(child.akkomponent.node);
                        /!*Child is a HookBinder, so tell HookBinder that you are the element the child will have to mount on when child finished rendering*!/
                        placeholder.setAttribute('akkohook', child.akkomponent.identifier);
                        element.appendChild(placeholder);
                        child.actorInstance.tell({
                            type: 'hook',
                            value: placeholder
                        });
                    } else if(child !== null) {
                        /!* If child is a string, number, etc... just mount it as a text node. No nulls are mounted since null should be ignored *!/
                        element.appendChild(document.createTextNode(child));
                    }
                });
            return element;
        }
    }

    /!** @function Creates a node by calling this.render and saves it in this.node. It also returns the node. *!/
    createNode() {
        const newNode = this.render();

        const wrapper = document.createElement('akkomponent');
        wrapper.setAttribute('akkoid', this.identifier);

        if(newNode instanceof HookBinder) {
            this.node.setAttribute('akkohook', newNode.akkomponent.identifier);
            wrapper.appendChild(this.node)
            newNode.actorInstance.tell({
                type: 'hook',
                value: this.node
            })
        } else {
            wrapper.appendChild(newNode);
            this.node = newNode
        }

        return wrapper;
    }

    /!** @function Helper function to find the root of the provided newTree in the global tree *!/
    findRoot() {
        return Akkomponent.tree.querySelector(`[akkoid="${this.identifier}"]`)
    }

    /!** @abstract method that determines what should happen on an update *!/
    update() {
        return false;
    }

    /!** @abstract render method that __must__ be overridden *!/
    render() {
        return null;
    }
}

Akkomponent.uniqueId = 0;
Akkomponent.tree = null;

export class SyncComponent extends Akkomponent {
    constructor() {
        super();
    }

    update() {
        /!* Create a new tree. newTree === this.node *!/
        const newTree = this.createNode();

        /!* Find the root of this component in the DOM (find the DOM node with the same this.identifier) *!/
        const oldTree = this.findRoot();

        /!* Replace the old tree with the new tree *!/
        oldTree.parentNode.replaceChild(newTree, oldTree);

        /!* Return true to let the Proxy know we finished *!/
        return true
    }

    /!** @abstract render method that __must__ be overridden *!/
    render() {
        return super.render();
    }
}
export class AsyncComponent extends Akkomponent {
    constructor() {
        super();

        /!* Our AsyncComponent actor, an instance of Akkomunication *!/
        this.actor = system.spawn(new Akkommunication(this));
    }

    async createNode() {
        /!* createNode here is async, to allow the render method to be async *!/
        const newNode = await this.render();

        const wrapper = document.createElement('akkomponent');
        wrapper.setAttribute('akkoid', this.identifier);

        if(newNode instanceof HookBinder) {
            this.node.setAttribute('akkohook', newNode.akkomponent.identifier);
            wrapper.appendChild(this.node);
            newNode.actorInstance.tell({
                type: 'hook',
                value: this.node
            })
        } else {
            wrapper.appendChild(newNode);
            this.node = newNode
        }

        return wrapper;
    }

    update() {
        /!* Create a new tree. newTree === this.node *!/
        const newTree = this.createNode();

        /!* Find the root of this component in the DOM (find the DOM node with the same this.identifier) *!/
        const oldTree = this.findRoot();

        /!* Tell the HookBinder found at newTree that it should hook itself to the oldTree *!/
        newTree.actorInstance.tell({
            type: 'hook',
            value: oldTree
        });

        return true;
    }

    async render() {
        return null;
    }

}

class Akkommunication extends akkajs.Actor {
    constructor(akkomponent) {
        super();

        /!* Keep a reference to the associated AsyncComponent *!/
        this.akkomponent = akkomponent;
        this.receive = this.createNode.bind(this)
    }

    async createNode(props) {
        /!* When the message is received to create a new node, set the props of this.akkomponent to the new props and await the node creation
        *  this.sender in this case will be HookBinder. We tell HookBinder our child finished creating its node.*!/
        this.akkomponent.props = props;
        this.sender().tell({
            type: 'child',
            value: await this.akkomponent.createNode()
        })
    }
}

/!**@class Hook Binder essentially binds the result of calling createNode on an AsyncComponent to the part of the DOM it needs to be mounted on to.*!/
class HookBinder extends akkajs.Actor {
    constructor(akkomponent) {
        super();

        /!* We keep a reference to the associated AsyncComponent that needs to be rendered *!/
        this.akkomponent = akkomponent;

        /!* ActorInstance will keep a reference to the instance of the actor for HookBinder *!/
        this.actorInstance = null;

        this.receive = this.arrive.bind(this);

        /!* Here we will keep the child and hook saved whenever they arrive (a message has been sent to our actor). *!/
        this.child = null;
        this.hook = null;
    }

    /!**@function Called when either the child or hook has arrived. Child/Hook is saved and this.unify is called.*!/
    arrive(arrival) {
        if(!this[arrival.type]) {
            this[arrival.type] = arrival.value;
            this.unify()
        }
    }

    /!**@function When either child and/or hook arrived, we might be able to mount it to the tree.*!/
    unify() {
        /!*If we have the child, and the hook is still valid (is still connected to the DOM) AND we are able to access the parent node...*!/
        if(this.child && this.hook /!*&& this.hook.isConnected*!/ && this.hook.parentNode) {
            /!*...we can replace the hook (the placeholder) with our new DOM node*!/
            /!*This is called when the AsyncComponent itself updated its state (so where AsyncComponent plays the role of the root of the updated tree)*!/
            this.hook.parentNode.replaceChild(this.child, this.hook);
            this.akkomponent.node = this.child;
            this.self().kill()
        } else if(this.child) {
            /!*Otherwise, if we only know the child, we can search for the hook is the tree by looking for a DOM node with the akkohook attribute that has the same value as the AsyncComponent's identifier.*!/
            /!*This is called when the AsyncComponent was told by its parent to update*!/
            const hook = Akkomponent.tree.querySelector(`[akkohook="${this.akkomponent.identifier}"]`);
            if(hook) {
                /!*If the search was successful, we can replace the hook with the child.*!/
                hook.parentNode.replaceChild(this.child, hook);
            }
            this.akkomponent.node = this.child;
            this.self().kill()
        }
    }
}

/!** @export Main function that mounts the root of the app to the DOM. Currently, the root must be a SyncComponent*!/
export function render(docRoot, appRoot) {
    appRoot.identifier = Akkomponent.uniqueId++;
    const appTree = appRoot.createNode();
    docRoot.appendChild(appTree);
    Akkomponent.tree = docRoot
}*/
