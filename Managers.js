import akkajs from 'akkajs';
import {AsyncComponent, SyncComponent, system} from "./index";
import 'geteventlisteners';

/**
 * Code based on the React Implementation Notes https://reactjs.org/docs/implementation-notes.html
 *
 * This code is similar (but not identical) to the implementation of React prior to version 16 (Akko does not use fibers)
 * It is based on Paul O'Shannessy's "Building React from Scratch" talk
 * */

/** @class Manager (abstract)
 * The Manager serves as the representer for components in the backend of the library, hidden from the user.
 * It manages information such as:
 * - The current element (The object returned from _jsx)
 * - The Manager of the child components for composite components
 * - The instance of a composite component
 * */
class Manager {
    constructor(element) {
        /**@property {object | string | number} Stores a JSX object or a piece of innerHTML
         *
         * A JSX object looks as follows:
         * {
         *     elementName: {class | string} The type of the element, such as "div" or "button". When the type is an Akkomponent, you get its class
         *     attributes: {object} The JSX attributes, also known as props
         *     children: {Array | null} An array of children defined between the enclosing tags (<div></div>), or null if tag is self-closing (<div />)
         * }
         * */
        this.currentElement = element;
    }

    /**@abstract Gets the public instance (composite component instance or DOM node)*/
    getPublicInstance() {
        return null;
    }

    /**@abstract Gets the "platform specific" node (in our case a DOM node)*/
    getHostNode() {
        return null;
    }

    /**@abstract Instructions on what to do when mounting the component/DOM node
     *
     * @param actor {Actor}: The last seen asynchronous component
     * */
    mount(actor) {
        return null;
    }

    /**@abstract Instructions on what to do when unmounting the component/DOM node*/
    unmount() {
        return null;
    }

    /**@abstract Instructions on what to do when receiving an update
     *
     * @param nextElement {object}: A potentially updated JSX object that should be diffed
     * @param actor {Actor}: The last seen asynchronous component
     *
     * */
    receive(nextElement, actor) {
        return null;
    }
}

/**@class (abstract) CompositeManager
 * This is the supperclass for both synchronous and asynchronous components
 * */
class CompositeManager extends Manager{
    constructor(element) {
        super(element);

        /**@property The Manager that we received from our render method*/
        this.renderedComponent = null;
        /**@property The actual composite component instance created during mount*/
        this.publicInstance = null;
    }

    getPublicInstance() {
        return this.publicInstance
    }

    getHostNode() {
        return this.renderedComponent.getHostNode();
    }

    /**@method Compare differences between old and new element, and replace if necessary*/
    diff(nextRenderedElement, actor) {
        /*The Manager returned from our render method*/
        const prevRenderedComponent = this.renderedComponent;
        /*The JSX object of our rendered Manager*/
        const prevRenderedElement = prevRenderedComponent.currentElement;

        if(Array.isArray(prevRenderedElement)) {
            /*If prevRenderedComponent is an ArrayManager*/
            prevRenderedComponent.receive(nextRenderedElement, actor)
        } else if(prevRenderedElement.elementName === nextRenderedElement.elementName) {
            /*If the element names are the same, there is no need to remount the current DOM subtree*/
            prevRenderedComponent.receive(nextRenderedElement, actor);
        } else {
            /*Otherwise, we should remount it*/
            /*Gets the node currently inside the DOM tree*/
            const prevNode = prevRenderedComponent.getHostNode();

            /*Unmount the old subtree*/
            prevRenderedComponent.unmount();
            /*Create a new Manager for the new result of calling render and mount it*/
            const nextRenderedComponent = instantiateManager(nextRenderedElement);
            const nextNode = nextRenderedComponent.mount(actor);

            this.renderedComponent = nextRenderedComponent;

            /*replace the old subtree with the new subtree in the DOM*/
            prevNode.replaceWith(nextNode);
        }
    }

    /**@abstract
     *
     * @param actor {Actor}: The last seen asynchronous component
     * */
    mount(actor) {
        return null;
    }

    /**@abstract*/
    receive(nextElement, actor) {
        return null;
    }

    unmount() {
        /*Propagate unmount call to our rendered component (HTML DOM node)*/

        this.publicInstance.componentWillUnmount();

        this.renderedComponent.unmount();

        this.publicInstance.componentDidUnmount();
    }
}

/**@class Manager for a synchronous component
 * */
class SyncManager extends CompositeManager {
    constructor(element) {
        super(element);
    }

    mount(actor) {
        /*Our JSX object*/
        const element = this.currentElement;
        /*The type of our component, which will be a class*/
        const type    = element.elementName;
        /*The JSX attributes, which we will use as props*/
        const props   = element.attributes;


        /*Create an instance and pass the props*/
        const publicInstance = new type({
            ...props
        });

        publicInstance.proxy = this;

        /*Render the element*/
        const renderedElement = publicInstance.render();

        /*Save the instance*/
        this.publicInstance = publicInstance;

        if(renderedElement !== null) {
            /*The JSX received from calling our render method will be transformed to a Manager and saved*/
            const renderedComponent = instantiateManager(renderedElement);
            this.renderedComponent = renderedComponent;

            publicInstance.componentWillMount();
            /*We return our subtree of HTML DOM nodes by recursively calling mount on our children*/
            return renderedComponent.mount(actor);
        } else {
            return null;
        }
    }

    receive(nextElement, actor) {
        /*Get our instance of the Akkomponent*/
        const publicInstance = this.publicInstance;

        /*Replace our current element with the new element received*/
        this.currentElement = nextElement;

        publicInstance.componentWillUpdate(nextElement.attributes, publicInstance.state);

        const oldProps = publicInstance.props;
        const oldState = publicInstance.state;

        /*Modify props and re-render*/
        publicInstance.props = nextElement.attributes;
        const nextRenderedElement = publicInstance.render();

        publicInstance.componentDidUpdate(oldProps, oldState);

        /*Now diff the two versions to see if anything changed*/
        this.diff(nextRenderedElement, actor);
    }
}

/**@class Manager for an asynchronous component
 * */
class AsyncManager extends CompositeManager {
    constructor(element) {
        super(element);

        this.publicInstanceActor = null;
        this.actor = system.spawn(new AsyncManagerDelegator(this));
    }


    mount(actor) {
        /*Our JSX object*/
        const element = this.currentElement;
        /*The type of our component, which will be a class*/
        const type    = element.elementName;
        /*The JSX attributes, which we will use as props*/
        const props   = element.attributes;


        /*Create an instance and pass the props*/
        this.publicInstance = new type({
            ...props,
            proxy: this
        });

        this.publicInstanceActor = system.spawn(this.publicInstance);

        /*We need a placeholder for the to-be-rendered AsyncComponent. Use either the old node or create a new empty node*/
        const placeholder = instantiateManager(this.publicInstance.placeholder);

        this.publicInstance.componentIsPlaceheld();

        this.renderedComponent = placeholder;

        /*Tell our actor we are going to mount and provide the placeholder where it should be mounted to*/
        //publicInstance.actor.tell({method: 'mount', placeholder: placeholder, actor: publicInstance.actor}, this.actor);
        this.publicInstanceActor.tell({method: 'mount', placeholder: placeholder, actor: this.publicInstanceActor}, this.actor);

        return placeholder.mount(this.actor);
    }

    receive(nextElement, actor) {
        this.publicInstance.componentWillUpdate(nextElement.attributes, this.publicInstance.state);
        this.publicInstanceActor.tell({method: 'receive', props: nextElement.attributes, actor: this.publicInstanceActor}, this.actor);
    }
}

/**@actor AsyncManagerDelegator
 * Awaits returning value from the AsyncComponent actor
 * */
class AsyncManagerDelegator extends akkajs.Actor {
    constructor(compositeComponent) {
        super();

        this.compositeComponent = compositeComponent;
        this.receive = this.receive.bind(this);
    }

    receive(call) {
        switch(call.method) {
            case 'receive': {
                const publicInstance = this.compositeComponent.publicInstance;
                publicInstance.componentDidUpdate(this.compositeComponent.renderedComponent.currentElement.attributes, publicInstance.state);
                this.compositeComponent.diff(call.nextRenderedElement, call.actor);
                break;
            }
            case 'mount': {
                const {renderedElement, placeholder} = call;
                const publicInstance = this.compositeComponent.publicInstance;
                const actor = this.compositeComponent.publicInstanceActor;

                if(renderedElement !== null) {
                    /*Convert all the functions provided to the rendered element with messages*/
                    const attributes = Object.fromEntries(
                        Object.entries(renderedElement.attributes)
                            .map(([key, value]) => {
                                if(typeof value === "function")
                                    return [key, () => actor.tell({method: "event", event: value})];
                                else
                                    return [key, value];
                            })
                    );

                    const renderedComponent = instantiateManager({...renderedElement, attributes});
                    this.compositeComponent.renderedComponent = renderedComponent;

                    publicInstance.componentWillMount();

                    const mounted = renderedComponent.mount(call.actor);
                    placeholder.getHostNode().replaceWith(mounted);

                    publicInstance.componentDidMount();
                } else {
                    placeholder.getHostNode().remove();
                }
                break;
            }
            case 'event': {
                call.cb();
                break;
            }
        }
    }
}

/**@class PrimitiveManager
 * This is the proxy for a DOM component, such as <div>, <button>, etc.
 * */
class PrimitiveManager extends Manager{
    constructor(element) {
        super(element);
        /**@property the ProxyComponents of all its children*/
        this.renderedChildren = [];
        /**@property The DOM node that is currently mounted in the DOM*/
        this.node = null;
    }

    getPublicInstance() {
        return this.node;
    }

    getHostNode() {
        return this.node;
    }

    setAttributes(prevProps, nextProps, actor) {
        /*Remove old attributes*/
        Object.keys(prevProps).forEach(propName => {
            if(!nextProps.hasOwnProperty(propName))
                if(/^on/.test(propName)) {
                    const type = propName.toLowerCase().replace('on', '');
                    const eventListeners = this.node.getEventListeners(type);
                    eventListeners.forEach(eventListener => this.node.removeEventListener(type, eventListener.listener))
                } else
                    this.node.removeAttribute(propName, nextProps[propName])
        });
        /*Set new attributes*/
        Object.keys(nextProps).forEach(propName => {
            if(!prevProps.hasOwnProperty(propName))
                if(/^on/.test(propName)) {
                    this.node.addEventListener(propName.toLowerCase().replace('on', ''), actor ? () => actor.tell({method: 'event', event: nextProps[propName]}) : nextProps[propName]);
                }
                else
                    this.node.setAttribute(propName, nextProps[propName])
        });
        /*Change updated attributes*/
        Object.keys(nextProps).forEach(key => {
            const prevValue = prevProps[key];
            const nextValue = nextProps[key];

            if(prevValue !== undefined && nextValue !== undefined) {
                if(prevValue !== nextValue) {
                    if(/^on/.test(key)) {
                        const type = key.toLowerCase().replace('on', '');
                        const eventListeners = this.node.getEventListeners(type);
                        eventListeners.forEach(eventListener => this.node.removeEventListener(type, eventListener.listener));
                        this.node.addEventListener(key.toLowerCase().replace('on', ''), actor ? () => actor.tell({method: 'event', event: nextProps[key]}) : nextProps[key]);
                    } else {
                        this.node.removeAttribute(key, prevValue);
                        this.node.setAttribute(key, nextValue);
                    }
                }
            }
        })
    }

    mount(actor) {
        /*The JSX object*/
        const element  = this.currentElement;
        /*The type (div, button, ...) of the HTML node*/
        const type     = element.elementName;
        /*The JSX attributes*/
        const props    = element.attributes;
        /*The children defined between enclosing JSX tags*/
        const children = element.children || [];
        /*Create an empty node of the correct type*/
        const node = document.createElement(type);
        /*Save this node*/
        this.node  = node;

        this.setAttributes({}, props, actor);

        /*For every child, create their Manager and save them*/
        const renderedChildren = children.flatMap(instantiateManager);
        this.renderedChildren  = renderedChildren;

        /*Every child should return HTML nodes and each of these children should be mounted to the DOM*/
        const childNodes = renderedChildren.map(child => child.mount(actor));
        childNodes
            .flat()
            .forEach(childNode => node.appendChild(childNode));
        renderedChildren.forEach(renderedChild => {
            if(renderedChild instanceof SyncManager)
                renderedChild.getPublicInstance().componentDidMount();
        });

        /*Return generated HTML*/
        return node;
    }

    unmount() {
        /*Unmount all its children*/
        this.renderedChildren.forEach(child => child.unmount())
        //this.node.remove();
    }

    receive(nextElement, actor) {
        /*Our current HTML subtree*/
        const node = this.node;
        /*Our current JSX object*/
        const prevElement = this.currentElement;
        /*Our current JSX attributes (=== props)*/
        const prevProps = prevElement.attributes;
        /*Our new props*/
        const nextProps = nextElement.attributes;
        this.currentElement = nextElement;

        this.setAttributes(prevProps, nextProps, actor);

        /*Get the children. Children can be null when it is a self-closing tag. If that's the case just return an empty array*/
        const prevChildren = prevElement.children || [];
        const nextChildren = nextElement.children || [];

        /*Collect the current children and create an empty array where we will store all the new children*/
        const prevRenderedChildren = this.renderedChildren;
        const nextRenderedChildren = [];

        /*Queue where we will keep all operations concerning adding replacing, or removing child nodes*/
        const operationQueue = [];

        for(let i = 0; i < nextChildren.length; i++) {
            /*JSX object of the next child*/
            const nextChild = nextChildren[i];
            /*JSX object of the current child*/
            const prevChild = prevChildren[i];
            /*Manager of the current child*/
            const prevRenderedChild = prevRenderedChildren[i];

            if(prevRenderedChild === undefined || prevChild === undefined) {
                /*If the Manager does not exist (index out of range), the child should be added*/

                const nextRenderedChild = instantiateManager(nextChild);
                const node = nextRenderedChild.mount(actor);

                operationQueue.push({type: 'ADD', node});
                nextRenderedChildren.push(nextRenderedChild);
            } else if(prevChild.elementName !== nextChild.elementName) {
                /*If the type (elementName) is not the same (e.g. <div> != <span>) or the children are innerHTMLs and they differ (e.g. 'Hello World' != 'Goodbye World')*/
                const prevNode = prevRenderedChild.getHostNode();
                prevRenderedChild.unmount();

                const nextRenderedChild = instantiateManager(nextChild);
                const nextNode = nextRenderedChild.mount(actor);

                operationQueue.push({type: 'REPLACE', prevNode, nextNode});
                nextRenderedChildren.push(nextRenderedChild);
            } else {
                /*It's the same, continue looking for potential differences deeper in the tree*/
                prevRenderedChild.receive(nextChild, actor);
                nextRenderedChildren.push(prevRenderedChild);
            }
        }

        /*Remove all the children that are too many*/
        for(let j = nextChildren.length; j < prevChildren.length; j++) {
            const prevChild = prevRenderedChildren[j];
            const node = prevChild.getHostNode();

            prevChild.unmount();

            operationQueue.push({type: 'REMOVE', node});
        }

        this.renderedChildren = nextRenderedChildren;

        /*Move through the queue. Add/Replace/Remove any children*/
        while (operationQueue.length > 0) {
            const operation = operationQueue.shift();
            switch (operation.type) {
                case 'ADD':
                    this.node.appendChild(operation.node);
                    break;
                case 'REPLACE':
                    this.node.replaceChild(operation.nextNode, operation.prevNode);
                    break;
                case 'REMOVE':
                    this.node.removeChild(operation.node);
                    break;
            }
        }
    }
}

/**@class InnerHTMLManager
 * This is the manager for inner HTML (strings, numbers, ...)
 * */
class InnerHTMLManager extends Manager {
    constructor(element) {
        super(element);
        this.innerHTML = null
    }

    getPublicInstance() {
        return this.currentElement
    }

    getHostNode() {
        return this.innerHTML
    }

    mount(actor) {
        /*Simply create a text node*/
        this.innerHTML = document.createTextNode(this.currentElement);
        return this.innerHTML
    }

    unmount() {
        /*Unmount is (apparently) unnecessary*/
        return null;
    }

    receive(nextElement, actor) {
        if(this.innerHTML.textContent !== nextElement.toString()) {
            const newInnerHTML = document.createTextNode(nextElement);
            this.innerHTML.replaceWith(newInnerHTML);
            this.innerHTML = newInnerHTML;
        }
        return null;
    }
}

/**
 * This is the manager for arrays of values
 * */
class ArrayManager extends Manager {
    constructor(elements) {
        super(elements);

        this.renderedElements = []
    }

    getHostNode() {
        return this.renderedElements.map(renderedElement => renderedElement.getHostNode())[0];
    }

    getPublicInstance() {
        /*Not necessary*/
        return null;
    }

    mount(actor) {
        const elements = this.currentElement;

        let renderedElements = elements.flatMap(instantiateManager);

        if(renderedElements.length === 0) {
            const placeholder = instantiateManager({elementName: 'empty', attributes: {}, children: []});
            this.renderedElements = [placeholder]
        } else {
            this.renderedElements = renderedElements
        }

        const mounted = this.renderedElements.map(renderedElement => renderedElement.mount(actor));
        const nodesFragment = document.createDocumentFragment();
        mounted.forEach(mount => nodesFragment.appendChild(mount));

        return nodesFragment
    }

    receive(nextElements, actor) {
        let reference = this.renderedElements[0];

        if(nextElements.some(nextElement => nextElement.attributes.key === undefined))
            console.warn(`Keys for the anonymous array of ${nextElements[0].elementName.name} components are not provided. Please provide a unique key for every instance to keep their states saved.`);

        /*Unmount all the rendered elements without a key attribute and those with a key attribute that no longer appears in the next elements*/
        const prevRenderedElements = this.renderedElements.filter((renderedElement, i) => {
            if (renderedElement.currentElement.attributes.key !== undefined &&
                nextElements.find(nextElement =>
                    nextElement.attributes.key === renderedElement.currentElement.attributes.key)) {
                return true;
            } else if(i !== 0) {
                renderedElement.unmount();
                renderedElement.getHostNode().remove();
                return false;
            } else {
                const newReference = instantiateManager({elementName: 'empty', attributes: {}, children: []});
                const newReferenceMounted = newReference.mount(actor);

                reference.getHostNode().replaceWith(newReferenceMounted);
                reference = newReference;

                return false;
            }
        });



        /*Diff the nextRenderedElements with the remaining prevRenderedElements and add all new ones*/
        const nextRenderedElements = nextElements.reduce((arr, nextElement, i) => {
            if(nextElement.attributes.key !== undefined) {
                const prevRenderedElement = prevRenderedElements.find(prevRenderedElement => prevRenderedElement.currentElement.attributes.key === nextElement.attributes.key)
                if(prevRenderedElement) {
                    prevRenderedElement.receive(nextElement, actor);
                    return [...arr, prevRenderedElement]
                }
            }
            const nextRenderedElement = instantiateManager(nextElement);
            const nextNode = nextRenderedElement.mount(actor);
            const sibling = arr[i - 1];

            if(sibling) {
                sibling.getHostNode().after(nextNode);
            } else if(reference.currentElement.elementName === 'empty') {
                reference.getHostNode().replaceWith(nextNode);
            } else {
                reference.getHostNode().before(nextNode);
            }

            return [...arr, nextRenderedElement]
        }, []);

        if(nextRenderedElements.length !== 0)
            this.renderedElements = nextRenderedElements;
        else
            this.renderedElements = [reference];
    }

    unmount() {
        this.renderedElements.forEach(renderedElement => renderedElement.unmount())
    }
}

/**@function Factory pattern to create correct Managers
 * Anything that is not a function or string is considered an InnerHTMLManager
 * */
export default function instantiateManager(element) {
    if(Array.isArray(element))
        return new ArrayManager(element);
    else if(typeof element !== 'object')
        return new InnerHTMLManager(element);
    else if(typeof element.elementName === 'string')
        return new PrimitiveManager(element);
    else if(element.elementName.prototype instanceof SyncComponent)
        return new SyncManager(element);
    else if(element.elementName.prototype instanceof AsyncComponent)
        return new AsyncManager(element);
}