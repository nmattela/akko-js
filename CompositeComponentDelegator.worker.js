import instantiateComponent from "./ProxyComponent";

let compositeComponent = null;

onmessage = call => {
    switch(call.data.method) {
        case 'init': {
            compositeComponent = call.data.compositeComponent;
            break;
        }
        case 'receive': {
            const publicInstance = compositeComponent.publicInstance;
            publicInstance.componentDidUpdate(publicInstance.props, publicInstance.state);
            compositeComponent.diff(call.data.nextRenderedElement);
            break;
        }
        case 'mount': {
            const {renderedElement, publicInstance, placeholder} = call.data;
            compositeComponent.publicInstance = publicInstance;
            const renderedComponent = instantiateComponent(renderedElement);
            compositeComponent.renderedComponent = renderedComponent;

            publicInstance.componentWillMount();

            const mounted = renderedComponent.mount();
            placeholder.getHostNode().replaceWith(mounted);

            publicInstance.componentDidMount();
        }
    }
};