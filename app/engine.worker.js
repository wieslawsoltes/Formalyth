import {Engine} from '../packages/tasks/engine.js';
import {transferableCopy} from '../packages/tasks/index.js';
const engine = new Engine();
self.onmessage = ({data: {id, type, payload}}) => {
  try {
    const result = transferableCopy(engine.dispatch(type, payload));
    self.postMessage({id, kind:'result', value:result.value}, result.transfer);
  } catch (error) { self.postMessage({id, kind:'error', name:error.name, message:error.message, code:error.code}); }
};
