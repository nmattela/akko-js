import akkajs from 'akkajs';

const system = akkajs.ActorSystem.create();

let uniqueId = 0;
export default function _jsx(jsxObject) {
    if(!(typeof jsxObject === 'object')) {
        return jsxObject;
    } else if(!jsxObject.elementName || !(typeof jsxObject.elementName === 'object')) {
        const element = document.createElement(jsxObject.elementName);

        Object.entries(jsxObject.attributes)
            .forEach(attribute => {
                if(/^on/.test(attribute[0]))
                    element.addEventListener(attribute[0].toLowerCase().replace('on', ''), attribute[1]);
                else
                    element.setAttribute(attribute[0], attribute[1])
            });

        if(jsxObject.children)
            jsxObject.children.forEach(child => {
                if(child instanceof Node) {
                    element.appendChild(child)
                } else if(typeof child === 'object') {
                    child.akkomponent.node.setAttribute('akkohook', child.akkomponent.identifier);
                    element.appendChild(child.akkomponent.node);
                    child.actorInstance.tell({
                        type: 'parent',
                        value: child.akkomponent.node
                    });
                } else {
                    element.innerHTML = child;
                }
            });
        return element;
    } else {
        const child = jsxObject.elementName;
        if(!child.identifier) {
            uniqueId++;
            child.identifier = uniqueId
        }
        if(child.type === 'sync') {
            child.props = jsxObject.attributes;
            return child.createNode();
        } else {
            const cashDesk = new CashDesk(child);
            const cashDeskActor = system.spawn(cashDesk);
            cashDesk.actorInstance = cashDeskActor;
            child.actor.tell(jsxObject.attributes, cashDeskActor);
            return cashDesk
        }
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

}

class Akkommunication extends akkajs.Actor {
    constructor(akkomponent) {
        super();
        this.akkomponent = akkomponent;
        this.receive = this.createNode.bind(this)
    }

    createNode(props) {
        this.akkomponent.props = props;
        this.akkomponent.createNode();
        this.sender().tell({
            type: 'child',
            value: this.akkomponent.node
        })
    }
}

//The Cash Desk, where child and parent meet ;p
class CashDesk extends akkajs.Actor {
    constructor(akkomponent) {
        super();

        this.akkomponent = akkomponent;

        this.receive = this.arrive.bind(this);

        this.actorInstance = null;

        this.child = null;

        this.observers = {
            child: []
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
        if(this.child) {
            const hook = tree.querySelector(`[akkohook="${this.akkomponent.identifier}"]`);
            if(hook)
                hook.parentNode.replaceChild(this.child, hook);
            this.self().kill()
        }
    }
}

let tree;

function findRoot(tree, newTree) {
    const akkoid = newTree.getAttribute('akkoid');
    function rec(prevRoot, currRoot) {
        if(currRoot.getAttribute('akkoid') === akkoid)
            return {
                root: prevRoot,
                entry: currRoot
            };
        else {
            const children = [].slice.call(currRoot.children);
            for(let i = 0; i < children.length; i++) {
                const res = rec(currRoot, children[i]);
                if(res) return res;
            }
        }
    }

    const appTree = tree.firstChild;
    return rec(tree, appTree);
}

function update(component) {

    let newTree = _jsx({
        elementName: component,
        attributes: component.props,
        children: null
    });

    if(component.type === 'sync') {
        const oldTree = findRoot(tree, newTree);
        oldTree.root.replaceChild(newTree, oldTree.entry);
    } else {
        const oldTree = findRoot(tree, newTree.akkomponent.node);
        newTree.actorInstance.tell({
            type: 'parent',
            value: {
                element: oldTree.root,
                placeholder: oldTree.entry
            }
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