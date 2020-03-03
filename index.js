import akkajs from 'akkajs';

const system = akkajs.ActorSystem.create();

let uniqueId = 0;
export default function _jsx(jsxObject) {
    if(Object.getPrototypeOf(jsxObject.elementName) instanceof Akkomponent) {
        const component = jsxObject.elementName;

        if(!component.identifier) {
            uniqueId++;
            component.identifier = uniqueId;
        }

        if(Object.getPrototypeOf(component) instanceof SyncComponent) {
            component.props = jsxObject.attributes;
            return component.createNode();
        } else if(Object.getPrototypeOf(component) instanceof AsyncComponent) {
            const hookBinder = new HookBinder(component);
            const hookBinderActor = system.spawn(hookBinder);
            hookBinder.actorInstance = hookBinderActor;
            component.actor.tell(jsxObject.attributes, hookBinderActor);
            return hookBinder
        }
    } else {
        const element = document.createElement(jsxObject.elementName);

        Object.entries(jsxObject.attributes)
            .forEach(attribute => {
                if(/^on/.test(attribute[0]))
                    element.addEventListener(attribute[0].toLowerCase().replace('on', ''), attribute[1]);
                else
                    element.setAttribute(attribute[0], attribute[1])
            });

        if(jsxObject.children)
            jsxObject.children.flat().forEach(child => {
                if(child instanceof Node) {
                    element.appendChild(child)
                } else if(child instanceof HookBinder) {
                    child.akkomponent.node.setAttribute('akkohook', child.akkomponent.identifier);
                    element.appendChild(child.akkomponent.node);
                    child.actorInstance.tell({
                        type: 'hook',
                        value: child.akkomponent.node
                    });
                } else if(child !== null) {
                    element.appendChild(document.createTextNode(child));
                }
            });
        return element;
    }
}

export class Akkomponent {
    constructor() {
        this.type = 'none';
        this.initState({});
        this.children = {};
        this.props = {};
        this.node = document.createElement('div');
        this.identifier = null;
    }

    initState(state) {
        this.state = new Proxy(state, {
            set: (obj, prop, value) => {
                obj[prop] = value;
                return update(this);
            }
        })
    };

    createNode() {
        this.node = this.render();
        this.node.setAttribute('akkoid', this.identifier);
        return this.node;
    }

    render() {
        return null;
    }
}

export class SyncComponent extends Akkomponent {
    constructor() {
        super();
        this.type = 'sync'
    }
}
export class AsyncComponent extends Akkomponent {
    constructor() {
        super();
        this.type = 'async';

        this.actor = system.spawn(new Akkommunication(this));
    }

    async createNode() {
        this.node = await this.render();
        this.node.setAttribute('akkoid', this.identifier);
        return this.node;
    }

    async render() {
        return null;
    }

}

class Akkommunication extends akkajs.Actor {
    constructor(akkomponent) {
        super();
        this.akkomponent = akkomponent;
        this.receive = this.createNode.bind(this)
    }

    async createNode(props) {
        this.akkomponent.props = props;
        this.sender().tell({
            type: 'child',
            value: await this.akkomponent.createNode()
        })
    }
}

//The Cash Desk, where child and parent meet ;p
class HookBinder extends akkajs.Actor {
    constructor(akkomponent) {
        super();

        this.akkomponent = akkomponent;

        this.receive = this.arrive.bind(this);

        this.actorInstance = null;

        this.child = null;
        this.hook = null;

        this.observers = {
            child: [],
            hook: []
        }
    }

    on(event, callback) {
        this.observers[event].push(callback)
    }

    arrive(arrival) {
        if(!this[arrival.type]) {
            this[arrival.type] = arrival.value;
            this.observers[arrival.type].forEach(cb => cb(arrival.value));
            this.unify()
        }
    }

    unify() {
        if(this.child && this.hook && this.hook.isConnected && this.hook.parentNode) {
            this.hook.parentNode.replaceChild(this.child, this.hook);
            this.self().kill()
        } else if(this.child) {
            const hook = tree.querySelector(`[akkohook="${this.akkomponent.identifier}"]`);
            if(hook) {
                hook.parentNode.replaceChild(this.child, hook);
            }
            this.self().kill()
        }
    }
}

let tree;

function findRoot(newTree) {
    return tree.querySelector(`[akkoid="${newTree.getAttribute('akkoid')}"]`)
}

function update(component) {

    let newTree = _jsx({
        elementName: component,
        attributes: component.props,
        children: null
    });

    if(component.type === 'sync') {
        const oldTree = findRoot(newTree);
        oldTree.parentNode.replaceChild(newTree, oldTree)
    } else {
        const oldTree = findRoot(newTree.akkomponent.node);
        newTree.actorInstance.tell({
            type: 'hook',
            value: oldTree
        });
    }

    return true
}

export function render(docRoot, appRoot) {
    const appTree = _jsx({
        elementName: appRoot,
        attributes: {},
        children: null
    });
    docRoot.appendChild(appTree);
    tree = docRoot
}