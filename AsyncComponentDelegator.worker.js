let akkomponent = null;

onmessage = async call => {
    console.log("I received a message: ", call)
    switch(call.data.method) {
        case 'init': {
            akkomponent = call.data.akkomponent;
            break;
        }
        case 'receive': {
            akkomponent.props = call.data.props;
            postMessage({
                method: 'receive',
                nextRenderedElement: await akkomponent.render()
            });
            break;
        }
        case 'mount': {
            postMessage({
                method: 'mount',
                renderedElement: await akkomponent.render(),
                publicInstance: akkomponent,
                placeholder: call.data.placeholder
            });
            break;
        }
    }
};