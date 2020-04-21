import akkajs from 'akkajs';
import {AsyncComponent, SyncComponent, system} from "./index";
import 'geteventlisteners';
import $worker from 'inline-web-worker';

/**
 * Code based on the React Implementation Notes https://reactjs.org/docs/implementation-notes.html
 *
 * This code is similar (but not identical) to the implementation of React prior to version 16 (Akko does not use fibers)
 * It is based on Paul O'Shannessy's "Building React from Scratch" talk
 * */

/** @class ProxyComponent (abstract)
 * The Proxy Component serves as a representation for Akkomponents and HTML DOM nodes in the backend of the library, hidden from the user.
 * It manages information such as:
 * - The current element (The object returned from _jsx)
 * - The ProxyComponent that we received as result from the Akkomponent's render method
 * - The instance of the Akkomponent
 * */
class ProxyComponent {
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

    /**@abstract Gets the public instance (Akkomponent instance or DOM node)*/
    getPublicInstance() {
        return null;
    }

    /**@abstract Gets the "platform specific" node (in our case also a DOM node)*/
    getHostNode() {
        return null;
    }

    /**@abstract Instructions on what to do when mounting the component/DOM node
     *
     * @param actor {Actor}
     * */
    mount() {
        return null;
    }

    /**@abstract Instructions on what to do when unmounting the component/DOM node*/
    unmount() {
        return null;
    }

    /**@abstract Instructions on what to do when receiving an update
     *
     * @param nextElement {object}: A potentially updated JSX object that should be diffed
     * @param actor {Actor}
     *
     * */
    receive(nextElement) {
        return null;
    }
}

/**@class CompositeComponent
 * This is the proxy for an Akkomponent. An Akkomponent is for our purposes a collection of DOM nodes.
 * */
class CompositeComponent extends ProxyComponent{
    constructor(element) {
        super(element);

        /**@property The ProxyComponent that we received from our render method*/
        this.renderedComponent = null;
        /**@property The actual Akkomponent instance created during mount*/
        this.publicInstance = null;
    }

    getPublicInstance() {
        return this.publicInstance
    }

    getHostNode() {
        return this.renderedComponent.getHostNode();
    }

    /**@method Compare differences between old and new element, and replace if necessary*/
    diff(nextRenderedElement) {
        /*The ProxyComponent returned from our render method*/
        const prevRenderedComponent = this.renderedComponent;
        /*The JSX object of our rendered ProxyComponent*/
        const prevRenderedElement = prevRenderedComponent.currentElement;

        if(Array.isArray(prevRenderedElement)) {
            prevRenderedComponent.receive(nextRenderedElement)
        } else if(prevRenderedElement.elementName === nextRenderedElement.elementName) {
            /*If the element names are the same, there is no need to remount the current DOM subtree*/
            prevRenderedComponent.receive(nextRenderedElement);
        } else {
            /*Otherwise, we should remount it*/
            /*Gets the node currently inside the DOM tree*/
            const prevNode = prevRenderedComponent.getHostNode();

            /*Unmount the old subtree*/
            prevRenderedComponent.unmount();
            /*Create a new ProxyComponent for the new result of calling render and mount it*/
            const nextRenderedComponent = instantiateComponent(nextRenderedElement);
            const nextNode = nextRenderedComponent.mount();

            this.renderedComponent = nextRenderedComponent;

            /*replace the old subtree with the new subtree in the DOM*/
            prevNode.replaceWith(nextNode);
        }
    }

    /**@abstract
     *
     * */
    mount() {
        return null;
    }

    /**@abstract*/
    receive(nextElement) {
        return null;
    }

    unmount() {
        /*Propagate unmount call to our rendered component (HTML DOM node)*/

        this.publicInstance.componentWillUnmount();

        this.renderedComponent.unmount();

        this.publicInstance.componentDidUnmount();
    }
}

class SyncCompositeComponent extends CompositeComponent {
    constructor(element) {
        super(element);
    }

    mount() {
        /*Our JSX object*/
        const element = this.currentElement;
        /*The type of our component, which will be a class*/
        const type    = element.elementName;
        /*The JSX attributes, which we will use as props*/
        const props   = element.attributes;


        /*Create an instance and pass the props*/
        const publicInstance = new type({
            ...props,
            proxy: this
        });

        /*Render the element*/
        const renderedElement = publicInstance.render();

        /*Save the instance*/
        this.publicInstance = publicInstance;

        /*The JSX received from calling our render method will be transformed to a ProxyComponent and saved*/
        const renderedComponent = instantiateComponent(renderedElement);
        this.renderedComponent = renderedComponent;

        publicInstance.componentWillMount();
        /*We return our subtree of HTML DOM nodes by recursively calling mount on our children*/
        return renderedComponent.mount();
    }

    receive(nextElement) {
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
        this.diff(nextRenderedElement);
    }
}

class AsyncCompositeComponent extends CompositeComponent {
    constructor(element) {
        super(element);
    }


    mount() {
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

        /*We need a placeholder for the to-be-rendered AsyncComponent. Use either the old node or create a new empty node*/
        const placeholder = instantiateComponent(this.publicInstance.placeholder);

        this.publicInstance.componentIsPlaceheld();

        this.renderedComponent = placeholder;

        /*Tell our actor we are going to mount and provide the placeholder where it should be mounted to*/
        //publicInstance.actor.tell({method: 'mount', placeholder: placeholder, actor: publicInstance.actor}, this.actor);
        //this.publicInstanceActor.tell({method: 'mount', placeholder: placeholder, actor: this.publicInstanceActor}, this.actor);


        $worker()
            .create(msg => {
                const {render, state, props} = JSON.parse(msg.data);
                console.log(state, props)
                const evalRender = eval(render);
                console.log(evalRender)
                const result = evalRender(state, props);
                console.log(result)
                self.postMessage(result);
            })
            .run(JSON.stringify({
                render: `(state, props) => ${this.publicInstance.render.toString().slice(this.publicInstance.render.toString().indexOf("{") - 1, this.publicInstance.render.toString().lastIndexOf("}") + 1)}`,
                state: this.publicInstance.state,
                props: props
            }))
            .then(msg => {
                const renderedElement = msg.data;

                const renderedComponent = instantiateComponent(renderedElement);
                this.renderedComponent = renderedComponent;

                this.publicInstance.componentWillMount();

                const mounted = renderedComponent.mount();
                placeholder.getHostNode().replaceWith(mounted);

                this.publicInstance.componentDidMount();
            });

        return placeholder.mount();
    }

    receive(nextElement) {
        console.log(`Async received: `, nextElement)
        this.publicInstance.componentWillUpdate(nextElement.attributes, this.publicInstance.state);
        //this.publicInstanceActor.tell({method: 'receive', props: nextElement.attributes, actor: this.publicInstanceActor}, this.actor);
    }
}

/**@actor CompositeComponentDelegator
 * Simply calls diff when AsyncComponentDelegator returned the result from calling render()
 * */
class CompositeComponentDelegator extends akkajs.Actor {
    constructor(compositeComponent) {
        super();

        this.compositeComponent = compositeComponent;
        this.receive = this.receive.bind(this);
    }

    receive(call) {
        switch(call.method) {
            case 'receive': {
                const publicInstance = this.compositeComponent.publicInstance;
                publicInstance.componentDidUpdate(publicInstance.props, publicInstance.state);
                this.compositeComponent.diff(call.nextRenderedElement);
                break;
            }
            case 'mount': {
                const {renderedElement, placeholder} = call;
                const renderedComponent = instantiateComponent(renderedElement);
                this.compositeComponent.renderedComponent = renderedComponent;

                this.compositeComponent.publicInstance.componentWillMount();

                const mounted = renderedComponent.mount();
                placeholder.getHostNode().replaceWith(mounted);

                this.compositeComponent.publicInstance.componentDidMount();
                break;
            }
            case 'event': {
                call.cb();
                break;
            }
        }
    }
}

/**@class DOMComponent
 * This is the proxy for a DOM component, such as <div>, <button>, etc.
 * */
class DOMComponent extends ProxyComponent{
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

    setAttributes(prevProps, nextProps) {
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
                    this.node.addEventListener(propName.toLowerCase().replace('on', ''), nextProps[propName]);
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
                        this.node.addEventListener(key.toLowerCase().replace('on', ''), nextProps[key]);
                    } else {
                        this.node.removeAttribute(key, prevValue);
                        this.node.setAttribute(key, nextValue);
                    }
                }
            }
        })
    }

    mount() {
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

        this.setAttributes({}, props);

        /*For every child, create their ProxyComponent and save them*/
        const renderedChildren = children.flatMap(instantiateComponent);
        this.renderedChildren  = renderedChildren;

        /*Every child should return HTML nodes and each of these children should be mounted to the DOM*/
        const childNodes = renderedChildren.map(child => child.mount());
        childNodes.flat().forEach(childNode => {
            node.appendChild(childNode);
        });
        renderedChildren.forEach(renderedChild => {
            if(renderedChild instanceof SyncCompositeComponent)
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

    receive(nextElement) {
        /*Our current HTML subtree*/
        const node = this.node;
        /*Our current JSX object*/
        const prevElement = this.currentElement;
        /*Our current JSX attributes (=== props)*/
        const prevProps = prevElement.attributes;
        /*Our new props*/
        const nextProps = nextElement.attributes;
        this.currentElement = nextElement;

        this.setAttributes(prevProps, nextProps);

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
            /*ProxyComponent of the current child*/
            const prevRenderedChild = prevRenderedChildren[i];

            if(prevRenderedChild === undefined || prevChild === undefined) {
                /*If the ProxyComponent does not exist (index out of range), the child should be added*/

                const nextRenderedChild = instantiateComponent(nextChild);
                const node = nextRenderedChild.mount();

                operationQueue.push({type: 'ADD', node});
                nextRenderedChildren.push(nextRenderedChild);
            } else if(prevChild.elementName !== nextChild.elementName || (typeof prevChild !== 'object' && typeof nextChild !== 'object' && prevChild !== nextChild)) {
                /*If the type (elementName) is not the same (e.g. <div> != <span>) or the children are innerHTMLs and they differ (e.g. 'Hello World' != 'Goodbye World')*/
                const prevNode = prevRenderedChild.getHostNode();
                prevRenderedChild.unmount();

                const nextRenderedChild = instantiateComponent(nextChild);
                const nextNode = nextRenderedChild.mount();

                operationQueue.push({type: 'REPLACE', prevNode, nextNode});
                nextRenderedChildren.push(nextRenderedChild);
            } else {
                /*It's the same, continue looking for potential differences deeper in the tree*/
                prevRenderedChild.receive(nextChild);
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

/**@class InnerHTMLComponent
 * This is the proxy for inner HTML (strings, numbers, ...)
 * */
class InnerHTMLComponent extends ProxyComponent {
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

    mount() {
        /*Simply create a text node*/
        this.innerHTML = document.createTextNode(this.currentElement);
        return this.innerHTML
    }

    unmount() {
        /*Unmount is (apparently) unnecessary*/
        return null;
    }

    receive(nextElement) {
        /*Do nothing special since everything should be handled by parent*/
        return null;
    }
}

class ArrayProxyComponent extends ProxyComponent {
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

    mount() {
        const elements = this.currentElement;

        let renderedElements = elements.flatMap(instantiateComponent);

        if(renderedElements.length === 0) {
            const placeholder = instantiateComponent({elementName: 'empty', attributes: {}, children: []});
            this.renderedElements = [placeholder]
        } else {
            this.renderedElements = renderedElements
        }

        const mounted = this.renderedElements.map(renderedElement => renderedElement.mount());
        const nodesFragment = document.createDocumentFragment();
        mounted.forEach(mount => nodesFragment.appendChild(mount));

        return nodesFragment
    }

    receive(nextElements) {
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
                const newReference = instantiateComponent({elementName: 'empty', attributes: {}, children: []});
                const newReferenceMounted = newReference.mount();

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
                    prevRenderedElement.receive(nextElement);
                    return [...arr, prevRenderedElement]
                }
            }
            const nextRenderedElement = instantiateComponent(nextElement);
            const nextNode = nextRenderedElement.mount();
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

/**@function Factory pattern to create correct ProxyComponents
 * Anything that is not a function or string is considered an InnerHTMLComponent
 * */
export default function instantiateComponent(element) {
    if(Array.isArray(element))
        return new ArrayProxyComponent(element);
    else if(typeof element !== 'object')
        return new InnerHTMLComponent(element);
    else if(typeof element.elementName === 'string')
        return new DOMComponent(element);
    else if(element.elementName.prototype instanceof SyncComponent)
        return new SyncCompositeComponent(element);
    else if(element.elementName.prototype instanceof AsyncComponent)
        return new AsyncCompositeComponent(element);
}