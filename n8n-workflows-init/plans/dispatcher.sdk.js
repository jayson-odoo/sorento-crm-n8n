import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

// redis pop auto-parses the numeric phone into a NUMBER. Keys tolerate it (concat),
// but redis push messageData and the executeWorkflow string input require String().
const C = "{{ $('pop-ready-contacts').first().json.contact }}";
const CS = "{{ String($('pop-ready-contacts').first().json.contact) }}";

const fireHook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'fire-hook', parameters: { httpMethod: 'POST', path: 'zz-dispatch-test', options: {} }, position: [-600, 0] },
  output: [{ body: {} }]
});
const dispatchTrigger = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.2,
  config: { name: 'Dispatch Trigger', parameters: { inputSource: 'passthrough' }, position: [-600, 200] },
  output: [{}]
});

const popReady = node({
  type: 'n8n-nodes-base.redis', version: 1,
  config: { name: 'pop-ready-contacts', parameters: { operation: 'pop', list: 'ready-contacts-test', propertyName: 'contact', tail: false, options: {} }, position: [-360, 100] },
  output: [{ contact: '437264483' }]
});

const hasContact = ifElse({
  version: 2.3,
  config: {
    name: 'has-contact?', position: [-140, 100],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
      { id: 'c1', leftValue: expr('{{ $json.contact }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }
    ] } }
  }
});

const getLock = node({
  type: 'n8n-nodes-base.redis', version: 1,
  config: { name: 'get-lock', parameters: { operation: 'get', key: expr('test:lock:' + C), propertyName: 'lockval', keyType: 'string', options: {} }, position: [80, 40] },
  output: [{ lockval: null }]
});

const lockFree = ifElse({
  version: 2.3,
  config: {
    name: 'lock-free?', position: [300, 40],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
      { id: 'c1', leftValue: expr('{{ $json.lockval }}'), operator: { type: 'string', operation: 'empty', singleValue: true }, rightValue: '' }
    ] } }
  }
});

const rearmBusy = node({
  type: 'n8n-nodes-base.redis', version: 1,
  config: { name: 'rearm-busy', parameters: { operation: 'push', list: 'ready-contacts-test', messageData: expr(CS), tail: true }, position: [520, 220] },
  output: [{}]
});

const incrLock = node({
  type: 'n8n-nodes-base.redis', version: 1,
  config: { name: 'incr-lock', parameters: { operation: 'incr', key: expr('test:lock:' + C), expire: true, ttl: 120 }, position: [520, -40] },
  output: [{ 'test:lock:437264483': 1 }]
});

const acquired = ifElse({
  version: 2.3,
  config: {
    name: 'acquired?', position: [740, -40],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
      { id: 'c1', leftValue: expr('{{ Object.values($json)[0] }}'), operator: { type: 'number', operation: 'equals' }, rightValue: 1 }
    ] } }
  }
});

const rearmLost = node({
  type: 'n8n-nodes-base.redis', version: 1,
  config: { name: 'rearm-lost', parameters: { operation: 'push', list: 'ready-contacts-test', messageData: expr(CS), tail: true }, position: [960, 160] },
  output: [{}]
});

const callSpine = node({
  type: 'n8n-nodes-base.executeWorkflow', version: 1.3,
  config: {
    name: 'call-spine', position: [960, -120], onError: 'continueErrorOutput',
    parameters: {
      workflowId: { __rl: true, mode: 'list', value: 'txiPzSxy3Pclsz6v', cachedResultName: 'sorento-consume-main TEST' },
      workflowInputs: { mappingMode: 'defineBelow', value: { contact: expr(CS) }, matchingColumns: [], schema: [
        { id: 'contact', displayName: 'contact', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false }
      ], attemptToConvertTypes: false, convertFieldsToString: true },
      options: { waitForSubWorkflow: true }
    }
  },
  output: [{}]
});

const delLock = node({
  type: 'n8n-nodes-base.redis', version: 1,
  config: { name: 'del-lock', parameters: { operation: 'delete', key: expr('test:lock:' + C) }, position: [1200, -40] },
  output: [{}]
});

const llenQ = node({
  type: 'n8n-nodes-base.redis', version: 1,
  config: { name: 'llen-q', parameters: { operation: 'llen', list: expr('test:q:' + C) }, position: [1420, -40] },
  output: [{ 'test:q:437264483': 0 }]
});

const moreQ = ifElse({
  version: 2.3,
  config: {
    name: 'more-in-queue?', position: [1640, -40],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
      { id: 'c1', leftValue: expr('{{ Object.values($json)[0] }}'), operator: { type: 'number', operation: 'gt' }, rightValue: 0 }
    ] } }
  }
});

const rearmMore = node({
  type: 'n8n-nodes-base.redis', version: 1,
  config: { name: 'rearm-more', parameters: { operation: 'push', list: 'ready-contacts-test', messageData: expr(CS), tail: true }, position: [1860, -120] },
  output: [{}]
});

const endNoop = node({
  type: 'n8n-nodes-base.noOp', version: 1,
  config: { name: 'done', position: [1860, 120] },
  output: [{}]
});

export default workflow('zz-dispatcher-test', 'zz-dispatcher-test')
  .add(fireHook).to(popReady)
  .add(dispatchTrigger).to(popReady)
  .add(popReady).to(
    hasContact
      .onTrue(getLock.to(
        lockFree
          .onTrue(incrLock.to(
            acquired
              .onTrue(callSpine)
              .onFalse(rearmLost.to(endNoop))
          ))
          .onFalse(rearmBusy.to(endNoop))
      ))
      .onFalse(endNoop)
  )
  .add(callSpine).to(delLock).to(llenQ).to(
    moreQ.onTrue(rearmMore.to(endNoop)).onFalse(endNoop)
  )
  .add(callSpine.onError(delLock));
