'use strict';

// dispatch-pointer.cjs — the one-line `prompt` every build-*-dispatch script emits.
//
// The dispatch scripts write the rendered subagent prompt to a file and hand the controller a
// short pointer to send instead of the prompt body. The pointer is read by TWO models: the
// controller that relays it, and the subagent that receives it. The first wording ("Your
// complete instructions for this dispatch are in <file>. Read that file in full before doing
// anything else…") was addressed to "you", and the controller took it as its own instruction:
// a controller that opens the file tends to execute the procedure itself instead of dispatching
// it. So the pointer names its two readers and gives each one its own action.
//
// One wording for every script: a guard, a grader or a later A/B that recognises the pointer
// keys off this module, never off a copy of the sentence.

const path = require('path');

const PREFIX = 'Instructions for the dispatched agent are in ';
const AGENT = 'If you are that agent, read the whole file before doing anything else and follow it exactly.';
const DISPATCHER = 'If you are the one dispatching, send this prompt unchanged and do not open the file.';

/** The pointer for an absolute prompt-file path. */
function pointerPrompt(promptFile) {
  if (typeof promptFile !== 'string' || !path.isAbsolute(promptFile)) {
    throw new Error(`pointerPrompt needs an absolute prompt-file path, got ${JSON.stringify(promptFile)}`);
  }
  if (/[\r\n]/.test(promptFile)) throw new Error('pointerPrompt: a prompt-file path cannot contain a newline');
  return `${PREFIX}${promptFile}. ${AGENT} ${DISPATCHER}`;
}

/** The prompt-file path a pointer names, or null when the text is not exactly a pointer. */
function promptFileOf(prompt) {
  if (typeof prompt !== 'string' || !prompt.startsWith(PREFIX) || /[\r\n]/.test(prompt)) return null;
  const suffix = `. ${AGENT} ${DISPATCHER}`;
  if (!prompt.endsWith(suffix)) return null;
  const file = prompt.slice(PREFIX.length, prompt.length - suffix.length);
  return path.isAbsolute(file) ? file : null;
}

module.exports = { pointerPrompt, promptFileOf, PREFIX, AGENT, DISPATCHER };
